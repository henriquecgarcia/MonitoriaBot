import { SlashCommandBuilder, PermissionsBitField, ChannelType } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { successEmbed, errorEmbed, infoEmbed } from '../utils/embeds.js';
import config from '../services/config_handler.js';
import { getAllTicketTypes } from '../services/tickets.js';
import type { BotCommand, CommandContext } from '../types/index.js';

// Register ticket-specific config keys
(function registerTicketKeys() {
	try {
		for (const [, t] of getAllTicketTypes()) {
			config.Add(config.TYPES.ROLES, t.roleIdConfig, [], { description: `Cargo(s) com acesso ao Ticket ${t.name}` });
			config.Add(config.TYPES.CHANNEL, t.logChannelConfig, null, { description: `Canal de logs para Ticket ${t.name}` });
			config.Add(config.TYPES.CATEGORY, t.categoryConfig, null, { description: `Categoria para criar Ticket ${t.name}` });
		}
	} catch { /* keys already registered */ }
})();

function toChoicesFromDefs(keys: string[]): { name: string; value: string }[] {
	const defs = config.allDefinitions();
	return keys
		.map((key) => {
			const def = defs.get(key);
			if (!def) return null;
			const label = def.description || def.key;
			return { name: label.length > 100 ? label.slice(0, 100) : label, value: def.key };
		})
		.filter(Boolean)
		.slice(0, 25) as { name: string; value: string }[];
}

function extractRoleIds(input: string): string[] {
	const ids = new Set<string>();
	for (const m of input.matchAll(/<@&(?<id>\d+)>/g)) if (m.groups?.id) ids.add(m.groups.id);
	for (const m of input.matchAll(/\b(\d{5,})\b/g)) if (m[1]) ids.add(m[1]);
	return [...ids];
}

const roleChoices = toChoicesFromDefs(config.keysByType(config.TYPES.ROLE));
const rolesChoices = toChoicesFromDefs(config.keysByType(config.TYPES.ROLES));
const chanChoices = toChoicesFromDefs(config.keysByType(config.TYPES.CHANNEL));
const catChoices = toChoicesFromDefs(config.keysByType(config.TYPES.CATEGORY));
const boolChoices = toChoicesFromDefs(config.keysByType(config.TYPES.BOOL));
const strChoices = toChoicesFromDefs(config.keysByType(config.TYPES.STRING));
const allChoices = toChoicesFromDefs([...config.allDefinitions().keys()]);

