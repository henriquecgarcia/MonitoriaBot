const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addmonitor')
    .setDescription('Adiciona um monitor de uma matéria.')
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
    if (member.roles.cache.has(monitorRole.id)) {
      return interaction.followUp({ content: '❌ Esse usuário já é um monitor dessa disciplina.', ephemeral: true });
    }
    // Adiciona o cargo de monitor ao usuário
    await member.roles.add(monitorRole)
      .catch(console.error);
    await interaction.editReply(`✅ Monitor ${monitor} da disciplina ${disciplina} adicionado com sucesso!`);
  },
};
