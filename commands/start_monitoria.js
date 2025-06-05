const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('monitoria')
		.setDescription('Começe a monitoria')
		.addStringOption(option =>
			option
				.setName('materia')
				.setDescription('Qual materia você quer monitorar?')
				.setRequired(true)
				.addChoices(
					{ name: 'Lógica de Programação', value: 'lp' },
					{ name: 'Algoritmos e Estruturas de Dados I', value: 'aed i' },
					{ name: 'Algoritmos e Estruturas de Dados II', value: 'aed ii' },
				))
		.addBooleanOption(option => option
			.setName('online')
			.setDescription('A monitoria será online?')
			.setRequired(false)),
	async execute(interaction) {
		let materia = interaction.options.getString('materia');

		if (!interaction.guild) {
			return interaction.editReply({ content: '❌ Este comando só pode ser usado em um servidor.', ephemeral: true });
		}

		if (!interaction.member.roles.cache.some(role => role.name.toLowerCase() === 'monitor ' + materia)) {
			return interaction.editReply({ content: '❌ Você não tem permissão para usar este comando.', ephemeral: true });
		}

		let online = interaction.options.getBoolean('online');

		// Aqui você pode adicionar a lógica para iniciar a monitoria
		let roles = interaction.guild.roles.cache.filter(role => role.name.toLowerCase().includes("aluno"));
		let role = roles.first();
		for (const [key, value] of roles) {
			if (value.name.toLowerCase().includes(materia)) {
				role = value;
				break;
			}
		}
		if (!role) {
			return interaction.followUp({ content: 'Nenhum aluno encontrado.', ephemeral: true });
		}
		let channel = interaction.channel;
		if (!channel) {
			return interaction.followUp({ content: 'Nenhum canal encontrado.', ephemeral: true });
		}
		materia = materia.toUpperCase();

		interaction.editReply({ content: `Monitoria de **${materia}** iniciada!`, ephemeral: true });

		const embed = new EmbedBuilder()
			.setColor('#0099ff')
			.setTitle('Monitoria Iniciada')
			.setDescription(`A monitoria de **${materia}** foi iniciada!`)
			.addFields(
				{ name: 'Online', value: online ? 'Sim' : 'Não', inline: true },
			)
			.setTimestamp();
		await channel.send({ embeds: [embed], content: `<@&${role.id}> Começando a monitoria de **${materia}**, ${online ? 'online' : 'presencialmente'}.` });
	}
}