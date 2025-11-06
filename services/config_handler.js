// Central Config Service
// - Registry for config keys with type, description and default
// - Typed get/set on top of DB storage
// Usage: config.Add(type, key, defaultValue, { description })

import db from './db.js';

const TYPES = Object.freeze({
	ROLE: 'role',
	ROLES: 'roles',
	CHANNEL: 'channel',
	CATEGORY: 'category',
	BOOL: 'bool',
	STRING: 'string',
	NUMBER: 'number',
});

// key => { type, key, default, description }
const registry = new Map();

function normalizeKey(key) {
	return String(key || '').trim();
}

function Add(type, key, defaultValue = null, opts = {}) {
	const k = normalizeKey(key);
	if (!k) throw new Error('config.Add: key is required');
	if (!type) throw new Error('config.Add: type is required');
	if (!Object.values(TYPES).includes(type)) throw new Error(`config.Add: invalid type "${type}" for key ${k}`);
	if (!registry.has(k)) {
		registry.set(k, { type, key: k, default: defaultValue ?? null, description: opts.description || opts.label || '' });
	}
	return registry.get(k);
}

function getDefinition(key) {
	return registry.get(normalizeKey(key));
}

function allDefinitions() {
	return new Map(registry);
}

function keysByType(type) {
	const out = [];
	for (const [k, def] of registry) if (def.type === type) out.push(k);
	return out;
}

// Raw read (string) with default fallback (as stored-string)
async function getRaw(guildId, key) {
	const k = normalizeKey(key);
	const val = await db.getConfig(guildId, k);
	if (val == null) {
		const def = registry.get(k);
		if (!def) return null;
		return serialize(def.type, def.default);
	}
	return String(val);
}

async function setRaw(guildId, key, rawValue) {
	const k = normalizeKey(key);
	await db.setConfig(guildId, k, rawValue == null ? null : String(rawValue));
	return true;
}

function serialize(type, value) {
	switch (type) {
		case TYPES.BOOL:
			return value ? 'true' : 'false';
		case TYPES.ROLES:
			if (Array.isArray(value)) return value.join(',');
			return value == null ? '' : String(value);
		case TYPES.NUMBER:
			return value == null || isNaN(Number(value)) ? '' : String(Number(value));
		default:
			return value == null ? '' : String(value);
	}
}

function parse(type, raw) {
	const s = raw == null ? '' : String(raw);
	switch (type) {
		case TYPES.BOOL:
			return s === 'true' || s === '1' || s === 'yes';
		case TYPES.ROLES:
			return s.split(',').map(x => x.trim()).filter(Boolean);
		case TYPES.NUMBER:
			return s === '' ? null : Number(s);
		default:
			return s || null;
	}
}

// Typed get (returns JS type). Falls back to default when not set.
async function get(guildId, key) {
	const def = getDefinition(key);
	if (!def) {
		// If not registered, fallback to raw DB string
		return await db.getConfig(guildId, key);
	}
	const raw = await db.getConfig(guildId, def.key);
	if (raw == null) return def.default;
	return parse(def.type, raw);
}

// Typed set: accepts JS value, serializes by type
async function set(guildId, key, value) {
	const def = getDefinition(key);
	if (!def) {
		// Store as-is if not registered
		await db.setConfig(guildId, key, value == null ? null : String(value));
		return true;
	}
	const raw = serialize(def.type, value);
	await db.setConfig(guildId, def.key, raw);
	return true;
}

// Pretty formatter for displaying on Discord
function formatValue(key, rawOrTyped, guild) {
	const def = getDefinition(key);
	const type = def?.type || TYPES.STRING;
	let val = rawOrTyped;
	// If it's the stored string, try to parse to typed first
	if (typeof rawOrTyped === 'string' && def) val = parse(type, rawOrTyped);
	if (val == null || val === '' || (Array.isArray(val) && !val.length)) return '`(vazio)`';
	if (type === TYPES.ROLE) return `<@&${val}>`;
	if (type === TYPES.ROLES) return val.map(id => `<@&${id}>`).join(', ');
	if (type === TYPES.CHANNEL || type === TYPES.CATEGORY) return `<#${val}>`;
	if (type === TYPES.BOOL) return val ? '`true`' : '`false`';
	return `\`${String(val)}\``;
}

// Bootstrap: common/global keys that multiple modules use
// Roles
Add(TYPES.ROLE, 'whitelisted_role', null, { description: 'Cargo para membros whitelisted' });
Add(TYPES.ROLE, 'default_role', null, { description: 'Cargo padrão para novos membros' });
Add(TYPES.ROLE, 'editor_role', null, { description: 'Cargo com permissão para editar configurações' });
Add(TYPES.ROLE, 'staff_role', null, { description: 'Cargo de staff (acesso a comandos restritos)' });

// Channels
Add(TYPES.CHANNEL, 'whitelist_log_channel', null, { description: 'Canal para logs de whitelist' });
Add(TYPES.CHANNEL, 'ticket_log', null, { description: 'Canal para logs gerais do sistema de tickets' });
Add(TYPES.CHANNEL, 'log_transcript', null, { description: 'Canal para transcripts dos tickets ao fechar' });
Add(TYPES.CHANNEL, 'message_logs', null, { description: 'Canal para logs de mensagens' });
Add(TYPES.CHANNEL, 'user_logs', null, { description: 'Canal para logs de usuários' });
Add(TYPES.CHANNEL, 'member_logs', null, { description: 'Canal para logs de membros' });
Add(TYPES.CHANNEL, 'role_logs', null, { description: 'Canal para logs de cargos' });
Add(TYPES.CHANNEL, 'channel_logs', null, { description: 'Canal para logs de canais' });
Add(TYPES.CHANNEL, 'guild_logs', null, { description: 'Canal para logs de servidor' });

// Tickets settings (generic)
Add(TYPES.BOOL, 'ticket_auto_delete', false, { description: 'Apagar o canal automaticamente ao fechar o ticket' });

export default {
	TYPES,
	Add,
	getDefinition,
	allDefinitions,
	keysByType,
	getRaw,
	setRaw,
	get,
	set,
	formatValue,
};