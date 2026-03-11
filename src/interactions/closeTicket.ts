import type { ButtonInteraction } from 'discord.js';
import { closeTicket, getTicketType } from '../services/tickets.js';
import db from '../services/db.js';
import { isStaff } from '../utils/player_util.js';
import type { CommandContext } from '../types/index.js';

export default async function handleCloseTicket(interaction: ButtonInteraction, { client }: CommandContext): Promise<void> {
	const guild = interaction.guild!;
	const member = interaction.member as import('discord.js').GuildMember;
	const channel = interaction.channel as import('discord.js').TextChannel;

	// Permission check: staff or admin only
	if (!(await isStaff(guild, member))) {
		await interaction.reply({ content: '❌ Você não tem permissão para fechar este ticket.', ephemeral: true });
		return;
	}

	const ticket = await db.getTicketByChannel(guild.id, channel.id);
	if (!ticket) {
		await interaction.reply({ content: '❌ Este canal não é um ticket aberto.', ephemeral: true });
		return;
	}

	const ticketType = getTicketType(guild.id, ticket.ticket_type);
	void ticketType; // used for future type-specific logic

	await interaction.reply({ content: `🔃 Ticket será fechado em 5 segundos por <@${interaction.user.id}>.` });

	setTimeout(async () => {
		try {
			await channel.send({ content: `✅ Ticket fechado por ${interaction.user}` });
			await closeTicket({ channel, closedBy: interaction.user, client });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			await channel.send({ content: `❌ Erro ao fechar ticket: ${msg}` }).catch(() => null);
		}
	}, 5_000);
}
