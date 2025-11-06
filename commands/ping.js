import { SlashCommandBuilder } from 'discord.js';

export default {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Responde com Pong!'),
	async execute(interaction) {
		let ping = Date.now() - interaction.createdTimestamp;
		await interaction.editReply(`🏓 Pong! A latência é de ${ping}ms.`);
	},
};
