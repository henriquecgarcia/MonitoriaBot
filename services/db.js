// services/db.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();


// Cria pool a partir de config explícita
function createPool({ host, port, user, password, database, multipleStatements = false }) {
	return mysql.createPool({
		host, port, user, password, database,
		waitForConnections: true,
		connectionLimit: 10,
		queueLimit: 0,
		multipleStatements,
		// charset: 'utf8mb4_unicode_ci',
		// dateStrings: true,
		// timezone: 'Z',
		// supportBigNumbers: true
	});
}

let db = null;
async function initDB() {
	if (db) return db;
	db = createPool({
		host: process.env.BOT_DB_HOST,
		port: process.env.BOT_DB_PORT || 3306,
		user: process.env.BOT_DB_USER,
		password: process.env.BOT_DB_PASS,
		database: process.env.BOT_DB_NAME,
		multipleStatements: true
	});
	// Teste simples
	await testPool(db);
	return db;
}

async function createTables() {
	const pool = await initDB();
	try {
		await pool.execute(`CREATE TABLE IF NOT EXISTS configs (id INT AUTO_INCREMENT PRIMARY KEY, guild_id BIGINT NOT NULL, config_key VARCHAR(100) NOT NULL, config_value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_guild_key (guild_id, config_key) );`);
		console.log(`✅ Tabela de configs criada ou já existente.`);
	} catch (error) {
		console.error('Erro ao criar tabela configs:', error);
		throw error;
	}
	try {

		// Tickets table
		await pool.execute(`CREATE TABLE IF NOT EXISTS tickets (ticket_id INT AUTO_INCREMENT PRIMARY KEY, guild_id BIGINT NOT NULL, channel_id BIGINT NOT NULL, ticket_type VARCHAR(50) NOT NULL, author_id BIGINT NOT NULL, assigned_id BIGINT NULL, status ENUM('open','closed') DEFAULT 'open', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, closed_at TIMESTAMP NULL, closed_by BIGINT NULL, INDEX idx_channel (channel_id), INDEX idx_guild_status (guild_id, status) );`);
		console.log(`✅ Tabela de tickets criada ou já existente.`);
	} catch (error) {
		console.error('Erro ao criar tabela tickets:', error);
		throw error;
	}
}

async function testPool(pool) {
	const conn = await pool.getConnection();
	try { await conn.ping(); } finally { conn.release(); }
}

// Get config value (configs tabela)
async function getConfig(guildId, key) {
	const pool = await initDB();
	const [rows] = await pool.execute('SELECT config_value FROM configs WHERE guild_id = ? AND config_key = ? LIMIT 1', [guildId, key]);
	return rows.length ? rows[0].config_value : null;
}

async function setConfig(guildId, key, value) {
	const pool = await initDB();
	await pool.execute(
		`INSERT INTO configs (guild_id, config_key, config_value) VALUES (?, ?, ?)
			ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
		[guildId, key, value]
	);
	return true;
}

// Tickets (prepared statements)
async function insertTicket(guildId, channelId, type, authorId) {
	const pool = await initDB();
	await pool.execute('INSERT INTO tickets (guild_id, channel_id, ticket_type, author_id) VALUES (?, ?, ?, ?)', [guildId, channelId, type, authorId]);
}
async function assignTicket(guildId, channelId, staffId) {
	const pool = await initDB();
	await pool.execute('UPDATE tickets SET assigned_id = ? WHERE channel_id = ?', [staffId, channelId]);
}
async function closeTicket(channelId, closedBy) {
	const pool = await initDB();
	await pool.execute('UPDATE tickets SET status = "closed", closed_at = CURRENT_TIMESTAMP, closed_by = ? WHERE channel_id = ?', [closedBy, channelId]);
}
async function getTicketByChannel(guildId, channelId) {
	const pool = await initDB();
	const [rows] = await pool.execute('SELECT * FROM tickets WHERE guild_id = ? AND channel_id = ? LIMIT 1', [guildId, channelId]);
	return rows.length ? rows[0] : null;
}
async function hasOpenTicket(guildId, authorId) {
	const pool = await initDB();
	const [rows] = await pool.execute('SELECT 1 FROM tickets WHERE guild_id = ? AND author_id = ? AND status = "open" LIMIT 1', [guildId, authorId]);
	return rows.length > 0;
}

export { db };

export async function query(query, params) {
	const pool = await initDB();
	const [rows] = await pool.execute(query, params);
	return rows;
}

export default {
	initDB,
	getConfig,
	setConfig,
	insertTicket,
	assignTicket,
	closeTicket,
	getTicketByChannel,
	hasOpenTicket,
	query,
	createTables,
};