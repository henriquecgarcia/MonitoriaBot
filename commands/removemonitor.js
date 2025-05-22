const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('removemonitor')
		.setDescription('Remove um monitor de uma matéria.')
		.addUserOption(option =>
			option.setName('monitor')
				.setDescription('O nome do monitor')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('disciplina')
				.setDescription('A disciplina do monitor')
				.addChoices(
					{ name: 'LP', value: 'LP' },
					{ name: 'AEDI', value: 'AEDI' },
					{ name: 'AEDII', value: 'AEDII' }
				)
				.setRequired(true)),
	async execute(interaction) {
		const monitor = interaction.options.getUser('monitor');
		const disciplina = interaction.options.getString('disciplina');

		// Verifica se o usuário já é um monitor
		const existingMonitor = await interaction.guild.members.fetch(monitor.id)
			.catch(console.error);
		if (!existingMonitor) {
			return interaction.followUp({ content: '❌ Usuário não encontrado.', ephemeral: true });
		}
		const monitorRole = interaction.guild.roles.cache.find(role => role.name === 'Monitor ' + disciplina);
		if (!monitorRole) {
			return interaction.followUp({ content: '❌ Cargo de monitor não encontrado.', ephemeral: true });
		}
		const member = interaction.guild.members.cache.get(monitor.id);
		if (!member.roles.cache.has(monitorRole.id)) {
			return interaction.followUp({ content: '❌ Esse usuário não é um monitor dessa disciplina.', ephemeral: true });
		}
		// Remove o cargo de monitor do usuário
		await member.roles.remove(monitorRole)
			.catch(console.error);
		await interaction.editReply(`✅ Monitor ${monitor} da disciplina ${disciplina} removido com sucesso!`);
	},
};