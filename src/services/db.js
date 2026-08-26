import mysql from 'mysql2/promise';
import { logger } from './logger.js';
import { getDatabaseConfig } from './env.js';
function createPool(cfg) {
    return mysql.createPool({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        supportBigNumbers: true,
        bigNumberStrings: true,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        multipleStatements: cfg.multipleStatements ?? false,
    });
}
// ────────────────────────────────────────────────────────────────────────────────
// Singleton pool
// ────────────────────────────────────────────────────────────────────────────────
let _pool = null;
async function initDB() {
    if (_pool)
        return _pool;
    _pool = createPool({
        ...getDatabaseConfig(),
        multipleStatements: true,
    });
    try {
        await testPool(_pool);
    }
    catch (error) {
        await _pool.end().catch(() => null);
        _pool = null;
        throw error;
    }
    return _pool;
}
async function close() {
    if (_pool) {
        await _pool.end();
        _pool = null;
    }
}
async function testPool(pool) {
    const conn = await pool.getConnection();
    try {
        await conn.ping();
    }
    finally {
        conn.release();
    }
}
// ────────────────────────────────────────────────────────────────────────────────
// DDL
// ────────────────────────────────────────────────────────────────────────────────
async function createTables() {
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
    logger.info('DB_CREATETABLES', 'Tabela configs verificada/criada.');
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
    logger.info('DB_CREATETABLES', 'Tabela tickets verificada/criada.');
}
// ────────────────────────────────────────────────────────────────────────────────
// Generic query helper
// ────────────────────────────────────────────────────────────────────────────────
async function query(sql, params = []) {
    const pool = await initDB();
    const [rows] = await pool.execute(sql, params);
    return rows;
}
// ────────────────────────────────────────────────────────────────────────────────
// Config operations
// ────────────────────────────────────────────────────────────────────────────────
async function getConfig(guildId, key) {
    const pool = await initDB();
    const [rows] = await pool.execute('SELECT config_value FROM configs WHERE guild_id = ? AND config_key = ? LIMIT 1', [guildId, key]);
    return rows.length ? rows[0].config_value : null;
}
async function setConfig(guildId, key, value) {
    const pool = await initDB();
    await pool.execute(`INSERT INTO configs (guild_id, config_key, config_value) VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`, [guildId, key, value]);
}
// ────────────────────────────────────────────────────────────────────────────────
// Ticket operations
// ────────────────────────────────────────────────────────────────────────────────
async function insertTicket(guildId, channelId, type, authorId) {
    const pool = await initDB();
    await pool.execute('INSERT INTO tickets (guild_id, channel_id, ticket_type, author_id) VALUES (?, ?, ?, ?)', [guildId, channelId, type, authorId]);
}
async function assignTicket(guildId, channelId, staffId) {
    const pool = await initDB();
    await pool.execute('UPDATE tickets SET assigned_id = ? WHERE guild_id = ? AND channel_id = ?', [staffId, guildId, channelId]);
}
async function closeTicket(channelId, closedBy) {
    const pool = await initDB();
    await pool.execute('UPDATE tickets SET status = "closed", closed_at = CURRENT_TIMESTAMP, closed_by = ? WHERE channel_id = ?', [closedBy, channelId]);
}
async function getTicketByChannel(guildId, channelId) {
    if (!guildId || !channelId)
        throw new Error('getTicketByChannel: guildId e channelId são obrigatórios.');
    const pool = await initDB();
    const [rows] = await pool.execute('SELECT * FROM tickets WHERE guild_id = ? AND channel_id = ? LIMIT 1', [guildId, channelId]);
    return rows.length ? rows[0] : null;
}
async function hasOpenTicket(guildId, authorId) {
    const pool = await initDB();
    const [rows] = await pool.execute('SELECT 1 FROM tickets WHERE guild_id = ? AND author_id = ? AND status = "open" LIMIT 1', [guildId, authorId]);
    return rows.length > 0;
}
// ────────────────────────────────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────────────────────────────────
export default {
    initDB,
    close,
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
