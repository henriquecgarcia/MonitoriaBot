import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isStaff } from '../utils/player_util.js';

export default {
	data: new SlashCommandBuilder()
		.setName('limpar')
		.setDescription('Limpa mensagens em um canal de texto')
		.addNumberOption(option => option
			.setName('quantidade')
			.setDescription('Número de mensagens a serem apagadas (1-100)')
			.setRequired(true)
			.setMinValue(1)
			.setMaxValue(100)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
	async execute(interaction) {
		const quantidade = interaction.options.getNumber('quantidade');

		let staff_perms = isStaff(interaction.member);
		if (!staff_perms) {
			return interaction.editReply({ content: '❌ Você não tem permissão para usar este comando.', ephemeral: true });
		}

		if (!quantidade) return interaction.editReply({ content: 'Você precisa especificar uma quantidade de mensagens a serem apagadas.', ephemeral: true });

		const channel = interaction.channel;
		const messages = await channel.messages.fetch({ limit: quantidade });
		await channel.bulkDelete(messages).then(messages => {
			interaction.editReply({ content: `Apaguei ${messages.size} mensagens.`, ephemeral: true });
			interaction.followUp({ content: `✅ ${interaction.user}, apaguei ${messages.size} mensagens.` });
		}).catch(err => {
			console.error(err);
			interaction.editReply({ content: '❌ Não consegui apagar as mensagens. Elas podem ser mais velhas que 14 dias.', ephemeral: true });
		});
		return;
	}
}