import type { SlashCommandBuilder, Collection, TextChannel, Guild, GuildMember, User, Client } from 'discord.js';

// ────────────────────────────────────────────────────────────────────────────────
// Discord client extensions
// ────────────────────────────────────────────────────────────────────────────────

export interface BotClient extends Client {
	commands: Collection<string, BotCommand>;
	interactions: Collection<string, BotInteraction>;
}

export interface BotCommand {
	data: { name: string; toJSON(): unknown };
	execute(interaction: import('discord.js').ChatInputCommandInteraction, ctx: CommandContext): Promise<unknown>;
	handleButtons?: Record<string, ButtonHandler>;
}

export interface BotInteraction {
	name: string;
	execute(interaction: import('discord.js').Interaction, ctx: CommandContext): Promise<unknown>;
}

export type ButtonHandler = (interaction: import('discord.js').ButtonInteraction, ctx?: CommandContext) => Promise<unknown>;

export interface CommandContext {
	client: BotClient;
}

// ────────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────────

export type ConfigType = 'role' | 'roles' | 'channel' | 'category' | 'bool' | 'string' | 'number';

export interface ConfigDefinition {
	type: ConfigType;
	key: string;
	default: unknown;
	description: string;
}

// ────────────────────────────────────────────────────────────────────────────────
// Tickets
// ────────────────────────────────────────────────────────────────────────────────

export type TicketStatus = 'open' | 'closed';

export interface TicketRow {
	ticket_id: number;
	guild_id: string;
	channel_id: string;
	ticket_type: string;
	author_id: string;
	assigned_id: string | null;
	status: TicketStatus;
	created_at: Date;
	closed_at: Date | null;
	closed_by: string | null;
}

export interface TicketTypeDefinition {
	name: string;
	description: string;
	color: number;
	roleIdConfig: string;
	logChannelConfig: string;
	categoryConfig: string;
	key?: string;
}

export interface CreateTicketOptions {
	guild: Guild;
	user: User;
	type: string;
	client: BotClient;
}

export interface CloseTicketOptions {
	channel: TextChannel;
	closedBy: User;
	client: BotClient;
	opts?: { autoDelete?: boolean; renameClosed?: boolean };
}

export interface AssignTicketOptions {
	channel: TextChannel;
	assignedTo: GuildMember;
	client: BotClient;
}
