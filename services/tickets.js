// services/tickets.js
import db from './db.js';
import config from './config_handler.js';
import { AttachmentBuilder, PermissionsBitField, EmbedBuilder } from 'discord.js';
import formatDate from '../utils/formatDate.js';
import discordTranscript from 'discord-html-transcripts';

const RATE_LIMIT_MS = 1 * 60 * 1000; // 5 minutos padrão
const lastTicketAt = new Map(); // key = guildId-userId

var ticketTypes = {
	'lp': {
		name: 'Lógica de programação',
		description: 'Dúvidas relacionadas à lógica de programação.',
		color: 0x00AE86,
		roleIdConfig: 'ticket_role_lp',
		logChannelConfig: 'log_ticket_lp',
		categoryConfig: 'ticket_lp_category'
	},
	'aed1': {
		name: 'AED 1',
		description: 'Dúvidas relacionadas à disciplina de AED 1.',
		color: 0x00AE86,
		roleIdConfig: 'ticket_role_aed1',
		logChannelConfig: 'log_ticket_aed1',
		categoryConfig: 'ticket_aed1_category'
	},
	'aed2': {
		name: 'AED 2',
		description: 'Dúvidas relacionadas à disciplina de AED 2.',
		color: 0x00AE86,
		roleIdConfig: 'ticket_role_aed2',
		logChannelConfig: 'log_ticket_aed2',
		categoryConfig: 'ticket_aed2_category'
	},
	'poo': {
		name: 'POO',
		description: 'Dúvidas relacionadas à disciplina de programação orientada a objeto.',
		color: 0x00AE86,
		roleIdConfig: 'ticket_role_poo',
		logChannelConfig: 'log_ticket_poo',
		categoryConfig: 'ticket_poo_category'
	},
	'geral': {
		name: 'Geral',
		description: 'Dúvidas gerais sobre o servidor de discord.',
		color: 0x00AE86,
		roleIdConfig: 'ticket_role_geral',
		logChannelConfig: 'log_ticket_geral',
		categoryConfig: 'ticket_geral_category'
	}
}

export default ticketTypes;

export function getTicketTypesAndNames() {
	let arr = [];
	for (const key in ticketTypes) {
		arr.push([key, ticketTypes[key].name]);
	}
	return arr;
}
export function getTicketType(guildId, typeKey) {
	const key = typeKey.toLowerCase();
	return ticketTypes[key] || ticketTypes['geral'];
}
export function getAllTicketTypes() {
	let send_data = [];
	for (const key in ticketTypes) {
		ticketTypes[key].key = key; // adiciona key no objeto
		send_data.push([key, ticketTypes[key]]);
	}
	return send_data;
}

// Register ticket-specific config keys in the central config service
for (const key in ticketTypes) {
	const t = ticketTypes[key];
	try {
		config.Add(config.TYPES.ROLE, t.roleIdConfig, [], { description: `Cargo(s) com acesso ao Ticket ${t.name}` });
		config.Add(config.TYPES.CHANNEL, t.logChannelConfig, null, { description: `Canal de logs para Ticket ${t.name}` });
		config.Add(config.TYPES.CATEGORY, t.categoryConfig, null, { description: `Categoria para criar Ticket ${t.name}` });
	} catch {
		console.error(`Erro ao registrar config keys para Ticket Type ${key}`);
	}
}

function rateLimited(guildId, userId) {
	const key = `${guildId}-${userId}`;
	const ts = lastTicketAt.get(key) || 0;
	if (Date.now() - ts < RATE_LIMIT_MS) return true;
	lastTicketAt.set(key, Date.now());
	return false;
}

// sanitiza nome para criar channel
function sanitizeName(s) {
	return s.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 50);
}

import { ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { ButtonStyle } from 'discord.js';

export async function assignTicket({ channel, assignedTo, client }) {
	// fetch ticket data
	const guild = channel.guild;
	const _ticket_data = await db.getTicketByChannel(guild.id, channel.id);
	if (!_ticket_data) throw new Error('ERR_NOT_A_TICKET');
	// update DB
	await db.assignTicket(guild, channel.id, assignedTo.id);
	// fetch original message
	let all = [];
	let lastId = undefined;
	for (;;) {
		const options = { limit: 100 };
		if (lastId) options.before = lastId;
		const msgs = await channel.messages.fetch(options);
		if (!msgs.size) break;
		all.push(...msgs.map(m => m));
		lastId = msgs.last().id;
		if (msgs.size < 100) break;
	}
	const original = all.reverse()[0];
	if (!original) throw new Error('ERR_NO_MESSAGES_IN_TICKET');
	// edit original message
	let embed = original.embeds[0];
	if (!embed) throw new Error('ERR_NO_EMBED_IN_TICKET');
	embed = EmbedBuilder.from(embed);
	embed.addFields({ name: 'Atendido por', value: `<@${assignedTo.id}>`, inline: true });
	embed.data.color = 0xFFFF00; // amarelo
	await original.edit({ embeds: [embed] });
}

/**
 * Pode assumir ticket (botão)
 * - guild: Guild
 * - member: GuildMember (que clicou)
 * - channel: TextChannel (canal do ticket)
 * - client: discord Client
 */
export async function canClaimTicket( guild, member, channel, client ) {
	// fetch ticket data
	const _ticket_data = await db.getTicketByChannel(guild.id, channel.id);
	if (!_ticket_data) throw new Error('ERR_NOT_A_TICKET');
	const ticketConfig = getTicketType(guild.id, _ticket_data.ticket_type);
	if (!ticketConfig) throw new Error('ERR_INVALID_TICKET_TYPE');
	if (_ticket_data.assigned_id) {
		throw new Error('ERR_TICKET_ALREADY_ASSIGNED');
	}
	// check if member has staff role
	const staffRoles = (await config.get(guild.id, ticketConfig.roleIdConfig)) || [];
	if (!staffRoles.length) throw new Error('ERR_NO_STAFF_ROLES_CONFIGURED');
	for (const roleId of staffRoles) {
		if (member.roles.cache.has(roleId)) {
			return true;
		}
	}
	return false;
}

/**
 * Cria canal de ticket com as permissões e grava DB (metadados).
 * - guild: Guild
 * - user: User
 * - type: string (um dos tipos)
 * - client: discord Client (para buscar configs)
 */
export async function createTicket({ guild, user, type, client }) {
	if (!guild) throw new Error('Guild obrigatória');
	if (rateLimited(guild.id, user.id)) throw new Error('ERR_RATE_LIMIT');

	let ticket_type = getTicketType(guild.id, type);

	console.log(`Criando ticket do tipo ${type} (${ticket_type.name}) para ${user.tag} (${user.id}) no servidor ${guild.name} (${guild.id})`);

	// recupera config da categoria
	const catId = await config.get(guild.id, ticket_type.categoryConfig);
	if (!catId) {
		lastTicketAt.delete(`${guild.id}-${user.id}`); // limpa rate limit
		throw new Error('Configuração de categoria não encontrada');
	}

	const category = guild.channels.cache.get(catId) || await guild.channels.fetch(catId).catch(()=>null);
	if (!category || category.type !== 4 && category.type !== 'GUILD_CATEGORY') {
		// category.type check é heurística; sempre verifique no seu servidor
		lastTicketAt.delete(`${guild.id}-${user.id}`); // limpa rate limit
		throw new Error('ERR_MISSING_CATEGORY');
	}

	const slug = sanitizeName(`${user.username}-${type}`);
	const channel = await guild.channels.create({
		name: slug,
		type: 0, // GUILD_TEXT === 0 in v14
		parent: catId,
		permissionOverwrites: [
			{ id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
			{ id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
		]
	});

	let staff_role = ticket_type.roleIdConfig;

	// adiciona permissões para staff roles configurados
	const staffCsv = (await config.get(guild.id, staff_role)) || [];
	if (staffCsv && staffCsv.length) {
		for (const rid of staffCsv) {
			try {
				await channel.permissionOverwrites.edit(rid, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
			} catch(e) {}
		}
	}

	console.log(`Canal de ticket criado: ${channel.name} (${channel.id}) - Staff roles: ${staffCsv || 'nenhum'} - ou ${staff_role}`);

	// grava metadado no DB
	await db.insertTicket(guild.id, channel.id, type, user.id);

	// envia mensagem placeholder no canal e pinga staff
	const pingRoles = (await config.get(guild.id, staff_role)) || [];
	let pingText = pingRoles.length ? `<@&${pingRoles[0]}>` : '';
	pingText += `\nOlá <@${user.id}>, agradecemos por ter aberto um ticket, aguarde um momento que a equipe de staff irá atendê-lo em breve.\n\n\n* Caso demore, envie mais mensagens para subir o ticket na fila.\n* Tickets devem ser usados apenas para assuntos relacionados ao servidor e jogo.\n* Uso indevido pode levar a punições.`;
	const placeholder = `Este canal é um ticket do tipo **${ticket_type.name}** aberto por <@${user.id}>.\nAguarde a equipe de staff atender seu ticket.\n\n**Não feche este canal, a equipe de staff irá fechá-lo quando o atendimento for concluído.**\n\n*Tipo de Ticket: ${ticket_type.description}*`;

	const row = new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId('close_ticket')
				.setLabel('Fechar Ticket')
				.setStyle(ButtonStyle.Danger),
			new ButtonBuilder()
				.setCustomId('claim_ticket')
				.setLabel('Assumir Ticket')
				.setStyle(ButtonStyle.Success),
			new ButtonBuilder()
				.setCustomId('admin_menu_ticket')
				.setLabel('Menu Admin')
				.setStyle(ButtonStyle.Secondary)
		);
	
	const embed = new EmbedBuilder()
		.setTitle(`Ticket: ${ticket_type.name}`)
		.setDescription(placeholder)
		.setColor(ticket_type.color || 0x00AE86)
		.setTimestamp()
		.setFooter({ text: `Ticket criado em ${formatDate(new Date())}` })
		.setAuthor({ name: `${user.tag}`, iconURL: user.displayAvatarURL() })
		.setThumbnail(guild.iconURL())
		.addFields(
			{ name: 'Tipo de Ticket', value: ticket_type.name, inline: true },
			{ name: 'Criado por', value: `<@${user.id}>`, inline: true },
			{ name: 'Status', value: 'Aberto', inline: true }
		);

	await channel.send({ content: `${pingText}`, embeds: [embed], components: [row] });

	// log opcional
	const logChannelId = await config.get(guild.id, 'ticket_log');
	if (logChannelId) {
		const ch = await client.channels.fetch(logChannelId).catch(()=>null);
		if (ch) await ch.send({ embeds: [{ title: 'Ticket criado', fields: [{ name: 'Canal', value: `<#${channel.id}>` }, { name: 'Autor', value: `<@${user.id}>` }, { name: 'Tipo', value: type }], timestamp: new Date() }] });
	}
	return channel;
}

/**
 * Fecha ticket, gera transcript e envia para log_transcript.
 * - channel: TextChannel
 * - closedBy: User (staff que fechou)
 * - client: discord client
 * - opts: { autoDelete, renameClosed }
 */
export async function closeTicket({ channel, closedBy, client, opts = {} }) {
	// fetch config
	const guild = channel.guild;
	const _ticket_data = await db.getTicketByChannel(guild.id, channel.id);
	if (!_ticket_data) throw new Error('ERR_NOT_A_TICKET');
	const ticketConfig = getTicketType(guild.id, _ticket_data.ticket_type);
	if (!ticketConfig) throw new Error('ERR_INVALID_TICKET_TYPE');
	let logTranscriptId = await config.get(guild.id, ticketConfig.logChannelConfig);
	if (!logTranscriptId) {
		console.log(`Log transcript config (${ticketConfig.logChannelConfig}) não encontrada, tentando padrão...`);
		logTranscriptId = await config.get(guild.id, 'log_transcript');
	}
	if (!logTranscriptId) throw new Error('ERR_MISSING_LOG_TRANSCRIPT');

	// enviar para canal de logs de transcript
	const chLog = await client.channels.fetch(logTranscriptId).catch(()=>null);
	if (!chLog) throw new Error('ERR_LOG_CHANNEL_NOT_FOUND');

	// Generate HTML transcript with error handling
	let transcript;
	try {
		transcript = await discordTranscript.createTranscript(channel, {
			limit: -1,
			returnType: 'attachment',
			filename: `transcript_${_ticket_data.ticket_type}-${_ticket_data.ticket_id}.html`,
			footerText: `Ticket: ${_ticket_data.ticket_type} | ID: ${_ticket_data.ticket_id} | Fechado por: ${closedBy.tag}`,
			poweredBy: false
		});
	} catch (transcriptError) {
		console.warn('Failed to create HTML transcript, using text fallback:', transcriptError.message);
		transcript = null;
	}

	// Send both HTML and text transcripts if HTML generation succeeded
	const attachments = [];
	if (transcript) {
		attachments.push(transcript);
	}

	await chLog.send({ 
		content: `Transcript do ticket ${_ticket_data.ticket_type}#${_ticket_data.ticket_id} — fechado por <@${closedBy.id}>`, 
		files: attachments 
	});

	// atualizar DB (status closed)
	await db.closeTicket(channel.id, closedBy.id);

	// renomear / desabilitar envio
	if (opts.renameClosed !== false) {
		await channel.setName(`closed-${channel.name}`).catch(()=>null);
	}
	// remove envio para @everyone
	await channel.permissionOverwrites.edit(guild.roles.everyone.id, { SendMessages: false }).catch(()=>null);

	// auto delete se configurado
	const autoDelete = await config.get(guild.id, 'ticket_auto_delete');
	if (autoDelete === true || opts.autoDelete) {
		await channel.delete('Ticket auto-delete on close').catch(()=>null);
	}
	return true;
}
