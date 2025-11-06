// commands/config.js
import { SlashCommandBuilder, PermissionsBitField, ChannelType } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embeds.js';
import config from '../services/config_handler.js';
import { getAllTicketTypes } from '../services/tickets.js';

// Ensure ticket-specific keys are registered (if module didn't already)
(function registerTicketKeys() {
	try {
		for (const [, t] of getAllTicketTypes()) {
			config.Add(config.TYPES.ROLES, t.roleIdConfig, [], { description: `Cargo(s) com acesso ao Ticket ${t.name}` });
			config.Add(config.TYPES.CHANNEL, t.logChannelConfig, null, { description: `Canal de logs para Ticket ${t.name}` });
			config.Add(config.TYPES.CATEGORY, t.categoryConfig, null, { description: `Categoria para criar Ticket ${t.name}` });
		}
	} catch {}
})();

// Helpers
function toChoicesFromDefs(keys) {
	const arr = [];
	const defs = config.allDefinitions();
	for (const key of keys) {
		const def = defs.get(key);
		if (!def) continue;
		const label = def.description || def.key;
		arr.push({ name: label.length > 100 ? label.slice(0, 100) : label, value: def.key });
	}
	return arr.slice(0, 25);
}

function extractRoleIds(input) {
	if (!input) return [];
	const ids = new Set();
	for (const m of input.matchAll(/<@&(?<id>\d+)>/g)) ids.add(m.groups.id);
	for (const m of input.matchAll(/\b(\d{5,})\b/g)) ids.add(m[1]);
	return [...ids];
}

const roleChoices = toChoicesFromDefs(config.keysByType(config.TYPES.ROLE));
const rolesChoices = toChoicesFromDefs(config.keysByType(config.TYPES.ROLES));
const chanChoices = toChoicesFromDefs(config.keysByType(config.TYPES.CHANNEL));
const catChoices = toChoicesFromDefs(config.keysByType(config.TYPES.CATEGORY));
const boolChoices = toChoicesFromDefs(config.keysByType(config.TYPES.BOOL));
const strChoices = toChoicesFromDefs(config.keysByType(config.TYPES.STRING));

const allChoices = toChoicesFromDefs([...config.allDefinitions().keys()]);

