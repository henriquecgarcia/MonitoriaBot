/**
 * Discord Event Logging Module
 *
 * Listens to guild events and forwards structured embeds to the appropriate
 * log channel configured via /config.
 *
 * All log deliveries are wrapped in try/catch – a failure never crashes the bot.
 */

import { AuditLogEvent, ChannelType, EmbedBuilder } from 'discord.js';
import type { Client, Guild } from 'discord.js';
import { sendDiscordLog, logger } from '../services/logger.js';

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────

function safeSend(
	client: Client,
	guildId: string | undefined,
	configKey: string,
	embed: EmbedBuilder,
): void {
	if (!guildId) return;
	sendDiscordLog(client, guildId, configKey, { embeds: [embed] }).catch((err) =>
		logger.warn('LOGS_MODULE', `sendDiscordLog(${configKey}) threw:`, err),
	);
}

async function fetchModerator(guild: Guild | null | undefined, type: AuditLogEvent, targetId?: string): Promise<string> {
	if (!guild) return '*desconhecido*';
	try {
		const logs = await guild.fetchAuditLogs({ type, limit: 5 });
		const now = Date.now();
		const entry =
			logs.entries.find((e) => {
				const matchTarget = !targetId || (e.target && (e.target as { id?: string }).id === targetId);
				const recent = !e.createdTimestamp || now - e.createdTimestamp < 15_000;
				return matchTarget && recent;
			}) ?? logs.entries.first();
		const executor = entry?.executor;
		return executor ? `<@${executor.id}>` : '*desconhecido*';
	} catch {
		return '*desconhecido*';
	}
}

function resolveMention(guild: Guild, id: string): string {
	const role = guild.roles.cache.get(id);
	return role ? `<@&${id}>` : `<@${id}>`;
}

function formatPermName(perm: string): string {
	try {
		return perm.replace(/([A-Z])/g, ' $1').replace(/^ /, '').replace(/Guild/g, 'Server');
	} catch {
		return String(perm);
	}
}