const command: BotCommand = {
	data: new SlashCommandBuilder()
		.setName('config')
		.setDescription('Gerenciar configurações do bot')
		.addSubcommand((sc) =>
			sc.setName('set-role').setDescription('Define um cargo para uma chave')
				.addStringOption((o) => o.setName('chave').setDescription('Chave').setRequired(true).setChoices(...roleChoices))
				.addRoleOption((o) => o.setName('valor').setDescription('Cargo').setRequired(true)),
		)
		.addSubcommand((sc) =>
			sc.setName('set-roles').setDescription('Define múltiplos cargos para uma chave')
				.addStringOption((o) => o.setName('chave').setDescription('Chave').setRequired(true).setChoices(...rolesChoices))
				.addStringOption((o) => o.setName('valor').setDescription('IDs ou menções separados por vírgula').setRequired(true)),
		)
		.addSubcommand((sc) =>
			sc.setName('set-channel').setDescription('Define um canal de texto para uma chave')
				.addStringOption((o) => o.setName('chave').setDescription('Chave').setRequired(true).setChoices(...chanChoices))
				.addChannelOption((o) => o.setName('valor').setDescription('Canal').setRequired(true).addChannelTypes(ChannelType.GuildText)),
		)
		.addSubcommand((sc) =>
			sc.setName('set-category').setDescription('Define uma categoria para tickets')
				.addStringOption((o) => o.setName('chave').setDescription('Chave').setRequired(true).setChoices(...catChoices))
				.addChannelOption((o) => o.setName('valor').setDescription('Categoria').setRequired(true).addChannelTypes(ChannelType.GuildCategory)),
		)
		.addSubcommand((sc) =>
			sc.setName('set-bool').setDescription('Define um valor booleano')
				.addStringOption((o) => o.setName('chave').setDescription('Chave').setRequired(true).setChoices(...boolChoices))
				.addBooleanOption((o) => o.setName('valor').setDescription('Valor').setRequired(true)),
		)
		.addSubcommand((sc) =>
			sc.setName('set-string').setDescription('Define um valor de texto')
				.addStringOption((o) => o.setName('chave').setDescription('Chave').setRequired(true).setChoices(...strChoices))
				.addStringOption((o) => o.setName('valor').setDescription('Valor').setRequired(true)),
		)
		.addSubcommand((sc) =>
			sc.setName('get').setDescription('Mostra o valor atual de uma chave')
				.addStringOption((o) => o.setName('chave').setDescription('Chave').setRequired(true).setChoices(...allChoices)),
		)
		.addSubcommand((sc) => sc.setName('list').setDescription('Lista chaves configuráveis')),

	async execute(interaction: ChatInputCommandInteraction, _ctx: CommandContext) {
		const editorRole = (await config.get(interaction.guildId!, 'editor_role')) as string | null;
		const isAdmin = interaction.member instanceof Object && 'permissions' in interaction.member
			? (interaction.member.permissions as PermissionsBitField).has(PermissionsBitField.Flags.Administrator)
			: false;
		const isEditor = !!(editorRole && interaction.memberPermissions?.has('ManageGuild'));

		if (!isAdmin && !isEditor) {
			return interaction.editReply({ embeds: [errorEmbed('Sem permissão', '❌ Você não pode usar este comando.')] });
		}

		const sub = interaction.options.getSubcommand();
		const guildId = interaction.guildId!;

		try {
			if (sub === 'set-role') {
				const key = interaction.options.getString('chave', true);
				const role = interaction.options.getRole('valor', true);
				await config.set(guildId, key, role.id);
				return interaction.editReply({ embeds: [successEmbed('Config atualizada', `\`${key}\` = <@&${role.id}>`)] });
			}
			if (sub === 'set-roles') {
				const key = interaction.options.getString('chave', true);
				const ids = extractRoleIds(interaction.options.getString('valor', true));
				if (!ids.length) return interaction.editReply({ embeds: [errorEmbed('Entrada inválida', 'Use menções (<@&id>) ou IDs separados por vírgula.')] });
				await config.set(guildId, key, ids);
				return interaction.editReply({ embeds: [successEmbed('Config atualizada', `\`${key}\` = ${ids.map((id) => `<@&${id}>`).join(', ')}`)] });
			}
			if (sub === 'set-channel') {
				const key = interaction.options.getString('chave', true);
				const ch = interaction.options.getChannel('valor', true);
				await config.set(guildId, key, ch.id);
				return interaction.editReply({ embeds: [successEmbed('Config atualizada', `\`${key}\` = <#${ch.id}>`)] });
			}
			if (sub === 'set-category') {
				const key = interaction.options.getString('chave', true);
				const cat = interaction.options.getChannel('valor', true);
				await config.set(guildId, key, cat.id);
				return interaction.editReply({ embeds: [successEmbed('Config atualizada', `\`${key}\` = <#${cat.id}>`)] });
			}
			if (sub === 'set-bool') {
				const key = interaction.options.getString('chave', true);
				const val = interaction.options.getBoolean('valor', true);
				await config.set(guildId, key, val);
				return interaction.editReply({ embeds: [successEmbed('Config atualizada', `\`${key}\` = \`${val}\``)] });
			}
			if (sub === 'set-string') {
				const key = interaction.options.getString('chave', true);
				const val = interaction.options.getString('valor', true);
				await config.set(guildId, key, val);
				return interaction.editReply({ embeds: [successEmbed('Config atualizada', `\`${key}\` = \`${val}\``)] });
			}
			if (sub === 'get') {
				const key = interaction.options.getString('chave', true);
				const val = await config.get(guildId, key);
				const pretty = config.formatValue(key, val, interaction.guild);
				return interaction.editReply({ embeds: [infoEmbed('Valor atual', `\`${key}\` = ${pretty}`)] });
			}
			if (sub === 'list') {
				const defs = config.allDefinitions();
				const fmt = (keys: string[]) =>
					keys.map((k) => {
						const d = defs.get(k);
						return d ? `• \`${d.key}\` — ${d.description || d.type}` : null;
					}).filter(Boolean).slice(0, 20).join('\n') || '—';

				const embed = infoEmbed('Chaves configuráveis', 'Use o subcomando correto para alterar cada tipo de chave.')
					.addFields(
						{ name: 'Canais', value: fmt(config.keysByType(config.TYPES.CHANNEL)) },
						{ name: 'Categorias', value: fmt(config.keysByType(config.TYPES.CATEGORY)) },
						{ name: 'Cargo (único)', value: fmt(config.keysByType(config.TYPES.ROLE)) },
						{ name: 'Cargos (múltiplos)', value: fmt(config.keysByType(config.TYPES.ROLES)) },
						{ name: 'Booleanos', value: fmt(config.keysByType(config.TYPES.BOOL)) },
						{ name: 'Strings', value: fmt(config.keysByType(config.TYPES.STRING)) },
					);
				return interaction.editReply({ embeds: [embed] });
			}

			return interaction.editReply({ embeds: [errorEmbed('Subcomando desconhecido', 'Use /config list.')] });
		} catch (e) {
			console.error('[config]', e);
			return interaction.editReply({ embeds: [errorEmbed('Falha', `❌ ${e instanceof Error ? e.message : String(e)}`)] });
		}
	},
};

export default command;
