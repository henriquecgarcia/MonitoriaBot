import {
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	StringSelectMenuBuilder,
} from 'discord.js';
import type { ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { createTicket, closeTicket, getTicketType, getAllTicketTypes } from '../services/tickets.js';
import { isStaff } from '../utils/player_util.js';
import db from '../services/db.js';
import type { BotCommand, CommandContext } from '../types/index.js';

const command: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('ticket')
		.setDescription('Sistema de Tickets do Servidor')
		.addSubcommand((sc) =>
			sc
				.setName('abrir')
				.setDescription('Abre um ticket')
				.addStringOption((o) => {
					const choices = getAllTicketTypes().map(([key, t]) => ({ name: `Ticket ${t.name}`, value: key }));
					return o.setName('tipo').setDescription('Tipo de ticket').setRequired(true).setChoices(...choices);
				}),
		)
		.addSubcommand((sc) => sc.setName('fechar').setDescription('Fecha o ticket atual'))
		.addSubcommand((sc) => sc.setName('assumir').setDescription('Assume o ticket atual'))
		.addSubcommand((sc) =>
			sc
				.setName('adicionar')
				.setDescription('Adiciona um usuário ao ticket atual')
				.addUserOption((o) => o.setName('usuario').setDescription('Usuário a adicionar').setRequired(true)),
		)
		.addSubcommand((sc) =>
			sc
				.setName('remover')
				.setDescription('Remove um usuário do ticket atual')
				.addUserOption((o) => o.setName('usuario').setDescription('Usuário a remover').setRequired(true)),
		)
		.addSubcommand((sc) => sc.setName('mensagem').setDescription('Posta a mensagem padrão do sistema de tickets')),

	async execute(interaction: ChatInputCommandInteraction, { client }: CommandContext) {
		const sub = interaction.options.getSubcommand();
		const guildId = interaction.guildId!;
		const guild = interaction.guild!;
		const member = interaction.member as import('discord.js').GuildMember;
		const userId = interaction.user.id;
		const channel = interaction.channel as TextChannel;

		const staffPerms = await isStaff(guild, member);

		// ── abrir ────────────────────────────────────────────────────────────────

		if (sub === 'abrir') {
			const typeKey = interaction.options.getString('tipo', true);

			const existing = await db.hasOpenTicket(guildId, userId);
			if (existing) {
				return interaction.editReply({ content: '❌ Você já tem um ticket aberto. Feche-o antes de abrir outro.' });
			}

			try {
				const ch = await createTicket({ guild, user: interaction.user, type: typeKey, client });
				return interaction.editReply({ content: `✅ Ticket criado: <#${ch.id}>` });
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (msg === 'ERR_RATE_LIMIT') return interaction.editReply({ content: '❌ Você está criando tickets rápido demais.' });
				if (msg === 'ERR_MISSING_CATEGORY') return interaction.editReply({ content: '❌ Categoria de ticket não configurada.' });
				console.error('[ticket abrir]', e);
				return interaction.editReply({ content: `❌ Erro ao criar ticket: ${msg}` });
			}
		}

		// ── fechar ───────────────────────────────────────────────────────────────

		if (sub === 'fechar') {
			const ticket = await db.getTicketByChannel(guildId, channel.id);
			if (!ticket) return interaction.editReply({ content: '❌ Este canal não é um ticket aberto.' });

			if (!staffPerms) return interaction.editReply({ content: '❌ Sem permissão para fechar tickets.' });

			await interaction.editReply({ content: '🔃 Fechando ticket em 5 segundos...' });
			setTimeout(async () => {
				try {
					await closeTicket({ channel, closedBy: interaction.user, client });
				} catch (err) {
					await channel.send({ content: `❌ Erro ao fechar: ${err instanceof Error ? err.message : String(err)}` }).catch(() => null);
				}
			}, 5_000);
			return;
		}

		// ── assumir ──────────────────────────────────────────────────────────────

		if (sub === 'assumir') {
			const ticket = await db.getTicketByChannel(guildId, channel.id);
			if (!ticket) return interaction.editReply({ content: '❌ Ticket não encontrado.' });
			if (!staffPerms) return interaction.editReply({ content: '❌ Sem permissão para assumir tickets.' });

			if (ticket.assigned_id) return interaction.editReply({ content: '❌ Este ticket já está atribuído.' });

			await db.assignTicket(guildId, channel.id, userId);
			await channel.permissionOverwrites.edit(userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
			await channel.send({ content: `👤 Ticket assumido por <@${userId}>.` });
			return interaction.editReply({ content: '✅ Você agora é o responsável por este ticket.' });
		}

		// ── adicionar ────────────────────────────────────────────────────────────

		if (sub === 'adicionar') {
			const user = interaction.options.getUser('usuario', true);
			const ticket = await db.getTicketByChannel(guildId, channel.id);
			if (!ticket) return interaction.editReply({ content: '❌ Ticket não encontrado.' });
			if (!staffPerms) return interaction.editReply({ content: '❌ Sem permissão para adicionar usuários.' });

			await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
			await channel.send({ content: `➕ <@${user.id}> adicionado ao ticket por <@${userId}>.` });
			return interaction.editReply({ content: `✅ <@${user.id}> foi adicionado ao ticket.` });
		}

		// ── remover ──────────────────────────────────────────────────────────────

		if (sub === 'remover') {
			const user = interaction.options.getUser('usuario', true);
			const ticket = await db.getTicketByChannel(guildId, channel.id);
			if (!ticket) return interaction.editReply({ content: '❌ Ticket não encontrado.' });
			if (!staffPerms) return interaction.editReply({ content: '❌ Sem permissão para remover usuários.' });

			await channel.permissionOverwrites.edit(user.id, { ViewChannel: false, SendMessages: false });
			await channel.send({ content: `➖ <@${user.id}> removido do ticket por <@${userId}>.` });
			return interaction.editReply({ content: `✅ <@${user.id}> foi removido do ticket.` });
		}

		// ── mensagem ─────────────────────────────────────────────────────────────

		if (sub === 'mensagem') {
			const ticketTypes = getAllTicketTypes();
			const options = ticketTypes.map(([key, obj]) => ({
				label: String(obj.name ?? key).slice(0, 100),
				value: String(key),
			}));

			const embed = new EmbedBuilder()
				.setTitle('📩 Sistema de Tickets')
				.setDescription(
					'Para abrir um ticket, selecione o tipo no menu abaixo. Um canal privado será criado para você e a equipe de suporte.',
				)
				.setColor('Blue')
				.setFooter({ text: 'Sistema de Tickets' })
				.setTimestamp();

			const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId('ticket_type')
					.setPlaceholder('Selecione o tipo de ticket')
					.addOptions(options),
			);

			await interaction.editReply({ content: '✅ Mensagem postada.', ephemeral: true } as Parameters<typeof interaction.editReply>[0]);
			await channel.send({
				content: '# 🔧 Sistema de tickets.\n\nBem-vindo(a)! Para abrir um ticket, selecione o tipo desejado:',
				embeds: [embed],
				components: [row],
			});
			return;
		}

		return interaction.editReply({ content: '❌ Subcomando desconhecido.' });
	},
};

export default command;
