import type { StringSelectMenuInteraction } from 'discord.js';
import { createTicket } from '../services/tickets.js';
import type { CommandContext } from '../types/index.js';

export default async function handleTicketTypeSelect(
	interaction: StringSelectMenuInteraction,
	{ client }: CommandContext,
): Promise<void> {
	const type = interaction.values[0] ?? 'geral';

	await interaction.editReply({ content: '🔃 Criando seu ticket, aguarde...' });

	try {
		const ch = await createTicket({ guild: interaction.guild!, user: interaction.user, type, client });
		await interaction.editReply({ content: `✅ Ticket criado: <#${ch.id}>` });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg === 'ERR_RATE_LIMIT') {
			await interaction.editReply({ content: '❌ Você está criando tickets rápido demais. Tente novamente mais tarde.' });
		} else if (msg === 'ERR_MISSING_CATEGORY') {
			await interaction.editReply({ content: '❌ Falha ao criar ticket: categoria configurada em /config não encontrada.' });
		} else {
			console.error('[ticketDropdown]', e);
			await interaction.editReply({ content: `❌ Erro ao criar ticket: ${msg}` });
		}
	}
}
