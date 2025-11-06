// utils/embeds.js
import { EmbedBuilder } from 'discord.js';

function normalizeDesc(desc) {
	if (Array.isArray(desc)) return desc.filter(Boolean).join('\n');
	if (desc == null) return '';
	return String(desc);
}

export function successEmbed(title, desc) {
	return new EmbedBuilder().setTitle(title).setDescription(normalizeDesc(desc)).setColor(0x57F287).setTimestamp();
}
export function errorEmbed(title, desc) {
	return new EmbedBuilder().setTitle(title).setDescription(normalizeDesc(desc)).setColor(0xED4245).setTimestamp();
}
export function infoEmbed(title, desc) {
	return new EmbedBuilder().setTitle(title).setDescription(normalizeDesc(desc)).setColor(0x5865F2).setTimestamp();
}
