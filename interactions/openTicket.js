// interactions/openTicket.js
import { PermissionsBitField } from 'discord.js';
import { createTicket } from '../services/tickets.js';

export default async function handleOpenTicket(interaction, { client }) {
	const id = interaction.customId; // ex: "open_ticket::Ticket Geral" ou usamos payload
	const parts = id.split('::');
	const type = parts[1] || 'geral';
	await interaction.deferReply({ ephemeral: true });

	try {
		const ch = await createTicket({ guild: interaction.guild, user: interaction.user, type, client });
		await interaction.editReply({ content: `✅ Ticket criado: <#${ch.id}>` });
	} catch (e) {
		if (e.message === 'ERR_RATE_LIMIT') {
			await interaction.editReply({ content: '❌ Você está criando tickets rápido demais. Tente novamente mais tarde.' });
		} else if (e.message === 'ERR_MISSING_CATEGORY') {
			await interaction.editReply({ content: '❌ Falha ao criar ticket: category configurada em /config ticket_category não encontrada.' });
		} else {
			console.error(e);
			await interaction.editReply({ content: `❌ Erro ao criar ticket: ${e.message}` });
		}
	}
}
