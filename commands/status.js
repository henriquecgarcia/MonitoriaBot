import { SlashCommandBuilder } from 'discord.js';
import db from '../services/db.js';

const data = new SlashCommandBuilder()
	.setName('status').setDescription('Verifica o status do bot')

async function execute(interaction, { client }) {
	// if (!interaction.member.permissions.has('ADMINISTRATOR')) {
	// 	return interaction.reply({ content: '❌ Você não tem permissão para usar este comando.', ephemeral: true });
	// }

	const uptime = process.uptime();
	const hours = Math.floor(uptime / 3600);
	const minutes = Math.floor((uptime % 3600) / 60);
	const seconds = Math.floor(uptime % 60);

	var botDBStatus = '❌ Desconectado';
	try {
		const bot = db.initBotPool();
		await bot.query('SELECT 1');
		botDBStatus = '✅ Conectado';
	} catch (e) {}

	const statusMessage = `**Status do Bot:**\n- Bot DB: ${botDBStatus}\n`;

	await interaction.editReply({ content: `✅ O bot está online!\n\n**Uptime:** ${hours}h ${minutes}m ${seconds}s\n${statusMessage}`, ephemeral: true });
}

export default { data, execute };