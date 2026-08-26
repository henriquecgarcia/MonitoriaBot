export function requireEnv(name) {
	const value = process.env[name]?.trim();

	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
}

export function getDatabaseConfig() {
	const port = Number(process.env.BOT_DB_PORT ?? 3306);

	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error('BOT_DB_PORT must be a valid TCP port number.');
	}

	return {
		host: requireEnv('BOT_DB_HOST'),
		port,
		user: requireEnv('BOT_DB_USER'),
		password: requireEnv('BOT_DB_PASS'),
		database: requireEnv('BOT_DB_NAME'),
	};
}

export function getRuntimeConfig() {
	return {
		token: requireEnv('DISCORD_BOT_TOKEN'),
		database: getDatabaseConfig(),
	};
}
