import { PermissionsBitField } from 'discord.js';
import type { Guild, GuildMember } from 'discord.js';
import config from '../services/config_handler.js';

/**
 * Returns true if `member` is a server administrator or holds the
 * configured `staff_role`.
 *
 * Accepts either a Guild object or a raw guild ID string.
 */
export async function isStaff(guildOrId: Guild | string, member: GuildMember | null | undefined): Promise<boolean> {
	const guildId = typeof guildOrId === 'string' ? guildOrId : guildOrId?.id;

	const isAdmin = !!(
		member?.permissions &&
		'has' in member.permissions &&
		member.permissions.has(PermissionsBitField.Flags.Administrator)
	);

	if (isAdmin) return true;

	if (!guildId || !member) return false;

	const staffRoleId = (await config.get(guildId, 'staff_role')) as string | null;
	return !!(staffRoleId && member.roles?.cache?.has(staffRoleId));
}
