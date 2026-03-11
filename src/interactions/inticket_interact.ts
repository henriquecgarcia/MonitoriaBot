import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	StringSelectMenuBuilder,
	PermissionsBitField,
} from 'discord.js';
import type { Interaction, TextChannel, GuildMember } from 'discord.js';
import db from '../services/db.js';
import { getTicketType, assignTicket, canClaimTicket } from '../services/tickets.js';
import { isStaff } from '../utils/player_util.js';
import formatDate from '../utils/formatDate.js';
import type { CommandContext, BotInteraction } from '../types/index.js';

// ────────────────────────────────────────────────────────────────────────────────
// admin_menu_ticket
// ────────────────────────────────────────────────────────────────────────────────

const adminMenu: BotInteraction = {
	name: 'admin_menu_ticket',
	async execute(interaction: Interaction, { client: _client }: CommandContext) {
		if (!interaction.isButton()) return;
		await interaction.deferReply({ ephemeral: true });

		const guild = interaction.guild!;
		const member = interaction.member as GuildMember;
		const channel = interaction.channel as TextChannel;

		const ticket = await db.getTicketByChannel(guild.id, channel.id);
		if (!ticket) {
			return interaction.editReply({ content: '❌ Este canal não é um ticket aberto.' });
		}

		if (!(await isStaff(guild, member))) {
			return interaction.editReply({ content: '❌ Você não tem permissão para usar este menu.' });
		}

		const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('add_user_ticket').setLabel('Adicionar Usuário').setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId('remove_user_ticket').setLabel('Remover Usuário').setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId('close_ticket').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger),
		);

		const embed = new EmbedBuilder()
			.setTitle(`Menu Admin do Ticket #${ticket.ticket_id}`)
			.setDescription('Use os botões abaixo para gerenciar este ticket.')
			.addFields(
				{ name: 'Criado por', value: `<@${ticket.author_id}>`, inline: true },
				{ name: 'Abertura', value: formatDate(ticket.created_at), inline: true },
				{ name: 'Status', value: ticket.status === 'open' ? 'Aberto' : 'Fechado', inline: true },
				{ name: '\u200B', value: '\u200B' },
				{ name: 'Tipo', value: ticket.ticket_type, inline: true },
				{ name: 'Responsável', value: ticket.assigned_id ? `<@${ticket.assigned_id}>` : 'Ninguém', inline: true },
				{ name: 'Canal', value: `<#${channel.id}>`, inline: true },
			)
			.setColor(0x00ae86)
			.setTimestamp()
			.setFooter({ text: `ID do Ticket: ${ticket.ticket_id}` });

		return interaction.editReply({ embeds: [embed], components: [actions] });
	},
};

// ────────────────────────────────────────────────────────────────────────────────
// add_user_ticket
// ────────────────────────────────────────────────────────────────────────────────

const addUser: BotInteraction = {
	name: 'add_user_ticket',
	async execute(interaction: Interaction, _ctx: CommandContext) {
		if (!interaction.isButton()) return;
		await interaction.deferReply({ ephemeral: true });

		const guild = interaction.guild!;
		const member = interaction.member as GuildMember;
		const channel = interaction.channel as TextChannel;

		const ticket = await db.getTicketByChannel(guild.id, channel.id);
		if (!ticket) return interaction.editReply({ content: '❌ Este canal não é um ticket aberto.' });

		if (!(await isStaff(guild, member))) {
			return interaction.editReply({ content: '❌ Você não tem permissão para adicionar usuários.' });
		}

		const options = guild.members.cache
			.filter((m) => !m.user.bot && m.id !== ticket.author_id)
			.first(25)
			.map((m) => ({ label: m.displayName.slice(0, 100), value: m.id }));

		if (!options.length) {
			return interaction.editReply({ content: '❌ Não há usuários disponíveis para adicionar.' });
		}

		const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId('select_user_to_add')
				.setPlaceholder('Selecione um usuário para adicionar')
				.setMinValues(1)
				.setMaxValues(1)
				.addOptions(options),
		);

		return interaction.editReply({ content: 'Selecione um usuário para adicionar ao ticket:', components: [row] });
	},
};

// ────────────────────────────────────────────────────────────────────────────────
// remove_user_ticket
// ────────────────────────────────────────────────────────────────────────────────

const removeUser: BotInteraction = {
	name: 'remove_user_ticket',
	async execute(interaction: Interaction, _ctx: CommandContext) {
		if (!interaction.isButton()) return;
		await interaction.deferReply({ ephemeral: true });

		const guild = interaction.guild!;
		const member = interaction.member as GuildMember;
		const channel = interaction.channel as TextChannel;

		const ticket = await db.getTicketByChannel(guild.id, channel.id);
		if (!ticket) return interaction.editReply({ content: '❌ Este canal não é um ticket aberto.' });

		if (!(await isStaff(guild, member))) {
			return interaction.editReply({ content: '❌ Você não tem permissão para remover usuários.' });
		}

		// Find members that have explicit overrides on this channel (excluding bots and ticket author)
		const extraMembers = guild.members.cache.filter(
			(m) =>
				!m.user.bot &&
				m.id !== ticket.author_id &&
				channel.permissionOverwrites.cache.has(m.id),
		);

		if (!extraMembers.size) {
			return interaction.editReply({ content: '❌ Não há usuários adicionais neste ticket para remover.' });
		}

		const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId('select_user_to_remove')
				.setPlaceholder('Selecione um usuário para remover')
				.setMinValues(1)
				.setMaxValues(1)
				.addOptions(extraMembers.first(25).map((m) => ({ label: m.displayName.slice(0, 100), value: m.id }))),
		);

		return interaction.editReply({ content: 'Selecione um usuário para remover do ticket:', components: [row] });
	},
};

