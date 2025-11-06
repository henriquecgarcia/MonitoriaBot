import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import { createTicket, closeTicket, getTicketType, getAllTicketTypes } from '../services/tickets.js';
import { isStaff } from '../utils/player_util.js';
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';

import db from '../services/db.js';

export default {
	data: new SlashCommandBuilder()
		.setName('ticket').setDescription('Sistema de Tickets do Servidor')
		.addSubcommand(subcommand => subcommand.setName('abrir')
			.setDescription('Abre um ticket')
			.addStringOption(option => {
				option.setName('tipo');
				let choices = getAllTicketTypes();
				option.setChoices(
					...choices.map(c => ({ name: `Ticket ${c[1].name}`, value: c[0] }))
				);
				option.setDescription('Tipo de ticket').setRequired(true);
				return option;
			}))
		.addSubcommand(subcommand => subcommand.setName('fechar').setDescription('Fecha o ticket atual'))
		.addSubcommand(subcommand => subcommand.setName('assumir').setDescription('Assume o ticket atual'))
		.addSubcommand(subcommand => subcommand.setName('adicionar').setDescription('Adiciona um usuário ao ticket atual')
			.addUserOption(option => option.setName('usuario').setDescription('Usuário a adicionar').setRequired(true)))
		.addSubcommand(subcommand => subcommand.setName('remover').setDescription('Remove um usuário do ticket atual')
			.addUserOption(option => option.setName('usuario').setDescription('Usuário a remover').setRequired(true)))
		.addSubcommand(subcommand => subcommand.setName('mensagem').setDescription('Mostra a mensagem padrão do sistema de tickets')),
	async execute(interaction, { client }) {

		const subcommand = interaction.options.getSubcommand();
		const guildId = interaction.guildId;
		const member = interaction.member;
		const userId = interaction.user.id;

		const staff_perms = await isStaff(interaction.guild, interaction.member);

		if (subcommand === 'abrir') {
			const typeKey = interaction.options.getString('tipo');
			const type = getTicketType(guildId, typeKey).name;

			// verifica se já tem ticket aberto
			const existing = await db.hasOpenTicket(guildId, userId);
			if (existing) {
				return interaction.editReply({ content: '❌ Você já tem um ticket aberto. Por favor, feche-o antes de abrir outro.', ephemeral: true });
			}
			try {
				const channel = await createTicket({ guild: interaction.guild, user: interaction.user, type, client });
				return interaction.editReply({ content: `✅ Ticket criado: <#${channel.id}>`, ephemeral: true });
			} catch (e) {
				if (e.message === 'ERR_RATE_LIMIT') {
					return interaction.editReply({ content: '❌ Você está criando tickets rápido demais. Tente novamente mais tarde.', ephemeral: true });
				} else if (e.message === 'ERR_MISSING_CATEGORY') {
					return interaction.editReply({ content: '❌ Falha ao criar ticket: category configurada em /config não encontrada.', ephemeral: true });
				} else {
					console.error(e);
					return interaction.editReply({ content: `❌ Erro ao criar ticket: ${e.message}`, ephemeral: true });
				}
			}
		} else if (subcommand === 'fechar') {
			const channel = interaction.channel;
			const ticket = await db.getTicketByChannel(channel.id);
			if (!ticket) {
				return interaction.editReply({ content: '❌ Ticket não encontrado.', ephemeral: true });
			}
			let ticket_type = getTicketType(guildId, ticket.ticket_type);
			if (!ticket_type) ticket_type = getTicketType(guildId, 'geral');

			interaction.followUp({ content: '🔃 Fechando ticket... Em 5 segundos.' });

			setTimeout(async () => {
				await closeTicket({ channel, closedBy: interaction.user, client });
			}, 5000);

			return interaction.editReply({ content: '✅ Ticket fechado.', ephemeral: true });
		} else if (subcommand === 'assumir') {
			const channel = interaction.channel;
			const ticket = await db.getTicketByChannel(channel.id);
			if (!ticket) {
				return interaction.editReply({ content: '❌ Ticket não encontrado.', ephemeral: true });
			}
			let ticket_type = getTicketType(guildId, ticket.ticket_type);
			if (!ticket_type) ticket_type = getTicketType(guildId, 'geral');
			if (!staff_perms) {
				return interaction.editReply({ content: '❌ Você não tem permissão para assumir este ticket.', ephemeral: true });
			}
			// Garante que quem assumiu tenha acesso pleno ao canal
			await channel.permissionOverwrites.edit(userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
			interaction.channel.send({ content: `👤 Ticket assumido por <@${userId}>.` });

			return interaction.editReply({ content: '✅ Você agora é o responsável por este ticket.', ephemeral: true });
		} else if (subcommand === 'adicionar') {
			const user = interaction.options.getUser('usuario');
			const channel = interaction.channel;
			const ticket = await db.getTicketByChannel(channel.id);
			if (!ticket) {
				return interaction.editReply({ content: '❌ Ticket não encontrado.', ephemeral: true });
			}
			let ticket_type = getTicketType(guildId, ticket.ticket_type);
			if (!ticket_type) ticket_type = getTicketType(guildId, 'geral');
			if (!staff_perms) {
				return interaction.editReply({ content: '❌ Você não tem permissão para adicionar usuários a este ticket.', ephemeral: true });
			}

			await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });

			interaction.channel.send({ content: `➕ <@${user.id}> adicionado ao ticket por <@${userId}>.` });
			return interaction.editReply({ content: `✅ <@${user.id}> foi adicionado ao ticket.`, ephemeral: true });
		} else if (subcommand === 'remover') {
			const user = interaction.options.getUser('usuario');
			const channel = interaction.channel;
			const ticket = await db.getTicketByChannel(channel.id);
			if (!ticket) {
				return interaction.editReply({ content: '❌ Ticket não encontrado.', ephemeral: true });
			}
			let ticket_type = getTicketType(guildId, ticket.ticket_type);
			if (!ticket_type) ticket_type = getTicketType(guildId, 'geral');
			if (!staff_perms) {
				return interaction.editReply({ content: '❌ Você não tem permissão para remover usuários deste ticket.', ephemeral: true });
			}
			await channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
			interaction.channel.send({ content: `➖ <@${user.id}> removido do ticket por <@${userId}>.` });

			return interaction.editReply({ content: `✅ <@${user.id}> foi removido do ticket.`, ephemeral: true });
		} else if (subcommand === 'mensagem') {
			const guildId = interaction.guildId;
			const ticketTypes = getAllTicketTypes();
			const embed = new EmbedBuilder()
				.setTitle('📩 Sistema de Tickets')
				.setDescription('Para abrir um ticket, use o comando `/ticket abrir` e selecione o tipo de ticket desejado. Um canal privado será criado para você e a equipe de suporte.')
				.setColor('Blue')
				.setFooter({ text: 'Sistema de Tickets' })
				.setTimestamp();
			const options = ticketTypes.map(([key, obj]) => ({
				label: String(obj.name || key),
				value: String(key)
			}));
			const actions = new ActionRowBuilder()
				.addComponents(
					new StringSelectMenuBuilder()
						.setCustomId('ticket_type')
						.setPlaceholder('Selecione o tipo de ticket')
						.addOptions(options)
				);
			await interaction.editReply({ content: '✅ Mensagem de ticket padrão:', embeds: [embed], components: [actions], ephemeral: true });
			interaction.channel.send({ content: '🔧 Um novo ticket foi criado. Por favor, selecione o tipo de ticket desejado no menu abaixo:', embeds: [embed], components: [actions] });
		} else {
			return interaction.editReply({ content: '❌ Subcomando desconhecido.', ephemeral: true });
		}
	}
};
