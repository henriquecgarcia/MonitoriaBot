/**
 * Central Config Service
 *
 * Provides a typed registry over DB-persisted bot settings.
 * Each key is registered once with a type, default value and description.
 * get/set convert automatically between stored strings and JS values.
 */
import db from './db.js';
// ────────────────────────────────────────────────────────────────────────────────
// Type constants
// ────────────────────────────────────────────────────────────────────────────────
const TYPES = Object.freeze({
    ROLE: 'role',
    ROLES: 'roles',
    CHANNEL: 'channel',
    CATEGORY: 'category',
    BOOL: 'bool',
    STRING: 'string',
    NUMBER: 'number',
});
// ────────────────────────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────────────────────────
const registry = new Map();
function normalizeKey(key) {
    return String(key ?? '').trim();
}
function Add(type, key, defaultValue = null, opts = {}) {
    const k = normalizeKey(key);
    if (!k)
        throw new Error('config.Add: key is required');
    const validTypes = Object.values(TYPES);
    if (!validTypes.includes(type))
        throw new Error(`config.Add: invalid type "${type}" for key ${k}`);
    if (!registry.has(k)) {
        registry.set(k, {
            type,
            key: k,
            default: defaultValue ?? null,
            description: opts.description ?? opts.label ?? '',
        });
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
    for (const [k, def] of registry) {
        if (def.type === type)
            out.push(k);
    }
    return out;
}
// ────────────────────────────────────────────────────────────────────────────────
// Serialization helpers
// ────────────────────────────────────────────────────────────────────────────────
function serialize(type, value) {
    switch (type) {
        case TYPES.BOOL:
            return value ? 'true' : 'false';
        case TYPES.ROLES:
            if (Array.isArray(value))
                return value.join(',');
            return value == null ? '' : String(value);
        case TYPES.NUMBER:
            return value == null || isNaN(Number(value)) ? '' : String(Number(value));
        default:
            return value == null ? '' : String(value);
    }
}
function parse(type, raw) {
    const s = raw ?? '';
    switch (type) {
        case TYPES.BOOL:
            return s === 'true' || s === '1' || s === 'yes';
        case TYPES.ROLES:
            return s.split(',').map((x) => x.trim()).filter(Boolean);
        case TYPES.NUMBER:
            return s === '' ? null : Number(s);
        default:
            return s || null;
    }
}
// ────────────────────────────────────────────────────────────────────────────────
// DB-backed get / set
// ────────────────────────────────────────────────────────────────────────────────
async function get(guildId, key) {
    const def = getDefinition(key);
    if (!def) {
        // Unregistered key – return raw DB string
        return db.getConfig(guildId, key);
    }
    const raw = await db.getConfig(guildId, def.key);
    if (raw == null)
        return def.default;
    return parse(def.type, raw);
}
async function set(guildId, key, value) {
    const def = getDefinition(key);
    if (!def) {
        await db.setConfig(guildId, key, value == null ? null : String(value));
        return;
    }
    await db.setConfig(guildId, def.key, serialize(def.type, value));
}
async function getRaw(guildId, key) {
    const k = normalizeKey(key);
    const val = await db.getConfig(guildId, k);
    if (val == null) {
        const def = registry.get(k);
        if (!def)
            return null;
        return serialize(def.type, def.default);
    }
    return String(val);
}
async function setRaw(guildId, key, rawValue) {
    await db.setConfig(guildId, normalizeKey(key), rawValue == null ? null : String(rawValue));
}
// ────────────────────────────────────────────────────────────────────────────────
// Display formatter for Discord
// ────────────────────────────────────────────────────────────────────────────────
function formatValue(key, rawOrTyped, _guild) {
    const def = getDefinition(key);
    const type = def?.type ?? TYPES.STRING;
    let val = rawOrTyped;
    if (typeof rawOrTyped === 'string' && def)
        val = parse(type, rawOrTyped);
    if (val == null || val === '' || (Array.isArray(val) && !val.length))
        return '`(vazio)`';
    if (type === TYPES.ROLE)
        return `<@&${val}>`;
    if (type === TYPES.ROLES)
        return val.map((id) => `<@&${id}>`).join(', ');
    if (type === TYPES.CHANNEL || type === TYPES.CATEGORY)
        return `<#${val}>`;
    if (type === TYPES.BOOL)
        return val ? '`true`' : '`false`';
    return `\`${String(val)}\``;
}
// ────────────────────────────────────────────────────────────────────────────────
// Bootstrap – global keys used by multiple modules
// ────────────────────────────────────────────────────────────────────────────────
// Roles
Add(TYPES.ROLE, 'whitelisted_role', null, { description: 'Cargo para membros whitelisted' });
Add(TYPES.ROLE, 'default_role', null, { description: 'Cargo padrão para novos membros' });
Add(TYPES.ROLE, 'editor_role', null, { description: 'Cargo com permissão para editar configurações' });
Add(TYPES.ROLE, 'staff_role', null, { description: 'Cargo de staff (acesso a comandos restritos)' });
// Log channels
Add(TYPES.CHANNEL, 'whitelist_log_channel', null, { description: 'Canal para logs de whitelist' });
Add(TYPES.CHANNEL, 'ticket_log', null, { description: 'Canal para logs gerais do sistema de tickets' });
Add(TYPES.CHANNEL, 'log_transcript', null, { description: 'Canal para transcripts dos tickets ao fechar' });
Add(TYPES.CHANNEL, 'message_logs', null, { description: 'Canal para logs de mensagens' });
Add(TYPES.CHANNEL, 'user_logs', null, { description: 'Canal para logs de usuários' });
Add(TYPES.CHANNEL, 'member_logs', null, { description: 'Canal para logs de membros' });
Add(TYPES.CHANNEL, 'role_logs', null, { description: 'Canal para logs de cargos' });
Add(TYPES.CHANNEL, 'channel_logs', null, { description: 'Canal para logs de canais' });
Add(TYPES.CHANNEL, 'guild_logs', null, { description: 'Canal para logs de servidor' });
// Ticket settings
Add(TYPES.BOOL, 'ticket_auto_delete', false, { description: 'Apagar o canal automaticamente ao fechar o ticket' });
// ────────────────────────────────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────────────────────────────────
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
