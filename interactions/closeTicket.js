// interactions/closeTicket.js
import { closeTicket } from '../services/tickets.js';
import db from '../services/db.js';
import { getTicketType } from '../services/tickets.js';
import { isStaff } from '../utils/player_util.js';

export default async function handleCloseTicket(interaction, { client }) {
	// permissões: apenas staff / editor_role / admin
	const guild = interaction.guild;
	const member = interaction.member;

	const staff_perms = await isStaff(guild, member);
	if (!staff_perms) {
		return interaction.editReply({ content: '❌ Você não tem permissão para fechar este ticket.', ephemeral: true });
	}
	const channel = interaction.channel;
	const ticket = await db.getTicketByChannel(guild.id, channel.id);
	if (!ticket) {
		return interaction.editReply({ content: '❌ Ticket não encontrado.', ephemeral: true });
	}
	let ticket_type = getTicketType(guild.id, ticket.ticket_type);
	if (!ticket_type) ticket_type = getTicketType(guild.id, 'geral');
	interaction.channel.send({ content: `👤 Ticket sendo fechado por <@${interaction.user.id}> em 5 segundos.` });
	interaction.reply({ content: '🔃 Fechando ticket... Em 5 segundos.' });

	setTimeout(async () => {
		interaction.channel.send({ content: `✅ Ticket fechado por ${interaction.user}` });
		await closeTicket({ channel, closedBy: interaction.user, client });
	}, 5000);
}
