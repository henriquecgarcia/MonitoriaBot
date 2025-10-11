const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const os = require('os');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('meuip')
		.setDescription('Mostra o IP público e local da máquina do bot'),
	
	async execute(interaction) {
		await interaction.editReply({ content: 'Obtendo IP...', ephemeral: true });

		try {
			// Obtem o IP público usando ipify
			const response = await axios.get('https://api.ipify.org?format=json');
			const publicIP = response.data.ip;

			// Obtem o IP local da máquina
			const interfaces = os.networkInterfaces();
			let localIP = 'Desconhecido';

			for (const name of Object.keys(interfaces)) {
				for (const iface of interfaces[name]) {
					if (iface.family === 'IPv4' && !iface.internal) {
						localIP = iface.address;
					}
				}
			}

			await interaction.editReply({
				content: `🌐 **IP Público:** \`${publicIP}\`\n🏠 **IP Local:** \`${localIP}\``,
			});

		} catch (err) {
			console.error('Erro ao obter IP:', err);
			await interaction.editReply('❌ Ocorreu um erro ao tentar obter o IP.');
		}
	},
};