export default {
	data: new SlashCommandBuilder()
		.setName('config')
		.setDescription('Gerenciar configurações do bot (tudo via Discord)')
			// SET ROLE (um cargo)
			.addSubcommand(sc => sc.setName('set-role').setDescription('Define um cargo para uma chave')
				.addStringOption(o => o.setName('chave').setDescription('Chave da configuração').setRequired(true).setChoices(...roleChoices))
				.addRoleOption(o => o.setName('valor').setDescription('Cargo').setRequired(true)))
		// SET ROLES (múltiplos cargos via CSV/menções)
			.addSubcommand(sc => sc.setName('set-roles').setDescription('Define múltiplos cargos (CSV ou menções) para uma chave')
				.addStringOption(o => o.setName('chave').setDescription('Chave da configuração').setRequired(true).setChoices(...rolesChoices))
			.addStringOption(o => o.setName('valor').setDescription('IDs ou menções de cargos separados por vírgula').setRequired(true)))
		// SET CHANNEL (texto)
		.addSubcommand(sc => sc.setName('set-channel').setDescription('Define um canal de texto para uma chave')
			.addStringOption(o => o.setName('chave').setDescription('Chave da configuração').setRequired(true).setChoices(...chanChoices))
			.addChannelOption(o => o.setName('valor').setDescription('Canal de texto').setRequired(true).addChannelTypes(ChannelType.GuildText)))
		// SET CATEGORY
		.addSubcommand(sc => sc.setName('set-category').setDescription('Define uma categoria para criação de tickets')
			.addStringOption(o => o.setName('chave').setDescription('Chave da configuração').setRequired(true).setChoices(...catChoices))
			.addChannelOption(o => o.setName('valor').setDescription('Categoria').setRequired(true).addChannelTypes(ChannelType.GuildCategory)))
		// SET BOOL
		.addSubcommand(sc => sc.setName('set-bool').setDescription('Define um valor booleano (true/false)')
			.addStringOption(o => o.setName('chave').setDescription('Chave da configuração').setRequired(true).setChoices(...boolChoices))
			.addBooleanOption(o => o.setName('valor').setDescription('Valor').setRequired(true)))
		// SET STRING
		.addSubcommand(sc => sc.setName('set-string').setDescription('Define um valor bruto (texto)')
			.addStringOption(o => o.setName('chave').setDescription('Chave da configuração').setRequired(true).setChoices(...strChoices))
			.addStringOption(o => o.setName('valor').setDescription('Valor (texto)').setRequired(true)))
		// GET
		.addSubcommand(sc => sc.setName('get').setDescription('Mostra o valor atual de uma chave')
			.addStringOption(o => o.setName('chave').setDescription('Chave').setRequired(true).setChoices(...allChoices)))
		// LIST
		.addSubcommand(sc => sc.setName('list').setDescription('Lista as chaves configuráveis e seus propósitos')),
	async execute(interaction, { client }) {

			// Permissões: Admin OU editor_role
			const editorRole = await config.get(interaction.guildId, 'editor_role');
		const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
		const isEditor = editorRole && interaction.member.roles.cache.has(editorRole);
		if (!isAdmin && !isEditor) {
			return interaction.editReply({ embeds: [errorEmbed('Sem permissão', '❌ Você não pode usar este comando.')], ephemeral: true });
		}

		const sub = interaction.options.getSubcommand();
		const guildId = interaction.guildId;
		const guild = interaction.guild;

		try {
			if (sub === 'set-role') {
				const key = interaction.options.getString('chave');
				const role = interaction.options.getRole('valor');
					await config.set(guildId, key, role.id);
				return interaction.editReply({ embeds: [successEmbed('Config atualizada', `\`${key}\` = <@&${role.id}>`)] });
			}
			if (sub === 'set-roles') {
				const key = interaction.options.getString('chave');
				const raw = interaction.options.getString('valor');
				const ids = extractRoleIds(raw);
				if (!ids.length) return interaction.editReply({ embeds: [errorEmbed('Entrada inválida', 'Informe cargos por menção (<@&id>) ou IDs separados por vírgula.')]});
					await config.set(guildId, key, ids);
				return interaction.editReply({ embeds: [successEmbed('Config atualizada', `\`${key}\` = ${ids.map(id => `<@&${id}>`).join(', ')}`)] });
			}
			if (sub === 'set-channel') {
				const key = interaction.options.getString('chave');
				const ch = interaction.options.getChannel('valor');
					await config.set(guildId, key, ch.id);
				return interaction.editReply({ embeds: [successEmbed('Config atualizada', `\`${key}\` = <#${ch.id}>`)] });
			}
			if (sub === 'set-category') {
				const key = interaction.options.getString('chave');
				const cat = interaction.options.getChannel('valor');
					await config.set(guildId, key, cat.id);
				return interaction.editReply({ embeds: [successEmbed('Config atualizada', `\`${key}\` = <#${cat.id}>`)] });
			}
			if (sub === 'set-bool') {
				const key = interaction.options.getString('chave');
				const val = interaction.options.getBoolean('valor');
					await config.set(guildId, key, val);
				return interaction.editReply({ embeds: [successEmbed('Config atualizada', `\`${key}\` = \`${val}\``)] });
			}
			if (sub === 'set-string') {
				const key = interaction.options.getString('chave');
				const val = interaction.options.getString('valor');
					await config.set(guildId, key, val);
				return interaction.editReply({ embeds: [successEmbed('Config atualizada', `\`${key}\` = \`${val}\``)] });
			}
			if (sub === 'get') {
				const key = interaction.options.getString('chave');
					const val = await config.get(guildId, key);
					const pretty = config.formatValue(key, val, guild);
				return interaction.editReply({ embeds: [infoEmbed('Valor atual', `\`${key}\` = ${pretty}`)] });
			}
			if (sub === 'list') {
					const defs = config.allDefinitions();
					const fmt = (keys) => keys.map(k => {
						const d = defs.get(k);
						return d ? `• \`${d.key}\` — ${d.description || d.type}` : null;
					}).filter(Boolean).slice(0, 20).join('\n') || '—';
					const embed = infoEmbed('Chaves configuráveis', 'Selecione a subcategoria correta para alterar cada chave.')
						.addFields(
							{ name: 'Canais (logs/transcripts)', value: fmt(config.keysByType(config.TYPES.CHANNEL)) },
							{ name: 'Categorias (tickets)', value: fmt(config.keysByType(config.TYPES.CATEGORY)) },
							{ name: 'Cargos (único)', value: fmt(config.keysByType(config.TYPES.ROLE)) },
							{ name: 'Cargos (múltiplos)', value: fmt(config.keysByType(config.TYPES.ROLES)) },
							{ name: 'Booleanos', value: fmt(config.keysByType(config.TYPES.BOOL)) },
							{ name: 'Strings', value: fmt(config.keysByType(config.TYPES.STRING)) }
						);
				return interaction.editReply({ embeds: [embed] });
			}

			return interaction.editReply({ embeds: [errorEmbed('Subcomando desconhecido', 'Use /config list para ver as opções disponíveis.')] });
		} catch (e) {
			console.error(e);
			return interaction.editReply({ embeds: [errorEmbed('Falha', `❌ ${e.message}`)] });
		}
	}
};
