import { SlashCommandBuilder } from 'discord.js';
const command = {
    data: new SlashCommandBuilder().setName('ping').setDescription('Responde com Pong!'),
    async execute(interaction) {
        const ping = Date.now() - interaction.createdTimestamp;
        await interaction.editReply(`🏓 Pong! Latência: ${ping}ms.`);
    },
};
export default command;
