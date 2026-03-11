import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { readdir, unlink, writeFile, readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import db from '../services/db.js';
import type { BotCommand, CommandContext } from '../types/index.js';

const BACKUP_DIR = resolve('backups');

function ensureBackupDir(): void {
	if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
}

async function createBackup(interaction: ChatInputCommandInteraction): Promise<void> {
	ensureBackupDir();
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const filename = `backup-${timestamp}.json`;
	const filepath = join(BACKUP_DIR, filename);

	const [configsData, ticketsData] = await Promise.all([
		db.query('SELECT * FROM configs', []),
		db.query('SELECT * FROM tickets', []),
	]);

	const backupData = { timestamp: new Date().toISOString(), tables: { configs: configsData, tickets: ticketsData } };
	await writeFile(filepath, JSON.stringify(backupData, null, 2));
	await interaction.editReply({ content: `✅ Backup criado: \`${filename}\`` });
}

async function restoreBackup(interaction: ChatInputCommandInteraction, fileContent: string): Promise<void> {
	ensureBackupDir();

	const backupData = JSON.parse(fileContent) as {
		tables?: { configs?: unknown[]; tickets?: unknown[] };
	};

	if (!backupData.tables?.configs || !backupData.tables?.tickets) {
		throw new Error('Formato de backup inválido');
	}

	await db.query('DELETE FROM configs', []);
	await db.query('DELETE FROM tickets', []);

	for (const cfg of backupData.tables.configs as Record<string, unknown>[]) {
		await db.query(
			'INSERT INTO configs (guild_id, config_key, config_value, updated_at) VALUES (?, ?, ?, ?)',
			[cfg.guild_id, cfg.config_key, cfg.config_value, cfg.updated_at],
		);
	}

	for (const ticket of backupData.tables.tickets as Record<string, unknown>[]) {
		await db.query(
			'INSERT INTO tickets (ticket_id, guild_id, channel_id, ticket_type, author_id, assigned_id, status, created_at, closed_at, closed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
			[
				ticket.ticket_id, ticket.guild_id, ticket.channel_id, ticket.ticket_type,
				ticket.author_id, ticket.assigned_id, ticket.status, ticket.created_at,
				ticket.closed_at, ticket.closed_by,
			],
		);
	}

	await interaction.editReply({ content: '✅ Backup restaurado com sucesso.' });
}

let currentPage = 1;

async function listBackups(interaction: ChatInputCommandInteraction, page: number): Promise<void> {
	ensureBackupDir();
	const files = (await readdir(BACKUP_DIR)).filter((f) => f.endsWith('.json') || f.endsWith('.sql'));
	files.sort((a, b) => b.localeCompare(a));

	const totalPages = Math.max(1, Math.ceil(files.length / 10));
	const shown = files.slice((page - 1) * 10, page * 10);

	const embed = new EmbedBuilder()
		.setTitle('Arquivos de Backup')
		.setColor(0x00ae86)
		.setDescription(`Página ${page}/${totalPages}`)
		.setTimestamp()
		.setFooter({ text: 'Sistema de Backup do Bot' })
		.addFields({
			name: shown.length ? 'Backups disponíveis' : 'Nenhum backup encontrado',
			value: shown.length ? shown.join('\n') : 'Use `/backup create` para criar um novo backup.',
		});

	const row = {
		type: 1,
		components: [
			new ButtonBuilder().setCustomId('prev_page_backup').setLabel('◀ Anterior').setStyle(ButtonStyle.Primary).setDisabled(page <= 1),
			new ButtonBuilder().setCustomId('next_page_backup').setLabel('Próxima ▶').setStyle(ButtonStyle.Primary).setDisabled(shown.length < 10),
		],
	};

	currentPage = page;
	await interaction.editReply({ embeds: [embed], components: [row] });
}

async function deleteBackup(interaction: ChatInputCommandInteraction, filename: string): Promise<void> {
	ensureBackupDir();
	const filepath = join(BACKUP_DIR, filename);
	if (!existsSync(filepath)) {
		await interaction.editReply({ content: '❌ Arquivo de backup não encontrado.' });
		return;
	}
	await unlink(filepath);
	await interaction.editReply({ content: `✅ Backup \`${filename}\` deletado.` });
}

const command: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('backup')
		.setDescription('Sistema de Backup do Bot')
		.setDefaultMemberPermissions(0)
		.addSubcommand((sc) => sc.setName('create').setDescription('Cria um backup do banco de dados'))
		.addSubcommand((sc) =>
			sc
				.setName('restore')
				.setDescription('Restaura um backup')
				.addStringOption((o) => o.setName('file').setDescription('Conteúdo JSON do backup').setRequired(true)),
		)
		.addSubcommand((sc) => sc.setName('list').setDescription('Lista backups disponíveis'))
		.addSubcommand((sc) =>
			sc
				.setName('delete')
				.setDescription('Remove um arquivo de backup')
				.addStringOption((o) => o.setName('file').setDescription('Nome do arquivo').setRequired(true)),
		),

	async execute(interaction: ChatInputCommandInteraction, _ctx: CommandContext) {
		if (interaction.member?.user.id !== interaction.guild!.ownerId) {
			return interaction.editReply({ content: '❌ Apenas o dono do servidor pode usar este comando.' });
		}

		const sub = interaction.options.getSubcommand();
		try {
			if (sub === 'create') await createBackup(interaction);
			else if (sub === 'restore') await restoreBackup(interaction, interaction.options.getString('file', true));
			else if (sub === 'list') await listBackups(interaction, 1);
			else if (sub === 'delete') await deleteBackup(interaction, interaction.options.getString('file', true));
		} catch (err) {
			console.error('[backup]', err);
			await interaction.editReply({ content: `❌ Erro: ${err instanceof Error ? err.message : String(err)}` });
		}
	},

	handleButtons: {
		prev_page_backup: async (interaction) => {
			if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
				return interaction.editReply({ content: '❌ Sem permissão.' });
			}
			await listBackups(interaction as unknown as ChatInputCommandInteraction, currentPage - 1);
		},
		next_page_backup: async (interaction) => {
			if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
				return interaction.editReply({ content: '❌ Sem permissão.' });
			}
			await listBackups(interaction as unknown as ChatInputCommandInteraction, currentPage + 1);
		},
	},
};

export default command;
