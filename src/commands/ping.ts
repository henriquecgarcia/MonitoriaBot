import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../types/index.js';

const command: BotCommand = {
	data: new SlashCommandBuilder().setName('ping').setDescription('Responde com Pong!'),

	async execute(interaction: ChatInputCommandInteraction) {
		const ping = Date.now() - interaction.createdTimestamp;
		await interaction.editReply(`🏓 Pong! Latência: ${ping}ms.`);
	},
};

export default command;
