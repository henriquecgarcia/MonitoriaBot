/**
 * Centralized Logger Service
 *
 * Provides structured console logging and safe Discord channel delivery.
 * Format: [DATE] [LEVEL] [ACTION] message
 *
 * Discord delivery never throws – failures are silently ignored so the bot
 * keeps running even if a log channel is misconfigured or unavailable.
 */

import type { Client, EmbedBuilder, MessageCreateOptions } from 'discord.js';
import config from './config_handler.js';

// ────────────────────────────────────────────────────────────────────────────────
// Console logger
// ────────────────────────────────────────────────────────────────────────────────

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function formatTimestamp(): string {
	return new Date().toISOString();
}

function log(level: LogLevel, action: string, ...details: unknown[]): void {
	const ts = formatTimestamp();
	const prefix = `[${ts}] [${level}] [${action}]`;
	if (level === 'ERROR') {
		console.error(prefix, ...details);
	} else if (level === 'WARN') {
		console.warn(prefix, ...details);
	} else {
		console.log(prefix, ...details);
	}
}

export const logger = {
	info: (action: string, ...d: unknown[]) => log('INFO', action, ...d),
	warn: (action: string, ...d: unknown[]) => log('WARN', action, ...d),
	error: (action: string, ...d: unknown[]) => log('ERROR', action, ...d),
	debug: (action: string, ...d: unknown[]) => log('DEBUG', action, ...d),
};

// ────────────────────────────────────────────────────────────────────────────────
// Discord channel delivery
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Sends a message/embed to the Discord log channel identified by `configKey`.
 * Never throws – all errors are caught and printed to the console.
 */
export async function sendDiscordLog(
	client: Client,
	guildId: string,
	configKey: string,
	message: MessageCreateOptions & { embeds?: EmbedBuilder[] },
): Promise<void> {
	if (!guildId) return;

	try {
		const channelId = (await config.get(guildId, configKey)) as string | null;
		if (!channelId) return;

		const channel = await client.channels.fetch(channelId).catch(() => null);
		if (!channel || !channel.isTextBased()) return;

		// Stamp all embeds with the current timestamp
		if (message.embeds) {
			message.embeds = message.embeds.map((e) => {
				try {
					if (e && typeof (e as import('discord.js').EmbedBuilder).setTimestamp === 'function') {
						return (e as import('discord.js').EmbedBuilder).setTimestamp();
					}
					return e;
				} catch {
					return e;
				}
			}) as import('discord.js').EmbedBuilder[];
		}

		await (channel as import('discord.js').TextChannel).send(message as MessageCreateOptions).catch((err: unknown) => {
			logger.warn('DISCORD_LOG', `Failed to send to channel ${channelId}:`, err);
		});
	} catch (err) {
		// Log delivery must never break the main flow
		logger.warn('DISCORD_LOG', `sendDiscordLog(${configKey}) failed:`, err);
	}
}
