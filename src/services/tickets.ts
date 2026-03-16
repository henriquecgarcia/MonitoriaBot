/**
 * Ticket Service
 *
 * Handles creation, assignment and closure of tickets.
 * Key improvements over the original:
 *  - pendingTicketCreations Set prevents race-condition double-creation
 *  - All DB calls use both guildId + channelId (fixes original bugs)
 *  - Ticket type definitions are centralised here and registered in config
 *  - No hardcoded IDs – everything is resolved via config_handler
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } from 'discord.js';
import type { Guild, GuildChannel, TextChannel, User, GuildMember } from 'discord.js';
import db from './db.js';
import config from './config_handler.js';
import { logger } from './logger.js';
import formatDate from '../utils/formatDate.js';
import discordTranscript from 'discord-html-transcripts';
import type {
	TicketTypeDefinition,
	CreateTicketOptions,
	CloseTicketOptions,
	AssignTicketOptions,
	BotClient,
} from '../types/index.js';

// ────────────────────────────────────────────────────────────────────────────────
// Ticket type definitions
// ────────────────────────────────────────────────────────────────────────────────

const ticketTypes: Record<string, TicketTypeDefinition> = {
	lp: {
		name: 'Lógica de programação',
		description: 'Dúvidas relacionadas à lógica de programação.',
		color: 0x00ae86,
		roleIdConfig: 'ticket_role_lp',
		logChannelConfig: 'log_ticket_lp',
		categoryConfig: 'ticket_lp_category',
	},
	aed1: {
		name: 'AED 1',
		description: 'Dúvidas relacionadas à disciplina de AED 1.',
		color: 0x00ae86,
		roleIdConfig: 'ticket_role_aed1',
		logChannelConfig: 'log_ticket_aed1',
		categoryConfig: 'ticket_aed1_category',
	},
	aed2: {
		name: 'AED 2',
		description: 'Dúvidas relacionadas à disciplina de AED 2.',
		color: 0x00ae86,
		roleIdConfig: 'ticket_role_aed2',
		logChannelConfig: 'log_ticket_aed2',
		categoryConfig: 'ticket_aed2_category',
	},
	geral: {
		name: 'Geral',
		description: 'Dúvidas gerais sobre o servidor de discord.',
		color: 0x00ae86,
		roleIdConfig: 'ticket_role_geral',
		logChannelConfig: 'log_ticket_geral',
		categoryConfig: 'ticket_geral_category',
	},
};

// Register ticket-specific config keys
for (const [key, t] of Object.entries(ticketTypes)) {
	try {
		config.Add(config.TYPES.ROLES, t.roleIdConfig, [], { description: `Cargo(s) com acesso ao Ticket ${t.name}` });
		config.Add(config.TYPES.CHANNEL, t.logChannelConfig, null, { description: `Canal de logs para Ticket ${t.name}` });
		config.Add(config.TYPES.CATEGORY, t.categoryConfig, null, { description: `Categoria para criar Ticket ${t.name}` });
	} catch {
		logger.error('TICKET_CONFIG', `Erro ao registrar config keys para tipo "${key}"`);
	}
}

export default ticketTypes;

// ────────────────────────────────────────────────────────────────────────────────
// Public accessors
// ────────────────────────────────────────────────────────────────────────────────

export function getTicketTypesAndNames(): Array<[string, string]> {
	return Object.entries(ticketTypes).map(([k, t]) => [k, t.name]);
}

export function getTicketType(_guildId: string, typeKey: string): TicketTypeDefinition {
	const key = typeKey.toLowerCase();
	return ticketTypes[key] ?? ticketTypes['geral']!;
}

export function getAllTicketTypes(): Array<[string, TicketTypeDefinition & { key: string }]> {
	return Object.entries(ticketTypes).map(([k, t]) => [k, { ...t, key: k }]);
}

// ────────────────────────────────────────────────────────────────────────────────
// Rate limiting  +  in-flight creation guard (prevents race conditions)
// ────────────────────────────────────────────────────────────────────────────────

const RATE_LIMIT_MS = 60_000; // 1 minute
const lastTicketAt = new Map<string, number>();
const pendingTicketCreations = new Set<string>(); // key = `${guildId}-${userId}`

function getRateLimitKey(guildId: string, userId: string): string {
	return `${guildId}-${userId}`;
}

function isRateLimited(guildId: string, userId: string): boolean {
	const key = getRateLimitKey(guildId, userId);
	const ts = lastTicketAt.get(key) ?? 0;
	return Date.now() - ts < RATE_LIMIT_MS;
}

function markRateLimit(guildId: string, userId: string): void {
	lastTicketAt.set(getRateLimitKey(guildId, userId), Date.now());
}

function clearRateLimit(guildId: string, userId: string): void {
	lastTicketAt.delete(getRateLimitKey(guildId, userId));
}

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────

function sanitizeName(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, '-')
		.replace(/-+/g, '-')
		.slice(0, 50);
}

// ────────────────────────────────────────────────────────────────────────────────
// createTicket
// ────────────────────────────────────────────────────────────────────────────────

export async function createTicket({ guild, user, type, client }: CreateTicketOptions): Promise<TextChannel> {
	if (!guild) throw new Error('Guild obrigatória');

	const key = getRateLimitKey(guild.id, user.id);

	// Guard: prevent concurrent creation for the same user
	if (pendingTicketCreations.has(key)) throw new Error('ERR_RATE_LIMIT');
	if (isRateLimited(guild.id, user.id)) throw new Error('ERR_RATE_LIMIT');

	pendingTicketCreations.add(key);

	try {
		return await _createTicketInternal({ guild, user, type, client });
	} finally {
		pendingTicketCreations.delete(key);
	}
}

async function _createTicketInternal({ guild, user, type, client }: CreateTicketOptions): Promise<TextChannel> {
	const ticketType = getTicketType(guild.id, type);

	logger.info('TICKET_CREATE', `Criando ticket tipo="${type}" (${ticketType.name}) para user=${user.tag} (${user.id}) guild=${guild.name} (${guild.id})`);

	// Resolve category
	const catId = (await config.get(guild.id, ticketType.categoryConfig)) as string | null;
	if (!catId) {
		clearRateLimit(guild.id, user.id);
		throw new Error('ERR_MISSING_CATEGORY');
	}

	const category = (guild.channels.cache.get(catId) ?? (await guild.channels.fetch(catId).catch(() => null))) as GuildChannel | null;
	if (!category || category.type !== 4) {
		clearRateLimit(guild.id, user.id);
		throw new Error('ERR_MISSING_CATEGORY');
	}

	// Create the channel
	const slug = sanitizeName(`${user.username}-${type}`);
	const channel = (await guild.channels.create({
		name: slug,
		type: 0, // GUILD_TEXT
		parent: catId,
		permissionOverwrites: [
			{ id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
			{
				id: user.id,
				allow: [
					PermissionsBitField.Flags.ViewChannel,
					PermissionsBitField.Flags.SendMessages,
					PermissionsBitField.Flags.ReadMessageHistory,
				],
			},
		],
	})) as TextChannel;

	// Grant staff roles channel access
	const staffRoles = (await config.get(guild.id, ticketType.roleIdConfig)) as string[];
	if (staffRoles?.length) {
		for (const roleId of staffRoles) {
			await channel.permissionOverwrites
				.edit(roleId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true })
				.catch(() => null);
		}
	}

	// Persist to DB
	await db.insertTicket(guild.id, channel.id, type, user.id);

	// Mark rate limit only after successful creation
	markRateLimit(guild.id, user.id);

	// Build welcome embed + action row
	const placeholder =
		`Este canal é um ticket do tipo **${ticketType.name}** aberto por <@${user.id}>.\n` +
		`Aguarde a equipe de monitores atender seu ticket.\n\n` +
		`**Não feche este canal, a equipe de monitores irá fechá-lo quando sua dúvida for resolvida.**\n\n` +
		`*Tipo de Ticket: ${ticketType.description}*`;

	const pingText =
		(staffRoles?.length ? `<@&${staffRoles[0]}>` : '') +
		`\nOlá <@${user.id}>, agradecemos por ter aberto um ticket, aguarde um momento que a equipe de monitores irá atendê-lo em breve.\n\n` +
		`* Caso demore, envie mais mensagens para subir o ticket na fila.\n` +
		`* Tickets devem ser usados apenas para assuntos relacionados à UNIFESP e dúvidas de programação.`;

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setCustomId('close_ticket').setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger),
		new ButtonBuilder().setCustomId('claim_ticket').setLabel('Assumir Ticket').setStyle(ButtonStyle.Success),
		new ButtonBuilder().setCustomId('admin_menu_ticket').setLabel('Menu Admin').setStyle(ButtonStyle.Secondary),
	);

	const embed = new EmbedBuilder()
		.setTitle(`Ticket: ${ticketType.name}`)
		.setDescription(placeholder)
		.setColor(ticketType.color)
		.setTimestamp()
		.setFooter({ text: `Ticket criado em ${formatDate(new Date())}` })
		.setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
		.setThumbnail(guild.iconURL())
		.addFields(
			{ name: 'Tipo de Ticket', value: ticketType.name, inline: true },
			{ name: 'Criado por', value: `<@${user.id}>`, inline: true },
			{ name: 'Status', value: 'Aberto', inline: true },
		);

	await channel.send({ content: pingText, embeds: [embed], components: [row] });

	// Optional global ticket log
	const logChannelId = (await config.get(guild.id, 'ticket_log')) as string | null;
	if (logChannelId) {
		const logCh = await (client as BotClient).channels.fetch(logChannelId).catch(() => null);
		if (logCh?.isTextBased()) {
			await (logCh as TextChannel)
				.send({
					embeds: [
						new EmbedBuilder()
							.setTitle('📩 Ticket criado')
							.addFields(
								{ name: 'Canal', value: `<#${channel.id}>`, inline: true },
								{ name: 'Autor', value: `<@${user.id}>`, inline: true },
								{ name: 'Tipo', value: type, inline: true },
							)
							.setColor(0x57f287)
							.setTimestamp(),
					],
				})
				.catch(() => null);
		}
	}

	return channel;
}

// ────────────────────────────────────────────────────────────────────────────────
// assignTicket
// ────────────────────────────────────────────────────────────────────────────────

export async function assignTicket({ channel, assignedTo }: AssignTicketOptions): Promise<void> {
	const guild = channel.guild;
	const ticketData = await db.getTicketByChannel(guild.id, channel.id);
	if (!ticketData) throw new Error('ERR_NOT_A_TICKET');

	await db.assignTicket(guild.id, channel.id, assignedTo.id);

	// Update the original ticket embed to show who claimed it
	let allMessages: import('discord.js').Message[] = [];
	let lastId: string | undefined;

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const options: { limit: number; before?: string } = { limit: 100 };
		if (lastId) options.before = lastId;
		const msgs = await channel.messages.fetch(options);
		if (!msgs.size) break;
		allMessages.push(...msgs.values());
		lastId = msgs.last()!.id;
		if (msgs.size < 100) break;
	}

	const original = allMessages.reverse()[0];
	if (!original || !original.embeds[0]) return;

	const updated = EmbedBuilder.from(original.embeds[0])
		.addFields({ name: 'Atendido por', value: `<@${assignedTo.id}>`, inline: true })
		.setColor(0xffff00);

	await original.edit({ embeds: [updated] }).catch(() => null);
}

// ────────────────────────────────────────────────────────────────────────────────
// canClaimTicket
// ────────────────────────────────────────────────────────────────────────────────

export async function canClaimTicket(guild: Guild, member: GuildMember, channel: TextChannel): Promise<boolean> {
	const ticketData = await db.getTicketByChannel(guild.id, channel.id);
	if (!ticketData) throw new Error('ERR_NOT_A_TICKET');

	const ticketConfig = getTicketType(guild.id, ticketData.ticket_type);

	if (ticketData.assigned_id) throw new Error('ERR_TICKET_ALREADY_ASSIGNED');

	const staffRoles = (await config.get(guild.id, ticketConfig.roleIdConfig)) as string[];
	if (!staffRoles?.length) throw new Error('ERR_NO_STAFF_ROLES_CONFIGURED');

	return staffRoles.some((roleId) => member.roles.cache.has(roleId));
}

// ────────────────────────────────────────────────────────────────────────────────
// closeTicket
// ────────────────────────────────────────────────────────────────────────────────

export async function closeTicket({ channel, closedBy, client, opts = {} }: CloseTicketOptions): Promise<void> {
	const guild = channel.guild;
	const ticketData = await db.getTicketByChannel(guild.id, channel.id);
	if (!ticketData) throw new Error('ERR_NOT_A_TICKET');

	const ticketConfig = getTicketType(guild.id, ticketData.ticket_type);

	// Resolve transcript log channel
	let logTranscriptId = (await config.get(guild.id, ticketConfig.logChannelConfig)) as string | null;
	if (!logTranscriptId) {
		logTranscriptId = (await config.get(guild.id, 'log_transcript')) as string | null;
	}
	if (!logTranscriptId) throw new Error('ERR_MISSING_LOG_TRANSCRIPT');

	const logCh = await client.channels.fetch(logTranscriptId).catch(() => null);
	if (!logCh?.isTextBased()) throw new Error('ERR_LOG_CHANNEL_NOT_FOUND');

	// Generate HTML transcript
	let transcript: import('discord.js').AttachmentBuilder | null = null;
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const result = await (discordTranscript as any).createTranscript(channel, {
			limit: -1,
			returnType: 'attachment',
			filename: `transcript_${ticketData.ticket_type}-${ticketData.ticket_id}.html`,
			footerText: `Ticket: ${ticketData.ticket_type} | ID: ${ticketData.ticket_id} | Fechado por: ${closedBy.tag}`,
			poweredBy: false,
		});
		transcript = result as import('discord.js').AttachmentBuilder;
	} catch (err) {
		logger.warn('TICKET_CLOSE', 'Falha ao gerar transcript HTML, ignorando:', (err as Error).message);
	}

	await (logCh as TextChannel).send({
		content: `Transcript do ticket ${ticketData.ticket_type}#${ticketData.ticket_id} — fechado por <@${closedBy.id}>`,
		files: transcript ? [transcript] : [],
	});

	const creatorId = ticketData.author_id;
	if (creatorId) {
		// Notify the creator about the ticket closure
		const creator = await guild.members.fetch(creatorId).catch(() => null);
		if (creator) {
			await creator.createDM().then((dm) => {
				dm.send({
					content: `Seu ticket ${ticketData.ticket_type}#${ticketData.ticket_id} foi fechado por ${closedBy.tag}.`,
					files: transcript ? [transcript] : []
				}).then(() => {
					logger.info('TICKET_CLOSE', `Notificação enviada para o criador do ticket ${creator.user.tag} (${creator.id})`);
				}).catch(err => {
					logger.warn('TICKET_CLOSE', `Falha ao enviar notificação para o criador do ticket ${creator.user.tag} (${creator.id}):`, err);
				});
			}).catch(err => {
				logger.warn('TICKET_CLOSE', `Falha ao criar DM para o criador do ticket ${creator.user.tag} (${creator.id}):`, err);
			});
		}
	}

	// Persist closed status
	await db.closeTicket(channel.id, closedBy.id);

	logger.info(
		'TICKET_CLOSE',
		`Ticket #${ticketData.ticket_id} (${ticketData.ticket_type}) fechado por ${closedBy.tag} (${closedBy.id}) no guild ${guild.id}`,
	);

	// Rename channel
	if (opts.renameClosed !== false) {
		await channel.setName(`closed-${channel.name}`).catch(() => null);
	}

	// Revoke send permissions
	await channel.permissionOverwrites.edit(guild.roles.everyone.id, { SendMessages: false }).catch(() => null);

	// Auto-delete if configured
	const autoDelete = await config.get(guild.id, 'ticket_auto_delete');
	if (autoDelete === true || opts.autoDelete) {
		await channel.delete('Ticket auto-delete on close').catch(() => null);
	}
}