function escapeTicks(str: string | null | undefined): string {
	if (!str) return '*vazia*';
	// Escape backslashes first, then backticks, to avoid double-escaping
	return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

// ────────────────────────────────────────────────────────────────────────────────
// Module entry point
// ────────────────────────────────────────────────────────────────────────────────

export function init(client: Client): void {
	// ── MESSAGES ────────────────────────────────────────────────────────────────

	client.on('messageUpdate', (oldMessage, newMessage) => {
		if (oldMessage.partial || newMessage.partial) return;
		if (oldMessage.content === newMessage.content) return;
		if (oldMessage.author?.bot) return;

		const guildId = newMessage.guild?.id ?? oldMessage.guild?.id;
		safeSend(
			client,
			guildId,
			'message_logs',
			new EmbedBuilder()
				.setTitle('📝 Mensagem Editada')
				.addFields(
					{ name: 'Autor', value: `${oldMessage.author}`, inline: true },
					{ name: 'Canal', value: `${oldMessage.channel}`, inline: true },
					{ name: 'Original', value: `\`\`\`${escapeTicks(oldMessage.content)}\`\`\`` },
					{ name: 'Nova', value: `\`\`\`${escapeTicks(newMessage.content)}\`\`\`` },
					{ name: 'ID', value: oldMessage.id, inline: true },
					{ name: 'Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
					{
						name: 'Ir para',
						value: `[a mensagem](https://discord.com/channels/${guildId}/${oldMessage.channel.id}/${oldMessage.id})`,
						inline: true,
					},
				)
				.setColor('Yellow')
				.setFooter({ text: `${oldMessage.guild?.name ?? ''} ${new Date().getFullYear()}` }),
		);
	});

	client.on('messageDelete', (message) => {
		if (message.partial) return;
		if (message.author?.bot) return;

		safeSend(
			client,
			message.guild?.id,
			'message_logs',
			new EmbedBuilder()
				.setTitle('🗑️ Mensagem Deletada')
				.addFields(
					{ name: 'Autor', value: `${message.author}`, inline: true },
					{ name: 'Canal', value: `${message.channel}`, inline: true },
					{ name: 'Conteúdo', value: escapeTicks(message.content) || '*vazia*' },
				)
				.setColor('Red')
				.setFooter({ text: `ID: ${message.id}` }),
		);
	});

	// ── MEMBERS ─────────────────────────────────────────────────────────────────

	client.on('guildMemberAdd', (member) => {
		safeSend(
			client,
			member.guild.id,
			'member_logs',
			new EmbedBuilder()
				.setTitle('✅ Usuário Entrou')
				.setDescription(`👤 ${member.user.tag} (${member.user.id}) entrou no servidor.`)
				.setThumbnail(member.user.displayAvatarURL())
				.setColor('Green')
				.setFooter({ text: `ID: ${member.user.id}` }),
		);
	});

	client.on('guildMemberRemove', (member) => {
		safeSend(
			client,
			member.guild.id,
			'member_logs',
			new EmbedBuilder()
				.setTitle('❌ Usuário Saiu')
				.setDescription(`👤 ${member.user.tag} (${member.user.id}) saiu do servidor.`)
				.setThumbnail(member.user.displayAvatarURL())
				.setColor('Red')
				.setFooter({ text: `ID: ${member.user.id}` }),
		);
	});

	client.on('guildBanAdd', async (ban) => {
		const moderador = await fetchModerator(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
		safeSend(
			client,
			ban.guild.id,
			'member_logs',
			new EmbedBuilder()
				.setTitle('🔨 Usuário Banido')
				.setDescription(`👤 ${ban.user.tag} (${ban.user.id}) foi banido.`)
				.addFields(
					{ name: 'Motivo', value: ban.reason ?? 'Não especificado', inline: true },
					{ name: 'Moderador', value: moderador, inline: true },
				)
				.setThumbnail(ban.user.displayAvatarURL())
				.setColor('DarkRed')
				.setFooter({ text: `ID: ${ban.user.id}` }),
		);
	});

	client.on('guildBanRemove', async (ban) => {
		const moderador = await fetchModerator(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
		safeSend(
			client,
			ban.guild.id,
			'member_logs',
			new EmbedBuilder()
				.setTitle('♻️ Usuário Desbanido')
				.setDescription(`👤 ${ban.user.tag} (${ban.user.id}) foi desbanido.`)
				.addFields(
					{ name: 'Usuário', value: `${ban.user.tag} <@${ban.user.id}>`, inline: true },
					{ name: 'Moderador', value: moderador, inline: true },
				)
				.setThumbnail(ban.user.displayAvatarURL())
				.setColor('Orange')
				.setFooter({ text: `ID: ${ban.user.id}` }),
		);
	});

	client.on('guildMemberUpdate', async (oldMember, newMember) => {
		const addedRoles = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
		const removedRoles = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));

		if (addedRoles.size || removedRoles.size) {
			const moderador = await fetchModerator(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
			const changes: string[] = [];
			addedRoles.forEach((r) => changes.push(`✅ Cargo adicionado: ${r}`));
			removedRoles.forEach((r) => changes.push(`❌ Cargo removido: ${r}`));

			safeSend(
				client,
				newMember.guild.id,
				'member_logs',
				new EmbedBuilder()
					.setTitle('👤 Atualização de Membro')
					.setDescription(`<@${newMember.id}> (${newMember.user.tag})`)
					.addFields(
						{ name: 'Mudanças de Cargos', value: changes.join('\n') },
						{ name: 'Responsável', value: moderador }
					)
					.setThumbnail(newMember.user.displayAvatarURL())
					.setColor('Blue')
					.setFooter({ text: `ID: ${newMember.id}` }),
			);
		}

		if (oldMember.nickname !== newMember.nickname) {
			const moderador = await fetchModerator(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
			safeSend(
				client,
				newMember.guild.id,
				'member_logs',
				new EmbedBuilder()
					.setTitle('✏️ Apelido Alterado')
					.setDescription(`<@${newMember.id}> (${newMember.user.tag})`)
					.addFields(
						{ name: 'Apelido antigo', value: oldMember.nickname ?? oldMember.user.username, inline: true },
						{ name: 'Apelido novo', value: newMember.nickname ?? newMember.user.username, inline: true },
						{ name: 'Responsável', value: moderador },
					)
					.setThumbnail(newMember.user.displayAvatarURL())
					.setColor('Blue')
					.setFooter({ text: `ID: ${newMember.id}` }),
			);
		}
	});

	// ── ROLES ────────────────────────────────────────────────────────────────────

	client.on('roleUpdate', async (oldRole, newRole) => {
		const changes: { name: string; value: string; inline?: boolean }[] = [];

		if (oldRole.name !== newRole.name) {
			changes.push({ name: 'Nome antigo', value: oldRole.name, inline: true });
			changes.push({ name: 'Nome novo', value: newRole.name, inline: true });
		}
		if (oldRole.color !== newRole.color) {
			changes.push({ name: '🎨 Cor antiga', value: `**${oldRole.hexColor}**`, inline: true });
			changes.push({ name: '🎨 Cor nova', value: `**${newRole.hexColor}**`, inline: true });
		}
		if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
			const added = newRole.permissions.toArray().filter((p) => !oldRole.permissions.has(p));
			const removed = oldRole.permissions.toArray().filter((p) => !newRole.permissions.has(p));
			changes.push({ name: '✅ Permissões adicionadas', value: added.map((p) => `➕ \`${p}\``).join('\n') || 'Nenhuma' });
			changes.push({ name: '❌ Permissões removidas', value: removed.map((p) => `➖ \`${p}\``).join('\n') || 'Nenhuma' });
		}

		if (!changes.length) return;

		const moderador = await fetchModerator(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
		changes.push({ name: 'Moderador', value: moderador });

		safeSend(
			client,
			newRole.guild.id,
			'role_logs',
			new EmbedBuilder()
				.setTitle(`🛠️ Cargo atualizado: ${oldRole.name}`)
				.addFields(changes)
				.setColor('Orange')
				.setFooter({ text: `ID: ${oldRole.id}` }),
		);
	});

	client.on('roleCreate', async (role) => {
		const moderador = await fetchModerator(role.guild, AuditLogEvent.RoleCreate, role.id);
		safeSend(
			client,
			role.guild.id,
			'role_logs',
			new EmbedBuilder()
				.setTitle('🆕 Cargo Criado')
				.addFields(
					{ name: 'Nome', value: role.name, inline: true },
					{ name: 'ID', value: role.id, inline: true },
					{ name: 'Criado por', value: moderador, inline: true },
				)
				.setColor('Green')
				.setFooter({ text: `ID: ${role.id}` }),
		);
	});

	client.on('roleDelete', async (role) => {
		const moderador = await fetchModerator(role.guild, AuditLogEvent.RoleDelete, role.id);
		safeSend(
			client,
			role.guild?.id,
			'role_logs',
			new EmbedBuilder()
				.setTitle('🗑️ Cargo Deletado')
				.addFields(
					{ name: 'Nome', value: role.name, inline: true },
					{ name: 'ID', value: role.id, inline: true },
					{ name: 'Deletado por', value: moderador, inline: true },
				)
				.setColor('Red')
				.setFooter({ text: `ID: ${role.id}` }),
		);
	});

	// ── CHANNELS ─────────────────────────────────────────────────────────────────

	client.on('channelCreate', async (channel) => {
		if (channel.type === ChannelType.GuildCategory) return;
		if (!channel.guild) return;

		const moderador = await fetchModerator(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
		safeSend(
			client,
			channel.guild.id,
			'channel_logs',
			new EmbedBuilder()
				.setTitle('📢 Canal Criado')
				.addFields(
					{ name: 'Nome', value: channel.name, inline: true },
					{ name: 'ID', value: channel.id, inline: true },
					{ name: 'Criado por', value: moderador, inline: true },
				)
				.setColor('Green')
				.setFooter({ text: `ID: ${channel.id}` }),
		);
	});

	client.on('channelDelete', async (channel) => {
		if (channel.type === ChannelType.GuildCategory) return;
		if (!('guild' in channel) || !channel.guild) return;

		const moderador = await fetchModerator(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
		safeSend(
			client,
			channel.guild.id,
			'channel_logs',
			new EmbedBuilder()
				.setTitle('📢 Canal Deletado')
				.addFields(
					{ name: 'Nome', value: channel.name, inline: true },
					{ name: 'ID', value: channel.id, inline: true },
					{ name: 'Deletado por', value: moderador, inline: true },
				)
				.setColor('Red')
				.setFooter({ text: `ID: ${channel.id}` }),
		);
	});

	client.on('channelUpdate', async (oldChannel, newChannel) => {
		if (!('guild' in newChannel) || !newChannel.guild) return;

		const guild = newChannel.guild;

		if ('name' in oldChannel && 'name' in newChannel && oldChannel.name !== newChannel.name) {
			const moderador = await fetchModerator(guild, AuditLogEvent.ChannelUpdate, newChannel.id);
			safeSend(
				client,
				guild.id,
				'channel_logs',
				new EmbedBuilder()
					.setTitle('✏️ Canal Renomeado')
					.addFields(
						{ name: 'Nome antigo', value: oldChannel.name, inline: true },
						{ name: 'Nome novo', value: newChannel.name, inline: true },
						{ name: 'Moderador', value: moderador, inline: true },
					)
					.setColor('Blue')
					.setFooter({ text: `ID: ${newChannel.id}` }),
			);
		}

		// Permission overwrite diff
		if (!('permissionOverwrites' in oldChannel) || !('permissionOverwrites' in newChannel)) return;

		const oldMap = new Map(oldChannel.permissionOverwrites.cache.map((po) => [po.id, po]));
		const newMap = new Map(newChannel.permissionOverwrites.cache.map((po) => [po.id, po]));
		const lines: string[] = [];

		for (const [id, newPO] of newMap) {
			const oldPO = oldMap.get(id);
			const newAllow = newPO.allow?.toArray?.() ?? [];
			const newDeny = newPO.deny?.toArray?.() ?? [];
			const oldAllow = oldPO?.allow?.toArray?.() ?? [];
			const oldDeny = oldPO?.deny?.toArray?.() ?? [];

			const allowAdded = newAllow.filter((p) => !oldAllow.includes(p));
			const denyAdded = newDeny.filter((p) => !oldDeny.includes(p));
			const allowRemoved = oldAllow.filter((p) => !newAllow.includes(p));
			const denyRemoved = oldDeny.filter((p) => !newDeny.includes(p));

			if (allowAdded.length || denyAdded.length || allowRemoved.length || denyRemoved.length) {
				lines.push(`↘️ ${resolveMention(guild, id)}`);
				allowAdded.forEach((p) => lines.push(`✅ ${formatPermName(p)}`));
				denyAdded.forEach((p) => lines.push(`🚫 ${formatPermName(p)}`));
				allowRemoved.forEach((p) => lines.push(`➖ (allow) ${formatPermName(p)}`));
				denyRemoved.forEach((p) => lines.push(`➖ (deny) ${formatPermName(p)}`));
			}
		}

		for (const [id, oldPO] of oldMap) {
			if (!newMap.has(id)) {
				const removedAllow = oldPO.allow?.toArray?.() ?? [];
				const removedDeny = oldPO.deny?.toArray?.() ?? [];
				if (removedAllow.length || removedDeny.length) {
					lines.push(`↘️ ${resolveMention(guild, id)}`);
					removedAllow.forEach((p) => lines.push(`➖ (allow) ${formatPermName(p)}`));
					removedDeny.forEach((p) => lines.push(`➖ (deny) ${formatPermName(p)}`));
				}
			}
		}

		if (lines.length) {
			let permsText = lines.join('\n');
			if (permsText.length > 1024) permsText = permsText.slice(0, 1021) + '...';

			let moderador = await fetchModerator(guild, AuditLogEvent.ChannelOverwriteUpdate, newChannel.id);
			if (moderador === '*desconhecido*') {
				moderador = await fetchModerator(guild, AuditLogEvent.ChannelUpdate, newChannel.id);
			}

			safeSend(
				client,
				guild.id,
				'channel_logs',
				new EmbedBuilder()
					.setTitle(`🏠 Permissões do Canal Atualizadas: ${'name' in newChannel ? (newChannel as { name: string }).name : (newChannel as { id: string }).id}`)
					.addFields(
						{ name: 'Permissões', value: permsText || '—' },
						{ name: 'Moderador', value: moderador },
					)
					.setColor('Blue')
					.setFooter({ text: `ID: ${newChannel.id}` }),
			);
		}
	});

	// ── GUILD ────────────────────────────────────────────────────────────────────

	client.on('guildUpdate', async (oldGuild, newGuild) => {
		const changes: string[] = [];
		if (oldGuild.name !== newGuild.name) changes.push(`✏️ Nome: **${oldGuild.name}** → **${newGuild.name}**`);
		if (oldGuild.icon !== newGuild.icon) changes.push(`🖼️ Ícone alterado.`);
		if (oldGuild.banner !== newGuild.banner) changes.push(`🖼️ Banner alterado.`);
		if (!changes.length) return;

		const moderador = await fetchModerator(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
		safeSend(
			client,
			newGuild.id,
			'guild_logs',
			new EmbedBuilder()
				.setTitle('⚙️ Servidor Atualizado')
				.setDescription(changes.join('\n'))
				.addFields({ name: 'Moderador', value: moderador, inline: true })
				.setThumbnail(newGuild.iconURL())
				.setColor('Purple')
				.setFooter({ text: `ID: ${newGuild.id}` }),
		);
	});

	// ── USERS ────────────────────────────────────────────────────────────────────

	client.on('userUpdate', (oldUser, newUser) => {
		if (oldUser.username === newUser.username) return;

		client.guilds.cache.forEach((g) => {
			safeSend(
				client,
				g.id,
				'user_logs',
				new EmbedBuilder()
					.setTitle('👤 Usuário Renomeado')
					.addFields(
						{ name: 'Nome antigo', value: oldUser.username ?? '—', inline: true },
						{ name: 'Nome novo', value: newUser.username ?? '—', inline: true },
					)
					.setImage(newUser.displayAvatarURL())
					.setColor('Blue')
					.setFooter({ text: `ID: ${oldUser.id}` }),
			);
		});
	});

	logger.info('LOGS_MODULE', 'Módulo de logs iniciado.');
}

export default { init };
