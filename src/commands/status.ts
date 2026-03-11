import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import db from '../services/db.js';
import type { BotCommand, CommandContext } from '../types/index.js';

const command: BotCommand = {
	data: new SlashCommandBuilder().setName('status').setDescription('Verifica o status do bot'),

	async execute(interaction: ChatInputCommandInteraction, _ctx: CommandContext) {
		const uptime = process.uptime();
		const hours = Math.floor(uptime / 3600);
		const minutes = Math.floor((uptime % 3600) / 60);
		const seconds = Math.floor(uptime % 60);

		let dbStatus = '❌ Desconectado';
		try {
			const pool = await db.initDB();
			await pool.query('SELECT 1');
			dbStatus = '✅ Conectado';
		} catch {
			// already defaulted to disconnected
		}

		await interaction.editReply({
			content: [
				`✅ Bot online!`,
				`**Uptime:** ${hours}h ${minutes}m ${seconds}s`,
				`**Banco de dados:** ${dbStatus}`,
			].join('\n'),
			ephemeral: true,
		} as Parameters<typeof interaction.editReply>[0]);
	},
};

export default command;
