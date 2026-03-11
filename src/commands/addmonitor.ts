import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../types/index.js';

const command: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('addmonitor')
		.setDescription('Adiciona um monitor de uma matéria.')
		.addUserOption((o) => o.setName('monitor').setDescription('O nome do monitor').setRequired(true))
		.addStringOption((o) =>
			o
				.setName('disciplina')
				.setDescription('A disciplina do monitor')
				.setRequired(true)
				.addChoices(
					{ name: 'LP', value: 'LP' },
					{ name: 'AEDI', value: 'AEDI' },
					{ name: 'AEDII', value: 'AEDII' },
				),
		),

	async execute(interaction: ChatInputCommandInteraction) {
		const monitor = interaction.options.getUser('monitor', true);
		const disciplina = interaction.options.getString('disciplina', true);

		const member = await interaction.guild!.members.fetch(monitor.id).catch(() => null);
		if (!member) {
			return interaction.editReply({ content: '❌ Usuário não encontrado.' });
		}

		const monitorRole = interaction.guild!.roles.cache.find((r) => r.name === `Monitor ${disciplina}`);
		if (!monitorRole) {
			return interaction.editReply({ content: '❌ Cargo de monitor não encontrado.' });
		}

		if (member.roles.cache.has(monitorRole.id)) {
			return interaction.editReply({ content: '❌ Esse usuário já é um monitor dessa disciplina.' });
		}

		await member.roles.add(monitorRole);
		return interaction.editReply({ content: `✅ Monitor ${monitor} da disciplina ${disciplina} adicionado com sucesso!` });
	},
};

export default command;
