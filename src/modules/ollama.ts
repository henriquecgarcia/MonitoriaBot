import config from "@/services/config_handler";
import { Events, Client, Message } from "discord.js";
import { logger } from "@/services/logger";

const ollamaURL = process.env.OLLAMA_URL || 'http://localhost:11434';
const defaultModel = process.env.OLLAMA_MODEL || 'qwen3-vl:8b';

function extractOllamaReply(data: unknown): string | null {
	if (!data || typeof data !== 'object') return null;

	const payload = data as {
		reply?: unknown;
		response?: unknown;
		message?: { content?: unknown };
	};

	if (typeof payload.reply === 'string' && payload.reply.trim()) return payload.reply;
	if (typeof payload.response === 'string' && payload.response.trim()) return payload.response;
	if (payload.message && typeof payload.message.content === 'string' && payload.message.content.trim()) {
		return payload.message.content;
	}

	return null;
}

async function sendToOllama(message: string, model: string): Promise<string> {
	try {
		const primaryResponse = await fetch(`${ollamaURL}/api/message`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message, model }),
		});

		if (primaryResponse.ok) {
			const data = await primaryResponse.json();
			const text = extractOllamaReply(data);
			if (text) return text;
		}

		// Fallback for the default Ollama HTTP API.
		const fallbackResponse = await fetch(`${ollamaURL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model, prompt: message, stream: false }),
		});

		if (!fallbackResponse.ok) {
			logger.error('OLLAMA', `Failed to send message to Ollama: ${fallbackResponse.status} ${fallbackResponse.statusText}`);
			return 'Error: Failed to communicate with Ollama.';
		}

		const data = await fallbackResponse.json();
		return extractOllamaReply(data) || 'No reply from Ollama.';
	} catch (error) {
		logger.error('OLLAMA', 'Error sending message to Ollama:', error);
		return 'Error: Could not reach Ollama.';
	}
}

function formatDiscordMessage(message: Message): string {
	const authorLabel = message.member?.displayName || message.author.globalName || message.author.username;
	const authorType = message.author.bot ? 'BOT' : 'USER';
	const timestamp = new Date(message.createdTimestamp).toISOString();
	const text = message.content.trim() || '(sem texto)';
	const attachments = message.attachments.map((a) => a.url).join(', ');
	const attachmentsSuffix = attachments ? ` | anexos: ${attachments}` : '';

	return `[${timestamp}] [${authorType}] ${authorLabel} (@${message.author.username}, id:${message.author.id}): ${text}${attachmentsSuffix}`;
}

async function getRecentMessages(originMessage: Message, limit: number): Promise<string[]> {
	const messages = await originMessage.channel.messages.fetch({ limit });
	return messages
		.sort((a, b) => a.createdTimestamp - b.createdTimestamp)
		.map((msg) => formatDiscordMessage(msg));
}

function buildPrompt(message: Message, contextMessages: string[]): string {
	const senderName = message.member?.displayName || message.author.globalName || message.author.username;
	const location = message.channel.isThread()
		? `Thread: ${message.channel.name} (pai: ${message.channel.parent?.toString() || 'desconhecido'})`
		: `Canal: ${message.channel.toString()}`;

	return [
		'Você é um assistente de monitoria em um servidor do Discord.',
		'Responda em português brasileiro, com foco em clareza técnica e objetividade.',
		`Servidor: ${message.guild?.name || 'desconhecido'} (id:${message.guild?.id || 'desconhecido'})`,
		location,
		`Última mensagem enviada por: ${senderName} (id:${message.author.id})`,
		'Histórico recente (ordem cronológica, mais antigo -> mais novo):',
		...contextMessages,
		'Use os identificadores acima para saber quem disse cada mensagem.',
	].join('\n');
}

const ConfigTypes = config.TYPES;

export async function init(client: Client): Promise<void> {
	config.Add(ConfigTypes.BOOL, 'ollama_enabled', false, { description: 'Enable Ollama integration' });
	config.Add(ConfigTypes.CHANNEL, 'ollama_channel', null, { description: 'Channel for Ollama logs' });
	config.Add(ConfigTypes.STRING, 'ollama_model', defaultModel, { description: 'Ollama model name' });
	config.Add(ConfigTypes.NUMBER, 'ollama_context_size', 20, { description: 'How many recent messages are sent to Ollama' });

	async function isEnabled(guildId: string): Promise<boolean> {
		return await config.get(guildId, 'ollama_enabled') === true;
	}

	client.on(Events.MessageCreate, async (message) => {
		if (message.author.bot || !message.guild) return;
		if (!await isEnabled(message.guild.id)) return;
		const channelId = await config.get(message.guild.id, 'ollama_channel') as string | null;
		if (!channelId) return;
		if (message.channel.isThread()) {
			if (message.channel.parentId !== channelId) return;
		} else if (message.channelId !== channelId) return;

		logger.info('OLLAMA', `Received message in guild ${message.guild.id}: ${message.content}`);
		const configuredModel = await config.get(message.guild.id, 'ollama_model') as string | null;
		const configuredContextSize = await config.get(message.guild.id, 'ollama_context_size');
		const contextSize =
			typeof configuredContextSize === 'number'
				? configuredContextSize
				: Number.parseInt(String(configuredContextSize ?? '20'), 10);
		const safeContextSize = Number.isFinite(contextSize) ? Math.min(Math.max(contextSize, 1), 50) : 20;

		const contextMessages = await getRecentMessages(message, safeContextSize);
		const prompt = buildPrompt(message, contextMessages);

		void message.channel.sendTyping().catch(() => null);
		const ollamaResponse = await sendToOllama(prompt, configuredModel || defaultModel);
		message.reply(ollamaResponse).catch(err => logger.error('OLLAMA', 'Failed to reply to message:', err));
	});

}