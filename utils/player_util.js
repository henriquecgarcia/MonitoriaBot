// utils/player_util.js
import config from '../services/config_handler.js';
import { PermissionsBitField } from 'discord.js';

export async function isStaff(guildOrId, memberOrIdOrObj) {
	const guildId = typeof guildOrId === 'string' ? guildOrId : guildOrId?.id;
	const member = memberOrIdOrObj && typeof memberOrIdOrObj === 'object' ? memberOrIdOrObj : null;

	const isAdmin = !!(member && member.permissions && member.permissions.has?.(PermissionsBitField.Flags.Administrator));
	if (isAdmin) return true;

	const staff_role = guildId ? await config.get(guildId, 'staff_role') : null;
	const hasRole = !!(member && staff_role && member.roles && member.roles.cache && member.roles.cache.has?.(staff_role));
	return Boolean(hasRole || isAdmin);
}