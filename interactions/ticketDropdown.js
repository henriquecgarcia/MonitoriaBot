import { createTicket } from "../services/tickets.js";

export default async function handleTicketTypeSelect(interaction, { db, client }) {
	const selected = interaction.values[0]; // valor selecionado
	const type = selected || 'geral';
	await interaction.deferReply({ ephemeral: true });
	interaction.editReply({ content: '🔃 Criando seu ticket, aguarde...' });

	createTicket({ guild: interaction.guild, user: interaction.user, type, client }).then(ch => {
		interaction.editReply({ content: `✅ Ticket criado: <#${ch.id}>` });
	}).catch(e => {
		if (e.message === 'ERR_RATE_LIMIT') {
			interaction.editReply({ content: '❌ Você está criando tickets rápido demais. Tente novamente mais tarde.' });
		} else if (e.message === 'ERR_MISSING_CATEGORY') {
			interaction.editReply({ content: '❌ Falha ao criar ticket: category configurada em /config não encontrada.' });
		} else {
			console.error(e);
			interaction.editReply({ content: `❌ Erro ao criar ticket: ${e.message}` });
		}
	});
	return;
}