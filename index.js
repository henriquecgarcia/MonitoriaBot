require("dotenv").config();
const { REST, Routes, Events, MessageFlags, Client, GatewayIntentBits } = require('discord.js');
const fs = require('node:fs');

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageTyping, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences],
	allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
	presences: [{ name: 'Monitores', type: 'WATCHING' }],
});

global.client = client;
global.fs = fs;
global.rest = rest;

let commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	if (command.data && command.execute) {
		commands.push(command);
	} else {
		console.error(`❌ Comando inválido em ${file}, falta data ou execute.`);
	}
}

client.once('ready', () => {
	console.log(`✅ Bot conectado como ${client.user.tag}`);

	let guilds = client.guilds.cache.map(guild => guild.id);
	console.log(`✅ Servidores: ${guilds.length} servidores`);

	let clientId = client.user.id;
	
	for (const guild of client.guilds.cache) {
		const data = rest.put(Routes.applicationGuildCommands(clientId, guild[0]), {body: commands.map(command => command.data.toJSON())})
		.then(() => console.log(`✅ Comandos registrados para ${guild[1].name}`))
		.catch(console.error);
	}

	client.user.setActivity('Monitores', { type: 'WATCHING' });
	client.user.setStatus('busy')
	client.user.setPresence({
		activities: [{ name: 'Monitores', type: 'WATCHING' }],
		status: 'dnd',
	});

});

const moduleFiles = fs.readdirSync('./modules').filter(file => file.endsWith('.js'));
for (const file of moduleFiles) {
	require(`./modules/${file}`);
}

client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isCommand()) return;
	if (!interaction.guild) {
		return interaction.reply({ content: '❌ Este comando só pode ser usado em servidores.', ephemeral: true });
	}
	const command = commands.find(cmd => cmd.data.name === interaction.commandName);

	if (!command) {
		console.error(`❌ No command matching ${interaction.commandName} was found.`);
		return;
	}

	if (interaction.isChatInputCommand()) {
		if (!interaction.guild.members.me.permissions.has('SendMessages')) {
			return interaction.reply({ content: '❌ Eu não tenho permissão para enviar mensagens neste canal.', ephemeral: true });
		}
		if (!interaction.guild.members.me.permissions.has('EmbedLinks')) {
			return interaction.reply({ content: '❌ Eu não tenho permissão para enviar links incorporados neste canal.', ephemeral: true });
		}

		console.log(`💻 Comando ${interaction.commandName} executado por ${interaction.user.tag} em ${interaction.guild.name}`);
		await interaction.deferReply({ flags: MessageFlags.Ephemeral })
			.catch(console.error);
		if (interaction.user.bot) {
			return interaction.followUp({ content: '❌ Você não pode usar este comando.', ephemeral: true });
		}

		try {
			await command.execute(interaction);
		} catch (error) {
			console.error(error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content: '❌ Ocorreu um erro ao executar este comando!', flags: MessageFlags.Ephemeral });
			} else {
				await interaction.reply({ content: '❌ Ocorreu um erro ao executar este comando!', flags: MessageFlags.Ephemeral });
			}
		}

	} else if (interaction.isAutocomplete()) {

		try {
			await command.autocomplete(interaction);
		} catch (error) {
			console.error(error);
		}
	}

});

client.login(process.env.TOKEN);