// ────────────────────────────────────────────────────────────────────────────────
// claim_ticket
// ────────────────────────────────────────────────────────────────────────────────

const claimTicket: BotInteraction = {
	name: 'claim_ticket',
	async execute(interaction: Interaction, { client }: CommandContext) {
		if (!interaction.isButton()) return;
		await interaction.reply({ content: '🔃 Reivindicando ticket...', ephemeral: true });

		const guild = interaction.guild!;
		const member = interaction.member as GuildMember;
		const channel = interaction.channel as TextChannel;

		const ticket = await db.getTicketByChannel(guild.id, channel.id);
		if (!ticket) return interaction.editReply({ content: '❌ Ticket não encontrado.' });

		if (ticket.assigned_id) {
			return interaction.editReply({ content: '❌ Este ticket já está atribuído a outro membro.' });
		}

		let canClaim = await isStaff(guild, member);

		if (!canClaim) {
			try {
				canClaim = await canClaimTicket(guild, member, channel);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				const errorMessages: Record<string, string> = {
					ERR_NOT_A_TICKET: '❌ Este canal não é um ticket aberto.',
					ERR_INVALID_TICKET_TYPE: '❌ Tipo de ticket inválido.',
					ERR_TICKET_ALREADY_ASSIGNED: '❌ Este ticket já está atribuído a outro membro.',
					ERR_NO_STAFF_ROLES_CONFIGURED: '❌ Nenhum cargo de staff configurado para este tipo de ticket.',
				};
				return interaction.editReply({ content: errorMessages[msg] ?? `❌ Erro ao verificar permissão: ${msg}` });
			}
		}

		if (!canClaim) {
			return interaction.editReply({ content: '❌ Você não tem permissão para assumir este ticket.' });
		}

		try {
			await assignTicket({ channel, assignedTo: member, client });
		} catch (err) {
			console.error('[claim_ticket] assignTicket error:', err);
			return interaction.editReply({ content: '❌ Ocorreu um erro ao tentar assumir o ticket. Tente novamente.' });
		}

		await channel.permissionOverwrites.edit(member.id, {
			ViewChannel: true,
			SendMessages: true,
			ReadMessageHistory: true,
		});

		await channel.send({ content: `👤 Ticket assumido por <@${member.id}>.` });
		return interaction.editReply({ content: '✅ Você agora é o responsável por este ticket.' });
	},
};

// ────────────────────────────────────────────────────────────────────────────────
// select_user_to_add
// ────────────────────────────────────────────────────────────────────────────────

const selectUserToAdd: BotInteraction = {
	name: 'select_user_to_add',
	async execute(interaction: Interaction, _ctx: CommandContext) {
		if (!interaction.isStringSelectMenu()) return;
		await interaction.deferReply({ ephemeral: true });

		const selectedUserId = interaction.values[0]!;
		const guild = interaction.guild!;
		const member = interaction.member as GuildMember;
		const channel = interaction.channel as TextChannel;

		const ticket = await db.getTicketByChannel(guild.id, channel.id);
		if (!ticket) return interaction.editReply({ content: '❌ Este canal não é um ticket aberto.' });

		if (!(await isStaff(guild, member))) {
			return interaction.editReply({ content: '❌ Sem permissão para adicionar usuários.' });
		}

		await channel.permissionOverwrites.edit(selectedUserId, {
			ViewChannel: true,
			SendMessages: true,
			ReadMessageHistory: true,
		});

		await channel.send({ content: `➕ <@${selectedUserId}> adicionado ao ticket por <@${member.id}>.` });
		return interaction.editReply({ content: `✅ <@${selectedUserId}> foi adicionado ao ticket.` });
	},
};

// ────────────────────────────────────────────────────────────────────────────────
// select_user_to_remove
// ────────────────────────────────────────────────────────────────────────────────

const selectUserToRemove: BotInteraction = {
	name: 'select_user_to_remove',
	async execute(interaction: Interaction, _ctx: CommandContext) {
		if (!interaction.isStringSelectMenu()) return;
		await interaction.deferReply({ ephemeral: true });

		const selectedUserId = interaction.values[0]!;
		const guild = interaction.guild!;
		const member = interaction.member as GuildMember;
		const channel = interaction.channel as TextChannel;

		const ticket = await db.getTicketByChannel(guild.id, channel.id);
		if (!ticket) return interaction.editReply({ content: '❌ Este canal não é um ticket aberto.' });

		if (!(await isStaff(guild, member))) {
			return interaction.editReply({ content: '❌ Sem permissão para remover usuários.' });
		}

		await channel.permissionOverwrites.delete(selectedUserId);
		await channel.send({ content: `➖ <@${selectedUserId}> removido do ticket por <@${member.id}>.` });
		return interaction.editReply({ content: `✅ <@${selectedUserId}> foi removido do ticket.` });
	},
};

export default [adminMenu, addUser, removeUser, claimTicket, selectUserToAdd, selectUserToRemove];
