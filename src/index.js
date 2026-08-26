import { Client, Collection, Events, GatewayIntentBits, Routes } from 'discord.js';
import { REST } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import db from './services/db.js';
import config from './services/config_handler.js';
import { logger } from './services/logger.js';
import handleCloseTicket from './interactions/closeTicket.js';
import handleOpenTicket from './interactions/openTicket.js';
import handleTicketTypeSelect from './interactions/ticketDropdown.js';
import { MessageFlags } from 'discord.js';
import { getRuntimeConfig } from './services/env.js';
// ────────────────────────────────────────────────────────────────────────────────
// Validate token early
// ────────────────────────────────────────────────────────────────────────────────
const { token } = getRuntimeConfig();
// ────────────────────────────────────────────────────────────────────────────────
// Client setup
// ────────────────────────────────────────────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.DirectMessageReactions,
    ],
    allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
});
client.commands = new Collection();
client.interactions = new Collection();
const rest = new REST({ version: '10' }).setToken(token);
// ────────────────────────────────────────────────────────────────────────────────
// Dynamic loader helpers
// ────────────────────────────────────────────────────────────────────────────────
const __dirname = fileURLToPath(new URL('.', import.meta.url));
async function loadInteractions() {
    logger.info('STARTUP', 'Carregando interações...');
    const dir = resolve(__dirname, 'interactions');
    const files = (await readdir(dir)).filter((file) => file.endsWith('.js'));
    for (const file of files) {
        const mod = await import(pathToFileURL(resolve(dir, file)).href);
        const exported = mod.default;
        if (!exported)
            continue;
        if (Array.isArray(exported)) {
            for (const item of exported) {
                if (item.name && typeof item.execute === 'function')
                    client.interactions.set(item.name, item);
            }
        }
        else if (typeof exported === 'object' && exported.name && exported.execute) {
            client.interactions.set(exported.name, exported);
        }
    }
    logger.info('STARTUP', `${client.interactions.size} interações carregadas.`);
}
async function loadCommands() {
    logger.info('STARTUP', 'Carregando comandos...');
    const dir = resolve(__dirname, 'commands');
    const files = (await readdir(dir)).filter((file) => file.endsWith('.js'));
    for (const file of files) {
        const mod = await import(pathToFileURL(resolve(dir, file)).href);
        const cmd = mod.default;
        if (!cmd?.data || !cmd.execute)
            continue;
        client.commands.set(cmd.data.name, cmd);
        // Register button handlers exposed by the command
        if (cmd.handleButtons) {
            for (const [id, fn] of Object.entries(cmd.handleButtons)) {
                if (fn)
                    client.interactions.set(id, { name: id, execute: fn });
            }
        }
    }
    logger.info('STARTUP', `${client.commands.size} comandos carregados.`);
}
async function loadModules() {
    logger.info('STARTUP', 'Carregando módulos...');
    const dir = resolve(__dirname, 'modules');
    const files = (await readdir(dir)).filter((file) => file.endsWith('.js'));
    for (const file of files) {
        const mod = await import(pathToFileURL(resolve(dir, file)).href);
        const module = mod.default ?? mod;
        if (typeof module.init === 'function') {
            logger.info('STARTUP', `Iniciando módulo: ${file}`);
            await module.init(client);
        }
    }
    logger.info('STARTUP', `${files.length} módulos carregados.`);
}
// ────────────────────────────────────────────────────────────────────────────────
// Boot sequence
// ────────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────────
// Guild member join – assign default role
// ────────────────────────────────────────────────────────────────────────────────
client.on(Events.GuildMemberAdd, async (member) => {
    const defaultRoleId = (await config.get(member.guild.id, 'default_role'));
    if (!defaultRoleId)
        return;
    await member.roles.add(defaultRoleId).catch((err) => {
        logger.error('ROLE_ASSIGN', `Erro ao adicionar cargo padrão a ${member.id}:`, err);
    });
});
// ────────────────────────────────────────────────────────────────────────────────
// Ready
// ────────────────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
    logger.info('STARTUP', `Bot conectado como ${client.user.tag}`);
    logger.info('STARTUP', `Em ${client.guilds.cache.size} servidores.`);
    // Register slash commands globally
    try {
        await rest.put(Routes.applicationCommands(client.user.id), {
            body: client.commands.map((cmd) => cmd.data.toJSON()),
        });
        logger.info('STARTUP', 'Comandos registrados com sucesso.');
    }
    catch (e) {
        logger.error('STARTUP', 'Erro ao registrar comandos:', e);
    }
    client.user.setPresence({
        activities: [{ name: 'Monitores', type: 3 /* WATCHING */ }],
        status: 'dnd',
    });
    client.user.setAvatar(resolve(process.cwd(), 'assets', 'Logo.png')).catch((err) => {
        logger.warn('STARTUP', 'Não foi possível definir avatar:', err);
    });
    logger.info('STARTUP', '✅ Bot pronto!');
});
// ────────────────────────────────────────────────────────────────────────────────
// Interaction handler
// ────────────────────────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.guild) {
        if (interaction.isRepliable()) {
            await interaction.reply({ content: '❌ Este comando só pode ser usado em servidores.', flags: MessageFlags.Ephemeral });
        }
        return;
    }
    const ctx = { client };
    // ── Button interactions ──────────────────────────────────────────────────────
    if (interaction.isButton()) {
        const id = interaction.customId;
        // Try registered handlers first
        const handler = client.interactions.get(id);
        if (handler) {
            try {
                await handler.execute(interaction, ctx);
            }
            catch (err) {
                logger.error('INTERACTION', `Button handler "${id}" threw:`, err);
                const content = '❌ Ocorreu um erro ao executar esta ação.';
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({ content }).catch(() => null);
                }
                else {
                    await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => null);
                }
            }
            return;
        }
        // Legacy routing for inline handlers
        if (id === 'close_ticket')
            return void handleCloseTicket(interaction, ctx);
        if (id.startsWith('open_ticket::'))
            return void handleOpenTicket(interaction, ctx);
        return;
    }
    // ── Select menu interactions ─────────────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const id = interaction.customId;
        const handler = client.interactions.get(id);
        if (handler) {
            try {
                await handler.execute(interaction, ctx);
            }
            catch (err) {
                logger.error('INTERACTION', `SelectMenu handler "${id}" threw:`, err);
                await interaction.editReply({ content: '❌ Ocorreu um erro.' }).catch(() => null);
            }
            return;
        }
        if (id === 'ticket_type')
            return void handleTicketTypeSelect(interaction, ctx);
        return;
    }
    // ── Slash commands ───────────────────────────────────────────────────────────
    if (interaction.isCommand()) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            logger.warn('INTERACTION', `Comando desconhecido: ${interaction.commandName}`);
            await interaction.editReply({ content: '❌ Comando não encontrado.' });
            return;
        }
        logger.info('COMMAND', `/${interaction.commandName} por ${interaction.user.tag} em ${interaction.guild.name}`);
        try {
            await command.execute(interaction, ctx);
        }
        catch (err) {
            logger.error('COMMAND', `/${interaction.commandName} threw:`, err);
            await interaction.editReply({ content: '❌ Ocorreu um erro ao executar este comando.' }).catch(() => null);
        }
        return;
    }
});
// ────────────────────────────────────────────────────────────────────────────────
// Login
// ────────────────────────────────────────────────────────────────────────────────
let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown)
        return;
    shuttingDown = true;
    logger.info('SHUTDOWN', `Received ${signal}`);
    client.destroy();
    try {
        await db.close();
    }
    catch (error) {
        logger.error('SHUTDOWN', 'Failed to close database pool:', error);
        process.exitCode = 1;
    }
    process.exit(process.exitCode ?? 0);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
async function start() {
    try {
        await db.initDB();
        await db.createTables();
        await loadInteractions();
        await loadCommands();
        await loadModules();
        await client.login(token);
    }
    catch (error) {
        logger.error('STARTUP', 'Startup failed:', error);
        client.destroy();
        await db.close().catch(() => null);
        process.exitCode = 1;
    }
}
await start();
