import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isStaff } from '../utils/player_util.js';
const command = {
    data: new SlashCommandBuilder()
        .setName('limpar')
        .setDescription('Limpa mensagens em um canal de texto')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addNumberOption((o) => o.setName('quantidade').setDescription('Número de mensagens a apagar (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
    async execute(interaction) {
        const quantidade = interaction.options.getNumber('quantidade', true);
        const guild = interaction.guild;
        const member = interaction.member;
        if (!(await isStaff(guild, member))) {
            return interaction.editReply({ content: '❌ Você não tem permissão para usar este comando.' });
        }
        const channel = interaction.channel;
        const messages = await channel.messages.fetch({ limit: quantidade });
        try {
            const deleted = await channel.bulkDelete(messages);
            await interaction.editReply({ content: `✅ ${deleted.size} mensagens apagadas.` });
            return await channel.send({ content: `✅ <@${member.id}> apagou ${deleted.size} mensagens.` });
        }
        catch {
            await interaction.editReply({ content: '❌ Não foi possível apagar as mensagens. Elas podem ter mais de 14 dias.' });
        }
    },
};
export default command;
