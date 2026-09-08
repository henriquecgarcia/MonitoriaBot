/**
 * Centralized Logger Service
 *
 * Provides structured console logging and safe Discord channel delivery.
 * Format: [DATE] [LEVEL] [ACTION] message
 *
 * Discord delivery never throws – failures are silently ignored so the bot
 * keeps running even if a log channel is misconfigured or unavailable.
 */
import config from './config_handler.js';
function formatTimestamp() {
    return new Date().toISOString();
}
function log(level, action, ...details) {
    const ts = formatTimestamp();
    const prefix = `[${ts}] [${level}] [${action}]`;
    if (level === 'ERROR') {
        console.error(prefix, ...details);
    }
    else if (level === 'WARN') {
        console.warn(prefix, ...details);
    }
    else {
        console.log(prefix, ...details);
    }
}
export const logger = {
    info: (action, ...d) => log('INFO', action, ...d),
    warn: (action, ...d) => log('WARN', action, ...d),
    error: (action, ...d) => log('ERROR', action, ...d),
    debug: (action, ...d) => log('DEBUG', action, ...d),
};
// ────────────────────────────────────────────────────────────────────────────────
// Discord channel delivery
// ────────────────────────────────────────────────────────────────────────────────
/**
 * Sends a message/embed to the Discord log channel identified by `configKey`.
 * Never throws – all errors are caught and printed to the console.
 */
export async function sendDiscordLog(client, guildId, configKey, message) {
    if (!guildId)
        return;
    try {
        const channelId = (await config.get(guildId, configKey));
        if (!channelId)
            return;
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased())
            return;
        // Stamp all embeds with the current timestamp
        if (message.embeds) {
            message.embeds = message.embeds.map((e) => {
                try {
                    if (e && typeof e.setTimestamp === 'function') {
                        return e.setTimestamp();
                    }
                    return e;
                }
                catch {
                    return e;
                }
            });
        }
        await channel.send(message).catch((err) => {
            logger.warn('DISCORD_LOG', `Failed to send to channel ${channelId}:`, err);
        });
    }
    catch (err) {
        // Log delivery must never break the main flow
        logger.warn('DISCORD_LOG', `sendDiscordLog(${configKey}) failed:`, err);
    }
}
