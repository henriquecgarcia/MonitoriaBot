import db from '../services/db.js';
import { ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { getTicketType, assignTicket, canClaimTicket } from '../services/tickets.js';

import formatDate from '../utils/formatDate.js';
import { isStaff } from "../utils/player_util.js";
import { ButtonStyle } from 'discord.js';

export default [
	{
		name: 'admin_menu_ticket',
		async execute(interaction, { client }) {
			await interaction.deferReply({ ephemeral: true });
			const guild = interaction.guild;
			const member = interaction.member;
			const userId = interaction.user.id;
			const channel = interaction.channel;

			// Verifica se o canal é um ticket
			const ticket = await db.getTicketByChannel(guild.id, channel.id);
			if (!ticket) {
				return interaction.editReply({ content: '❌ Este canal não é um ticket aberto.', ephemeral: true });
			}

			// Verifica se o usuário é staff
			const staff_perms = await isStaff(guild, member);
			if (!staff_perms) {
				return interaction.editReply({ content: '❌ Você não tem permissão para usar este comando.', ephemeral: true });
			}

			const actions = new ActionRowBuilder()
				.addComponents(
					new ButtonBuilder()
						.setCustomId('add_user_ticket')
						.setLabel('Adicionar Usuário ao Ticket')
						.setStyle(ButtonStyle.Primary),
					new ButtonBuilder()
						.setCustomId('remove_user_ticket')
						.setLabel('Remover Usuário do Ticket')
						.setStyle(ButtonStyle.Primary),
					new ButtonBuilder()
						.setCustomId('close_ticket')
						.setLabel('Fechar Ticket')
						.setStyle(ButtonStyle.Danger)
				);

			// Mostra menu admin
			const embed = new EmbedBuilder()
				.setTitle(`Menu Admin do Ticket #${ticket.id}`)
				.addFields(
					{ name: 'Criado por:', value: `<@${ticket.author_id}>`, inline: true },
					{ name: 'Data de Abertura:', value: formatDate(ticket.created_at), inline: true },
					{ name: 'Status:', value: ticket.status === 'open' ? 'Aberto' : 'Fechado', inline: true },
					{ name: '\u200B', value: '\u200B' },
					{ name: 'Tipo:', value: ticket.ticket_type, inline: true },
					{ name: 'Responsável:', value: ticket.assigned_id ? `<@${ticket.assigned_id}>` : 'Ninguém', inline: true },
					{ name: 'Canal:', value: `<#${channel.id}>`, inline: true },
					{ name: '\u200B', value: '\u200B' }
				)
				.setColor(0x00AE86)
				.setTimestamp()
				.setFooter({ text: `ID do Ticket: ${ticket.ticket_id}` })
				.setDescription('Use os botões abaixo para gerenciar este ticket.');

			return interaction.editReply({ embeds: [embed], ephemeral: true, components: [actions] });
		}
	}, {
		name: 'add_user_ticket',
		async execute(interaction, { client }) {
			await interaction.deferReply({ ephemeral: true });
			const userId = interaction.user.id;
			const channel = interaction.channel;
			const guild = interaction.guild;

			const ticket = await db.getTicketByChannel(guild.id, channel.id);
			if (!ticket) {
				return interaction.editReply({ content: '❌ Este canal não é um ticket aberto.', ephemeral: true });
			}
			// Verifica se o usuário é staff
			const member = interaction.member;
			const staff_perms = await isStaff(guild.id, member);
			if (!staff_perms) {
				return interaction.editReply({ content: '❌ Você não tem permissão para adicionar usuários a este ticket.', ephemeral: true });
			}

			const row = new ActionRowBuilder()
				.addComponents(
					new StringSelectMenuBuilder()
						.setCustomId('select_user_to_add')
						.setPlaceholder('Selecione um usuário para adicionar ao ticket')
						.setMinValues(1)
						.setMaxValues(1)
						.addOptions(
							guild.members.cache
								.filter(m => !m.user.bot && m.id !== ticket.userId)
								.map(m => ({
									label: m.displayName,
									value: m.id
								}))
						)
				);
			return interaction.editReply({ content: 'Selecione um usuário para adicionar ao ticket:', components: [row], ephemeral: true });
		}
	}, {
		name: 'remove_user_ticket',
		async execute(interaction, { client }) {
			await interaction.deferReply({ ephemeral: true });
			const userId = interaction.user.id;
			const channel = interaction.channel;
			const guild = interaction.guild;

			const ticket = await db.getTicketByChannel(guild.id, channel.id);
			if (!ticket) {
				return interaction.editReply({ content: '❌ Este canal não é um ticket aberto.', ephemeral: true });
			}

			const member = interaction.member;
			const staff_perms = await isStaff(guild.id, member);
			if (!staff_perms) {
				return interaction.editReply({ content: '❌ Você não tem permissão para remover usuários deste ticket.', ephemeral: true });
			}

			// filtra apenas permissões de membros (não cargos) e exclui o autor do ticket
			const channel_permissions = channel.permissionOverwrites.cache.filter(po => po.type == 1 && po.id != ticket.userId);
			if (channel_permissions.size === 0) {
				return interaction.editReply({ content: '❌ Não há usuários adicionais neste ticket para remover.', ephemeral: true });
			}

			const row = new ActionRowBuilder()
				.addComponents(
					new StringSelectMenuBuilder()
						.setCustomId('select_user_to_remove')
						.setPlaceholder('Selecione um usuário para remover do ticket')
						.setMinValues(1)
						.setMaxValues(1)
						.addOptions(
							guild.members.cache
								.filter(m => !m.user.bot && m.id !== ticket.userId && channel_permissions.has(m.id))
								.map(m => ({
									label: m.displayName,
									value: m.id
								}))
						)
				);
			return interaction.editReply({ content: 'Selecione um usuário para remover do ticket:', components: [row], ephemeral: true });
		}
	}, {
		name: 'claim_ticket',
		async execute(interaction, { client }) {
			await interaction.reply({ content: '🔃 Reivindicando ticket...', ephemeral: true });
			const userId = interaction.user.id;
			const channel = interaction.channel;
			const guild = interaction.guild;

			const ticket = await db.getTicketByChannel(guild.id, channel.id);
			if (!ticket) {
				return interaction.editReply({ content: '❌ Ticket não encontrado.', ephemeral: true });
			}
			let ticket_type = getTicketType(guild.id, ticket.ticket_type);
			if (!ticket_type) ticket_type = getTicketType(guild.id, 'geral');
			const member = interaction.member;
			try {
				if (!await canClaimTicket(guild.id, member, interaction.channel, interaction.client)) {
					return interaction.editReply({ content: '❌ Você não tem permissão para assumir este ticket.', ephemeral: true });
				}
			} catch (err) {
				switch (err.message) {
					case 'TICKET_CLAIM_SELF':
						return interaction.editReply({ content: '❌ Você não pode assumir seu próprio ticket.', ephemeral: true });
					case 'TICKET_CLAIM_CLAIMED':
						return interaction.editReply({ content: '❌ Este ticket já está atribuído a outro membro.', ephemeral: true });
					case 'ERR_NOT_A_TICKET':
						return interaction.editReply({ content: '❌ Este canal não é um ticket aberto.', ephemeral: true });
					case 'ERR_INVALID_TICKET_TYPE':
						return interaction.editReply({ content: '❌ Tipo de ticket inválido.', ephemeral: true });
					case 'ERR_TICKET_ALREADY_ASSIGNED':
						return interaction.editReply({ content: '❌ Este ticket já está atribuído a outro membro.', ephemeral: true });
					case 'ERR_NO_STAFF_ROLES_CONFIGURED':
						if (!await isStaff(guild, interaction.member)) {
							return interaction.editReply({ content: '❌ Este ticket não pode ser assumido porque nenhum cargo de staff está configurado no servidor.', ephemeral: true });
						}
						break;
					default:
						console.error('Erro ao verificar permissão para assumir ticket:', err);
						return interaction.editReply({ content: '❌ Ocorreu um erro ao tentar assumir o ticket. Tente novamente mais tarde.', ephemeral: true });
				}
			}
			if (ticket.assigned_id) {
				return interaction.editReply({ content: '❌ Este ticket já está atribuído a outro membro.', ephemeral: true });
			}
			await assignTicket({ channel, assignedTo: member, client });

			// Garante que quem assumiu tenha acesso pleno ao canal
			await channel.permissionOverwrites.edit(userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
			interaction.channel.send({ content: `👤 Ticket assumido por <@${userId}>.` });

			return interaction.editReply({ content: '✅ Você agora é o responsável por este ticket.', ephemeral: true });
		}
	}, {
		name: 'select_user_to_add',
		async execute(interaction, { client }) {
			await interaction.deferReply({ ephemeral: true });
			const selectedUserId = interaction.values[0];
			const channel = interaction.channel;
			const guild = interaction.guild;
			const member = interaction.member;

			// Verifica se o canal é um ticket
			const ticket = await db.getTicketByChannel(guild.id, channel.id);
			if (!ticket) {
				return interaction.editReply({ content: '❌ Este canal não é um ticket aberto.', ephemeral: true });
			}
			// Verifica se o usuário é staff
			const staff_perms = await isStaff(guild, member);
			if (!staff_perms) {
				return interaction.editReply({ content: '❌ Você não tem permissão para adicionar usuários a este ticket.', ephemeral: true });
			}

			// Adiciona permissão para o usuário selecionado
			await channel.permissionOverwrites.edit(selectedUserId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });

			interaction.channel.send({ content: `➕ <@${selectedUserId}> adicionado ao ticket por <@${member.id}>.` });
			return interaction.editReply({ content: `✅ <@${selectedUserId}> foi adicionado ao ticket.`, ephemeral: true });
		}
	}, {
		name: 'select_user_to_remove',
		async execute(interaction, { client }) {
			await interaction.deferReply({ ephemeral: true });
			const selectedUserId = interaction.values[0];
			const channel = interaction.channel;
			const guild = interaction.guild;
			const member = interaction.member;

			// Verifica se o canal é um ticket
			const ticket = await db.getTicketByChannel(guild.id, channel.id);
			if (!ticket) {
				return interaction.editReply({ content: '❌ Este canal não é um ticket aberto.', ephemeral: true });
			}

			// Verifica se o usuário é staff
			const staff_perms = await isStaff(guild, member);
			if (!staff_perms) {
				return interaction.editReply({ content: '❌ Você não tem permissão para remover usuários deste ticket.', ephemeral: true });
			}

			// Remove permissão do usuário selecionado
			await channel.permissionOverwrites.delete(selectedUserId);
			interaction.channel.send({ content: `➖ <@${selectedUserId}> removido do ticket por <@${member.id}>.` });
			return interaction.editReply({ content: `✅ <@${selectedUserId}> foi removido do ticket.`, ephemeral: true });
		}
	}
];