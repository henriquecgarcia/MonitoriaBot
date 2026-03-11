import mysql from 'mysql2/promise';
import type { Pool } from 'mysql2/promise';
import type { TicketRow, TicketStatus } from '../types/index.js';

// ────────────────────────────────────────────────────────────────────────────────
// Pool factory
// ────────────────────────────────────────────────────────────────────────────────

interface PoolConfig {
	host: string;
	port: number;
	user: string;
	password: string;
	database: string;
	multipleStatements?: boolean;
}

function createPool(cfg: PoolConfig): Pool {
	return mysql.createPool({
		host: cfg.host,
		port: cfg.port,
		user: cfg.user,
		password: cfg.password,
		database: cfg.database,
		waitForConnections: true,
		connectionLimit: 10,
		queueLimit: 0,
		multipleStatements: cfg.multipleStatements ?? false,
	});
}

// ────────────────────────────────────────────────────────────────────────────────
// Singleton pool
// ────────────────────────────────────────────────────────────────────────────────

let _pool: Pool | null = null;

async function initDB(): Promise<Pool> {
	if (_pool) return _pool;

	_pool = createPool({
		host: process.env.BOT_DB_HOST!,
		port: Number(process.env.BOT_DB_PORT ?? 3306),
		user: process.env.BOT_DB_USER!,
		password: process.env.BOT_DB_PASS!,
		database: process.env.BOT_DB_NAME!,
		multipleStatements: true,
	});

	await testPool(_pool);
	return _pool;
}

async function testPool(pool: Pool): Promise<void> {
	const conn = await pool.getConnection();
	try {
		await conn.ping();
	} finally {
		conn.release();
	}
}

// ────────────────────────────────────────────────────────────────────────────────
// DDL
// ────────────────────────────────────────────────────────────────────────────────

async function createTables(): Promise<void> {
	const pool = await initDB();

	await pool.execute(`
		CREATE TABLE IF NOT EXISTS configs (
			id           INT AUTO_INCREMENT PRIMARY KEY,
			guild_id     BIGINT      NOT NULL,
			config_key   VARCHAR(100) NOT NULL,
			config_value TEXT,
			updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			UNIQUE KEY uq_guild_key (guild_id, config_key)
		)
	`);
	console.log('✅ Tabela configs verificada.');

	await pool.execute(`
		CREATE TABLE IF NOT EXISTS tickets (
			ticket_id   INT AUTO_INCREMENT PRIMARY KEY,
			guild_id    BIGINT      NOT NULL,
			channel_id  BIGINT      NOT NULL,
			ticket_type VARCHAR(50) NOT NULL,
			author_id   BIGINT      NOT NULL,
			assigned_id BIGINT      NULL,
			status      ENUM('open','closed') DEFAULT 'open',
			created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
			closed_at   TIMESTAMP   NULL,
			closed_by   BIGINT      NULL,
			INDEX idx_channel    (channel_id),
			INDEX idx_guild_status (guild_id, status)
		)
	`);
	console.log('✅ Tabela tickets verificada.');
}

// ────────────────────────────────────────────────────────────────────────────────
// Generic query helper
// ────────────────────────────────────────────────────────────────────────────────

async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
	const pool = await initDB();
	const [rows] = await pool.execute(sql, params);
	return rows as T[];
}

// ────────────────────────────────────────────────────────────────────────────────
// Config operations
// ────────────────────────────────────────────────────────────────────────────────

async function getConfig(guildId: string, key: string): Promise<string | null> {
	const pool = await initDB();
	const [rows] = await pool.execute<mysql.RowDataPacket[]>(
		'SELECT config_value FROM configs WHERE guild_id = ? AND config_key = ? LIMIT 1',
		[guildId, key],
	);
	return rows.length ? (rows[0].config_value as string) : null;
}

async function setConfig(guildId: string, key: string, value: string | null): Promise<void> {
	const pool = await initDB();
	await pool.execute(
		`INSERT INTO configs (guild_id, config_key, config_value) VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
		[guildId, key, value],
	);
}

// ────────────────────────────────────────────────────────────────────────────────
// Ticket operations
// ────────────────────────────────────────────────────────────────────────────────

async function insertTicket(guildId: string, channelId: string, type: string, authorId: string): Promise<void> {
	const pool = await initDB();
	await pool.execute(
		'INSERT INTO tickets (guild_id, channel_id, ticket_type, author_id) VALUES (?, ?, ?, ?)',
		[guildId, channelId, type, authorId],
	);
}

async function assignTicket(guildId: string, channelId: string, staffId: string): Promise<void> {
	const pool = await initDB();
	await pool.execute(
		'UPDATE tickets SET assigned_id = ? WHERE guild_id = ? AND channel_id = ?',
		[staffId, guildId, channelId],
	);
}

async function closeTicket(channelId: string, closedBy: string): Promise<void> {
	const pool = await initDB();
	await pool.execute(
		'UPDATE tickets SET status = "closed", closed_at = CURRENT_TIMESTAMP, closed_by = ? WHERE channel_id = ?',
		[closedBy, channelId],
	);
}

async function getTicketByChannel(guildId: string, channelId: string): Promise<TicketRow | null> {
	if (!guildId || !channelId) throw new Error('getTicketByChannel: guildId e channelId são obrigatórios.');

	const pool = await initDB();
	const [rows] = await pool.execute<mysql.RowDataPacket[]>(
		'SELECT * FROM tickets WHERE guild_id = ? AND channel_id = ? LIMIT 1',
		[guildId, channelId],
	);
	return rows.length ? (rows[0] as unknown as TicketRow) : null;
}

async function hasOpenTicket(guildId: string, authorId: string): Promise<boolean> {
	const pool = await initDB();
	const [rows] = await pool.execute<mysql.RowDataPacket[]>(
		'SELECT 1 FROM tickets WHERE guild_id = ? AND author_id = ? AND status = "open" LIMIT 1',
		[guildId, authorId],
	);
	return rows.length > 0;
}

// ────────────────────────────────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────────────────────────────────

export default {
	initDB,
	createTables,
	query,
	getConfig,
	setConfig,
	insertTicket,
	assignTicket,
	closeTicket,
	getTicketByChannel,
	hasOpenTicket,
};
