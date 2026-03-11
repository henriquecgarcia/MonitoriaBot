import { EmbedBuilder } from 'discord.js';

function normalizeDesc(desc: unknown): string {
	if (Array.isArray(desc)) return (desc as unknown[]).filter(Boolean).join('\n');
	if (desc == null) return '';
	return String(desc);
}

export function successEmbed(title: string, desc?: unknown): EmbedBuilder {
	return new EmbedBuilder().setTitle(title).setDescription(normalizeDesc(desc)).setColor(0x57f287).setTimestamp();
}

export function errorEmbed(title: string, desc?: unknown): EmbedBuilder {
	return new EmbedBuilder().setTitle(title).setDescription(normalizeDesc(desc)).setColor(0xed4245).setTimestamp();
}

export function infoEmbed(title: string, desc?: unknown): EmbedBuilder {
	return new EmbedBuilder().setTitle(title).setDescription(normalizeDesc(desc)).setColor(0x5865f2).setTimestamp();
}
