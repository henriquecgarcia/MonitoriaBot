import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import axios from 'axios';
import { networkInterfaces } from 'node:os';
import type { BotCommand } from '../types/index.js';

const command: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('meuip')
		.setDescription('Mostra o IP público e local da máquina do bot'),

	async execute(interaction: ChatInputCommandInteraction) {
		if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
			return interaction.editReply({ content: '❌ Você não tem permissão para usar este comando.' });
		}

		try {
			const { data } = await axios.get<{ ip: string }>('https://api.ipify.org?format=json');
			const publicIP = data.ip;

			let localIP = 'Desconhecido';
			for (const ifaces of Object.values(networkInterfaces())) {
				for (const iface of ifaces ?? []) {
					if (iface.family === 'IPv4' && !iface.internal) {
						localIP = iface.address;
					}
				}
			}

			return interaction.editReply({
				content: `🌐 **IP Público:** \`${publicIP}\`\n🏠 **IP Local:** \`${localIP}\``,
			});
		} catch (err) {
			console.error('[meuip]', err);
			return interaction.editReply({ content: '❌ Ocorreu um erro ao tentar obter o IP.' });
		}
	},
};

export default command;
