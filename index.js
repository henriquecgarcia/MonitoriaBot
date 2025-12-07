import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Collection, Events } from 'discord.js';
import { REST, Routes } from 'discord.js';
import db from './services/db.js';
import fs from 'fs';
import config from './services/config_handler.js';

// Resolve and validate bot token early
const token = process.env.DISCORD_BOT_TOKEN || process.env.TOKEN;
if (!token) {
	console.error('Missing Discord bot token. Set DISCORD_BOT_TOKEN or TOKEN in your environment/.env.');
	process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMessageTyping,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildPresences,
	],
	allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
});

client.commands = new Collection();
client.interactions = new Collection();

client.on(Events.GuildMemberAdded, async member => {
	// Verifica se o membro adicionado está na whitelist
	let role_to_give = await config.get(member.guild.id, 'default_role');
	if (!role_to_give) return;

	let player_id;
	let is_whitelisted = false;

	try {
		const playerId = await getPlayerByDiscordID(member.id);
		if (playerId) {
			player_id = playerId;
			is_whitelisted = await isPlayerWhitelisted(playerId);
		}
	} catch (error) {
		console.error('❌ Erro ao obter ID do jogador:', error);
	}

	if (is_whitelisted) {
		let whitelisted_role = await config.get(member.guild.id, 'whitelisted_role');
		if (whitelisted_role) {
			role_to_give = whitelisted_role;
		} else {
			console.warn(`⚠️ Role de whitelist não configurada para o servidor ${member.guild.id}`);
			return;
		}
	}
	member.roles.add(role_to_give).catch(err => {
		console.error(`❌ Erro ao adicionar role ao membro ${member.id} no servidor ${member.guild.id}:`, err);
	});
});

console.log('🔃 Preparando interações...');
try {
	// Carrega interações de pasta interactions
	for (const f of fs.readdirSync('./interactions').filter(x => x.endsWith('.js'))) {
		const mod = await import(`./interactions/${f}`);
		if (mod.default) {
			if (mod.default.name && mod.default.execute) client.interactions.set(mod.default.name, mod.default);
			else if (typeof mod.default === 'object' && mod.default.length > 0) {
				for (const m of mod.default) {
					if (m.name && m.execute) client.interactions.set(m.name, m);
				}
			}
		}
	}
} catch (e) {
	console.log('Sem interações carregadas automaticamente.', e.message);
}
console.log(`✅ ${client.interactions.size} interações carregadas.`);

// Carrega commands de pasta commands (apenas referência; implementar se quiser carregar dinamicamente)
console.log('🔃 Preparando comandos...');
try {
	for (const f of fs.readdirSync('./commands').filter(x => x.endsWith('.js'))) {
		const mod = await import(`./commands/${f}`);
		if (!mod.default) {
			continue;
		}
		if (mod.default.data && mod.default.execute) {
			client.commands.set(mod.default.data.name, mod.default);
		}
		if (mod.default.handleButtons) {
			for (const [id, func] of Object.entries(mod.default.handleButtons)) {
				if (func) client.interactions.set(id, { name: id, execute: func });
			}
		}
	}
} catch (e) {
	console.log('Sem commands carregados automaticamente.', e.message);
}
console.log(`✅ ${client.commands.size} comandos carregados.`);

// Carrega módulos de pasta modules (apenas referência; implementar se quiser carregar dinamicamente)
console.log('🔃 Preparando módulos...');
const modules = fs.readdirSync('./modules').filter(file => file.endsWith('.js'));
for (const file of modules) {
	const moduleImport = await import(`./modules/${file}`);
	const mod = moduleImport.default || moduleImport;
	if (mod.init) {
		console.log(`🔃 Iniciando módulo ${file}...`);
		mod.init(client);
	}
}
console.log(`✅ ${modules.length} módulos carregados.`);

