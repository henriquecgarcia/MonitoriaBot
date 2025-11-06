import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, PermissionFlagsBits, ButtonStyle } from 'discord.js';
import db from '../services/db.js';
import fs from 'fs';
import path from 'path';

const __dirname = path.resolve();

const create_folder_if_not_exists = (folder) => {
	if (!fs.existsSync(folder)) {
		fs.mkdirSync(folder, { recursive: true });
	}
};

async function createBackup(interaction) {
	create_folder_if_not_exists(path.join(__dirname, 'backups'));
	try {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const filename = `backup-${timestamp}.sql`;
		const filepath = path.join(__dirname, 'backups', filename);

		// Criar diretório de backups se não existir
		const backupDir = path.join(__dirname, 'backups');
		if (!fs.existsSync(backupDir)) {
			fs.mkdirSync(backupDir, { recursive: true });
		}

		// Executar backup das tabelas principais
		const configsData = await db.query('SELECT * FROM configs', []);
		const ticketsData = await db.query('SELECT * FROM tickets', []);
		
		const backupData = {
			timestamp: new Date().toISOString(),
			tables: {
				configs: configsData,
				tickets: ticketsData
			}
		};

		fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2));
		interaction.editReply({ content: `✅ Backup criado com sucesso: ${filename}`, ephemeral: true });
	} catch (error) {
		console.error('Erro ao criar backup:', error);
		interaction.editReply({ content: '❌ Erro ao criar backup.', ephemeral: true });
	}
}

async function restoreBackup(interaction, fileContent) {
	create_folder_if_not_exists(path.join(__dirname, 'backups'));
	try {
		const backupData = JSON.parse(fileContent);
		
		if (!backupData.tables || !backupData.tables.configs || !backupData.tables.tickets) {
			throw new Error('Formato de backup inválido');
		}

		// Limpar tabelas existentes (cuidado!)
		await db.query('DELETE FROM configs', []);
		await db.query('DELETE FROM tickets', []);

		// Restaurar configs
		for (const config of backupData.tables.configs) {
			await db.query(
				'INSERT INTO configs (guild_id, config_key, config_value, updated_at) VALUES (?, ?, ?, ?)',
				[config.guild_id, config.config_key, config.config_value, config.updated_at]
			);
		}

		// Restaurar tickets
		for (const ticket of backupData.tables.tickets) {
			await db.query(
				'INSERT INTO tickets (ticket_id, guild_id, channel_id, ticket_type, author_id, assigned_id, status, created_at, closed_at, closed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
				[ticket.ticket_id, ticket.guild_id, ticket.channel_id, ticket.ticket_type, ticket.author_id, ticket.assigned_id, ticket.status, ticket.created_at, ticket.closed_at, ticket.closed_by]
			);
		}

		interaction.editReply({ content: '✅ Backup restaurado com sucesso.', ephemeral: true });
	} catch (error) {
		console.error('Erro ao restaurar backup:', error);
		interaction.editReply({ content: '❌ Erro ao restaurar backup. Verifique o formato do arquivo.', ephemeral: true });
	}
}

let currentPage = 1;

async function listBackups(interaction, page = 1) {
	create_folder_if_not_exists(path.join(__dirname, 'backups'));
	const backupDir = path.join(__dirname, 'backups');
	fs.readdir(backupDir, (err, files) => {
		if (err) {
			console.error(err);
			return interaction.editReply({ content: '❌ Erro ao listar backups.', ephemeral: true });
		}

		const _files = files.filter(file => file.endsWith('.sql'));
		_files.sort((a, b) => fs.statSync(path.join(backupDir, b)).mtime - fs.statSync(path.join(backupDir, a)).mtime);

		let embed = new EmbedBuilder()
			.setTitle('Arquivos de Backup')
			.setColor(0x00AE86)
			.setDescription(`Lista de arquivos de backup disponíveis (Página ${page}/${Math.ceil(_files.length / 10)}):`)
			.setTimestamp()
			.setFooter({ text: 'Sistema de Backup do Bot' });

		let shownFiles = _files.slice((page - 1) * 10, page * 10);
		if (shownFiles.length === 0) {
			embed.addFields({ name: 'Nenhum backup encontrado.', value: 'Use /backup create para criar um novo backup.' });
			return interaction.editReply({ embeds: [embed], ephemeral: true });
		}

		embed.addFields({ name: 'Backups Disponíveis', value: shownFiles.join('\n') });

		// Adicionando botões de paginação
		const row = {
			type: 1,
			components: [
				new ButtonBuilder()
					.setCustomId('prev_page_backup')
					.setLabel('Página Anterior')
					.setStyle(ButtonStyle.Primary)
					.setDisabled(page <= 1),
				new ButtonBuilder()
					.setCustomId('next_page_backup')
					.setLabel('Próxima Página')
					.setStyle(ButtonStyle.Primary)
					.setDisabled(shownFiles.length < 10)
			]
		};
		currentPage = page;

		return interaction.editReply({ embeds: [embed], components: [row] });
	});
}
async function deleteBackup(interaction, filename) {
	create_folder_if_not_exists(path.join(__dirname, 'backups'));
	const backupDir = path.join(__dirname, 'backups');
	const filepath = path.join(backupDir, filename);
	fs.unlink(filepath, (err) => {
		if (err) {
			console.error(err);
			return interaction.editReply({ content: '❌ Erro ao deletar backup. Verifique se o arquivo existe.', ephemeral: true });
		}
		interaction.editReply({ content: `✅ Backup ${filename} deletado com sucesso.`, ephemeral: true });
	});
}

export default { 
	data: new SlashCommandBuilder()
	.setName('backup').setDescription('Sistema de Backup do Bot')
	.setDefaultMemberPermissions(0)
	.addSubcommand(subcommand => subcommand.setName('create')
		.setDescription('Cria um backup do banco de dados do bot'))
	.addSubcommand(subcommand => subcommand.setName('restore')
		.setDescription('Restaura um backup do banco de dados do bot')
		.addStringOption(option => option.setName('file')
			.setDescription('Conteúdo do arquivo de backup')
			.setRequired(true)))
	.addSubcommand(subcommand => subcommand.setName('list')
		.setDescription('Lista os arquivos de backup disponíveis'))
	.addSubcommand(subcommand => subcommand.setName('delete')
		.setDescription('Remove um arquivo de backup')
		.addStringOption(option => option.setName('file')
			.setDescription('Nome do arquivo de backup a ser removido')
			.setRequired(true)))
	,
	async execute(interaction, { client }) {
		if (interaction.member.id !== interaction.guild.ownerId) {
			return interaction.editReply({ content: '❌ Você não tem permissão para usar este comando.' });
		}

		const command = interaction.options.getSubcommand();
		if (command === 'create') {
			await createBackup(interaction);
		} else if (command === 'restore') {
			const fileContent = interaction.options.getString('file');
			await restoreBackup(interaction, fileContent);
		} else if (command === 'list') {
			await listBackups(interaction, 1);
		} else if (command === 'delete') {
			const filename = interaction.options.getString('file');
			await deleteBackup(interaction, filename);
		}
	},
	handleButtons: {
		'prev_page_backup': async (interaction) => {
			if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
				return interaction.editReply({ content: '❌ Você não tem permissão para usar este comando.', ephemeral: true });
			}
			await listBackups(interaction, currentPage - 1);
		},
		'next_page_backup': async (interaction) => {
			if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
				return interaction.editReply({ content: '❌ Você não tem permissão para usar este comando.', ephemeral: true });
			}
			await listBackups(interaction, currentPage + 1);
		}
	}
};