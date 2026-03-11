import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../types/index.js';

const command: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('monitoria')
		.setDescription('Inicia uma sessão de monitoria')
		.addStringOption((o) =>
			o
				.setName('materia')
				.setDescription('Qual matéria você quer monitorar?')
				.setRequired(true)
				.addChoices(
					{ name: 'Lógica de Programação', value: 'lp' },
					{ name: 'Algoritmos e Estruturas de Dados I', value: 'aed i' },
					{ name: 'Algoritmos e Estruturas de Dados II', value: 'aed ii' },
				),
		)
		.addBooleanOption((o) => o.setName('online').setDescription('A monitoria será online?').setRequired(false)),

	async execute(interaction: ChatInputCommandInteraction) {
		const materia = interaction.options.getString('materia', true);
		const online = interaction.options.getBoolean('online') ?? false;
		const guild = interaction.guild!;

		if (!interaction.member || !('roles' in interaction.member)) {
			return interaction.editReply({ content: '❌ Este comando só pode ser usado em um servidor.' });
		}

		const member = interaction.member as import('discord.js').GuildMember;
		const hasMonitorRole = member.roles.cache.some((r) => r.name.toLowerCase() === `monitor ${materia}`);
		if (!hasMonitorRole) {
			return interaction.editReply({ content: '❌ Você não tem permissão para usar este comando.' });
		}

		// Find the matching student role
		const allRoles = guild.roles.cache.filter((r) => r.name.toLowerCase().includes('aluno'));
		let role = allRoles.find((r) => r.name.toLowerCase().includes(materia)) ?? allRoles.first();

		if (!role) {
			return interaction.editReply({ content: '❌ Nenhum cargo de aluno encontrado.' });
		}

		const channel = interaction.channel as import('discord.js').TextChannel;
		if (!channel) {
			return interaction.editReply({ content: '❌ Canal não encontrado.' });
		}

		await interaction.editReply({ content: `✅ Monitoria de **${materia.toUpperCase()}** iniciada!` });

		const embed = new EmbedBuilder()
			.setColor(0x0099ff)
			.setTitle('Monitoria Iniciada')
			.setDescription(`A monitoria de **${materia.toUpperCase()}** foi iniciada!`)
			.addFields({ name: 'Modo', value: online ? 'Online' : 'Presencial', inline: true })
			.setTimestamp();

		await channel.send({
			content: `<@&${role.id}> Começando a monitoria de **${materia.toUpperCase()}**, ${online ? 'online' : 'presencialmente'}.`,
			embeds: [embed],
		});
	},
};

export default command;