// Evento ready
client.once(Events.ClientReady, async () => {
	console.log(`✅ Bot conectado como ${client.user.tag}`);

	try {
		await db.createTables();
		console.log('✅ Tabelas do banco de dados verificadas/criadas com sucesso.');
	} catch (e) {
		console.error(`Erro ao conectar ao banco de dados e criar tabelas: ${e}`);
	}

	let guilds = client.guilds.cache.map(guild => guild.id);
	console.log(`✅ Estou em ${guilds.length} servidores!`);

	console.log(`ℹ️  Processando comandos...`);
	(async () => {
		await rest
			.put(Routes.applicationCommands(client.user.id), { body: client.commands.map(command => command.data.toJSON()) })
			.then(() => console.log(`✅ Comandos registrados!`))
			.catch(console.error);
	})();

	console.log('✅ Bot is ready!');

	client.user.setActivity('Monitores', { type: 'WATCHING' });
	client.user.setStatus('busy');
	client.user.setPresence({
		activities: [{ name: 'Monitores', type: 'WATCHING' }],
		status: 'dnd',
	});

	client.user.setAvatar("./assets/Logo.png").then(() => {
		console.log('✅ Avatar definido com sucesso!');
	}).catch(err => {
		console.error('❌ Erro ao definir avatar:', err);
	});
});

import handleCloseTicket from './interactions/closeTicket.js';
import handleOpenTicket from './interactions/openTicket.js';
import handleTicketTypeSelect from './interactions/ticketDropdown.js';

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.guild) {
		interaction.reply({ content: '❌ Este comando só pode ser usado em servidores.', ephemeral: true });
		return;
	}
	// await interaction.deferReply({ ephemeral: true });
	// interaction.editReply({ content: '🔃 Pensando...', ephemeral: true });
	if (interaction.isButton()) {
		const interactionHandler = client.interactions.get(interaction.customId);
		if (interactionHandler) {
			try {
				await interactionHandler.execute(interaction, { client });
			} catch (error) {
				console.error(error);
				await interaction.editReply({ content: '❌ Ocorreu um erro ao executar esta ação!', ephemeral: true });
			}
			return;
		}
		const id = interaction.customId;
		if (id === 'close_ticket') {
			return handleCloseTicket(interaction, { client });
		} else if (id.startsWith('open_ticket::')) {
			return handleOpenTicket(interaction, { client });
		}
	} else if (interaction.isStringSelectMenu()) {
		await interaction.deferReply({ ephemeral: true });
		interaction.editReply({ content: '🔃 Pensando...', ephemeral: true });
		const id = interaction.customId;
		const interactionHandler = client.interactions.get(id);
		if (interactionHandler) {
			await interactionHandler.execute(interaction, { client });
			return;
		}
		if (id === 'ticket_type') {
			return await handleTicketTypeSelect(interaction, { client });
		}
	} else if (interaction.isCommand()) {
		await interaction.deferReply({ ephemeral: true });
		interaction.editReply({ content: '🔃 Pensando...', ephemeral: true });

		const command = client.commands.get(interaction.commandName);
		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			await interaction.editReply({ content: '❌ Comando não encontrado.', ephemeral: true });
			return;
		}

		console.log(`💻 Comando ${interaction.commandName} executado por ${interaction.user.tag} em ${interaction.guild.name}`);
		try {
			return await command.execute(interaction, { client });
		} catch (error) {
			console.error(error);
			return await interaction.editReply({ content: '❌ Ocorreu um erro ao executar este comando!', ephemeral: true });
		}
	}

	// Final fallback for unknown interactions
	if (!interaction.replied && !interaction.deferred) {
		await interaction.reply({ content: '❌ Interação desconhecida. Se o problema persistir, contate um administrador.', ephemeral: true });
	} else {
		await interaction.editReply({ content: '❌ Interação desconhecida. Se o problema persistir, contate um administrador.', ephemeral: true });
	}
});

client.login(token);

