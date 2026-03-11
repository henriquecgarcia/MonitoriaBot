import type { ButtonInteraction } from 'discord.js';
import { createTicket } from '../services/tickets.js';
import type { CommandContext } from '../types/index.js';

export default async function handleOpenTicket(interaction: ButtonInteraction, { client }: CommandContext): Promise<void> {
	// customId format: "open_ticket::<type>"
	const parts = interaction.customId.split('::');
	const type = parts[1] ?? 'geral';

	await interaction.deferReply({ ephemeral: true });

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
			console.error('[openTicket]', e);
			await interaction.editReply({ content: `❌ Erro ao criar ticket: ${msg}` });
		}
	}
}
