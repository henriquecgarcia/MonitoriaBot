const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Responde com Pong!'),
	async execute(interaction) {
		let ping = Date.now() - interaction.createdTimestamp;
		await interaction.editReply(`🏓 Pong! A latência é de ${ping}ms.`);
	},
};
