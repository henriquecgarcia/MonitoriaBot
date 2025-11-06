import config from '../services/config_handler.js';

import { EmbedBuilder, AuditLogEvent, ChannelType } from "discord.js";

export function init(client) {
	async function sendLog(guildId, configKey, message) {
		if (!guildId) return;
		const channelId = await config.get(guildId, configKey);
		if (!channelId) return;
		const ch = await client.channels.fetch(channelId).catch(() => null);
		if (!ch) return;
		if (message.embeds) {
			message.embeds = message.embeds.map(e => {
				try { return e.setTimestamp(); } catch { return e; }
			});
		}
		await ch.send(message).catch(() => null);
	}

	// Retorna o executor de uma ação (moderador) usando os registros de auditoria
	async function fetchModerator(guild, type, targetId) {
		if (!guild) return "*desconhecido*";
		try {
			const logs = await guild.fetchAuditLogs({ type, limit: 5 });
			const now = Date.now();
			const entry = logs.entries.find(e => {
				const matchTarget = !targetId || (e.target && e.target.id === targetId);
				const recent = !e.createdTimestamp || (now - e.createdTimestamp < 15000);
				return matchTarget && recent;
			}) || logs.entries.first();
			const executor = entry?.executor;
			return executor ? `<@${executor.id}>` : "*desconhecido*";
		} catch (err) {
			return "*desconhecido*";
		}
	}

	// Helpers para menções e nomes de permissões
	function resolveMention(guild, id) {
		if (!guild) return `<@${id}>`;
		const role = guild.roles.cache.get(id);
		if (role) return `<@&${id}>`;
		return `<@${id}>`;
	}

	function formatPermName(perm) {
		try {
			return perm
				.replace(/([A-Z])/g, ' $1')
				.replace(/^ /, '')
				.replace(/Guild/g, 'Server');
		} catch { return String(perm); }
	}

	let message_safe = (str) => {
		if (!str) return "*vazia*";
		str = str.replace(/`/g, "\`");
		return str;
	}

	// ---------------- MENSAGENS ----------------
	client.on("messageUpdate", async (oldMessage, newMessage) => {
		if (oldMessage.partial || newMessage.partial) return;
		if (oldMessage.content === newMessage.content) return;

		if (oldMessage.author?.bot) return; // Ignora bots

		const guildId = newMessage.guild?.id || oldMessage.guild?.id;
		let oldMessageContent = message_safe(oldMessage.content);
		let newMessageContent = message_safe(newMessage.content);
		sendLog(guildId, "message_logs", {
			embeds: [
				new EmbedBuilder()
					.setTitle("📝 Mensagem Editada")
					.addFields(
						{ name: "Autor", value: `${oldMessage.author}`, inline: true },
						{ name: "Canal", value: `${oldMessage.channel}`, inline: true },
						{ name: "Original", value: `\`\`\`${oldMessageContent}\`\`\`` || "*vazia*" },
						{ name: "Nova", value: `\`\`\`${newMessageContent}\`\`\`` || "*vazia*" }
					)
					.addFields(
						{ name: "ID", value: `${oldMessage.id}`, inline: true },
						{ name: "Data", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
						{ name: "Ir para", value: `[a mensagem](https://discord.com/channels/${guildId}/${oldMessage.channel.id}/${oldMessage.id})`, inline: true }
					)
					.setColor("Yellow")
					.setTimestamp()
					.setFooter({ text: `${oldMessage.guild.name} ${new Date().getFullYear()}` })
			]
		});
	});

	client.on("messageDelete", async (message) => {
		if (message.partial) return;
		if (message.author?.bot) return; // Ignora bots

		const guildId = message.guild?.id;
		const content = message.content || "*vazia*";
		sendLog(guildId, "message_logs", {
			embeds: [
				new EmbedBuilder()
					.setTitle("🗑️ Mensagem Deletada")
					.addFields(
						{ name: "Autor", value: `${message.author}`, inline: true },
						{ name: "Canal", value: `${message.channel}`, inline: true },
						{ name: "Conteúdo", value: message.content || "*vazia*" }
					)
					.setColor("Red")
					.setTimestamp()
					.setFooter({ text: `ID: ${message.id}` })
			]
		});
	});

	// ---------------- USUÁRIOS ----------------
	client.on("userUpdate", (oldUser, newUser) => {
		if (oldUser.username !== newUser.username) {
			// Broadcast para todos os servidores onde o bot está (não há guild no evento)
			client.guilds.cache.forEach(g => {
				sendLog(g.id, "user_logs", {
					embeds: [
						new EmbedBuilder()
							.setTitle("👤 Usuário Atualizado")
							.addFields(
								{ name: "Antigo", value: oldUser.tag, inline: true },
								{ name: "Novo", value: newUser.tag, inline: true }
							)
							.addImage(newUser.displayAvatarURL())
							.setColor("Blue")
							.setTimestamp()
							.setFooter({ text: `ID: ${oldUser.id}` })
					]
				});
			});
		}
		if (oldUser.avatar !== newUser.avatar && false) {
			client.guilds.cache.forEach(g => {
				sendLog(g.id, "user_logs", {
					embeds: [
						new EmbedBuilder()
							.setTitle("🖼️ Avatar Atualizado")
							.addFields(
								{ name: "Usuário", value: newUser.tag, inline: true }
							)
							.setImage(newUser.displayAvatarURL())
							.setColor("Blue")
							.setTimestamp()
							.setFooter({ text: `ID: ${newUser.id}` })
					]
				});
			});
		}
	});

	client.on("guildMemberAdd", member => {
		sendLog(member.guild.id, "member_logs", {
			embeds: [
				new EmbedBuilder()
					.setTitle("✅ Usuário Entrou")
					.setDescription(`👤 ${member.user.tag} (${member.user.id}) entrou no servidor.`)
					.setThumbnail(member.user.displayAvatarURL())
					.setColor("Green")
					.setTimestamp()
					.setFooter({ text: `ID: ${member.user.id}` })
			]
		});
	});

	client.on("guildMemberRemove", member => {
		sendLog(member.guild.id, "member_logs", {
			embeds: [
				new EmbedBuilder()
					.setTitle("❌ Usuário Saiu")
					.setDescription(`👤 ${member.user.tag} (${member.user.id}) saiu do servidor.`)
					.setThumbnail(member.user.displayAvatarURL())
					.setColor("Red")
					.setTimestamp()
					.setFooter({ text: `ID: ${member.user.id}` })
			]
		});
	});

	client.on("guildBanAdd", async ban => {
		const moderador = await fetchModerator(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
		sendLog(ban.guild.id, "member_logs", {
			embeds: [
				new EmbedBuilder()
					.setTitle("🔨 Usuário Banido")
					.setDescription(`👤 ${ban.user.tag} (${ban.user.id}) foi banido.`)
					.addFields([
						{ name: "Motivo", value: ban.reason || "Não especificado", inline: true },
						{ name: "Moderador", value: moderador, inline: true }
					])
					.setThumbnail(ban.user.displayAvatarURL())
					.setColor("DarkRed")
					.setTimestamp()
					.setFooter({ text: `ID: ${ban.user.id}` })
			]
		});
	});

	client.on("guildBanRemove", ban => {
		sendLog(ban.guild.id, "member_logs", {
			embeds: [
				new EmbedBuilder()
					.setTitle("♻️ Usuário Desbanido")
					.setDescription(`👤 ${ban.user.tag} (${ban.user.id}) foi desbanido.`)
					.setThumbnail(ban.user.displayAvatarURL())
					.setColor("Orange")
					.setTimestamp()
					.setFooter({ text: `ID: ${ban.user.id}` })
			]
		});
	});

	client.on("guildMemberUpdate", (oldMember, newMember) => {
		const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
		const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

		if (addedRoles.size || removedRoles.size) {
			let changes = [];
			addedRoles.forEach(r => changes.push(`✅ Cargo adicionado: ${r}`));
			removedRoles.forEach(r => changes.push(`❌ Cargo removido: ${r}`));

			sendLog(newMember.guild.id, "member_logs", {
				embeds: [
					new EmbedBuilder()
						.setTitle("👤 Atualização de Membro")
						.setDescription(`<@${newMember.user.id}> (${newMember.user.tag})`)
						.addFields({ name: "Mudanças", value: changes.join("\n") })
						.setThumbnail(newMember.user.displayAvatarURL())
						.setColor("Blue")
						.setTimestamp()
						.setFooter({ text: `ID: ${newMember.user.id}` })
				]
			});
		}

		if (oldMember.nickname !== newMember.nickname) {
			sendLog(newMember.guild.id, "member_logs", {
				embeds: [
					new EmbedBuilder()
						.setTitle("👤 Atualização de Membro")
						.setDescription(`<@${newMember.user.id}> (${newMember.user.tag})`)
						.addFields([
							{ name: "Nome novo", value: `${newMember.nickname}`, inline: true },
							{ name: "Nome antigo", value: `${oldMember.nickname || oldMember.user.username}`, inline: true }
						])
						.setThumbnail(newMember.user.displayAvatarURL())
						.setColor("Blue")
						.setTimestamp()
						.setFooter({ text: `ID: ${newMember.user.id}` })
				]
			});
		}
	});

	// ---------------- CARGOS ----------------
	client.on("roleUpdate", async (oldRole, newRole) => {
		let changes = [];
		if (oldRole.name !== newRole.name) {
			changes.push({ name: "Nome antigo", value: oldRole.name, inline: true });
			changes.push({ name: "Nome novo", value: newRole.name, inline: true });
			changes.push({ name: "", value: "" });
		}
		if (oldRole.color !== newRole.color) {
			changes.push({ name: "🎨 Cor antiga", value: `**${oldRole.hexColor}**`, inline: true });
			changes.push({ name: "🎨 Cor nova", value: `**${newRole.hexColor}**`, inline: true });
			changes.push({ name: "", value: "" });
		}
		if (oldRole.hoist !== newRole.hoist) {
			changes.push({ name: "📌 Destacar na lista antes", value: `**${oldRole.hoist ? 'Sim' : 'Não'}**`, inline: true });
			changes.push({ name: "📌 Destacar na lista depois", value: `**${newRole.hoist ? 'Sim' : 'Não'}**`, inline: true });
			changes.push({ name: "", value: "" });
		}
		if (oldRole.position !== newRole.position) {
			changes.push({ name: "⬆️ Posição", value: `**${oldRole.position}** → **${newRole.position}**`, inline: true });
			changes.push({ name: "", value: "" });
		}
		if (oldRole.mentionable !== newRole.mentionable) {
			changes.push({ name: "📣 Menção antes", value: `**${oldRole.mentionable ? 'Sim' : 'Não'}**`, inline: true });
			changes.push({ name: "📣 Menção depois", value: `**${newRole.mentionable ? 'Sim' : 'Não'}**`, inline: true });
			changes.push({ name: "", value: "" });
		}

		if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
			const added = newRole.permissions.toArray().filter(p => !oldRole.permissions.has(p));
			const removed = oldRole.permissions.toArray().filter(p => !newRole.permissions.has(p));

			changes.push({name: "✅ Permissões adicionadas:", value: added.map(p => `➕ \`${p}\``).join("\n") || "Nenhuma"});
			changes.push({name: "❌ Permissões removidas:", value: removed.map(p => `➖ \`${p}\``).join("\n") || "Nenhuma"});
			changes.push({ name: "", value: "" });
		}

		if (changes.length) {
			const moderador = await fetchModerator(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
			changes.push({ name: "Moderador", value: moderador });
			sendLog(newRole.guild.id, "role_logs", {
				embeds: [
					new EmbedBuilder()
						.setTitle(`🛠️ Cargo ${oldRole.name} atualizado`)
						.addFields(changes)
						.setColor("Orange")
						.setTimestamp()
						.setFooter({ text: `ID: ${oldRole.id}` })
				]
			});
		}
	});

	client.on("roleCreate", async role => {
		const moderador = await fetchModerator(role.guild, AuditLogEvent.RoleCreate, role.id);
		sendLog(role.guild.id, "role_logs", {
			embeds: [
				new EmbedBuilder()
					.setTitle("🆕 Cargo Criado")
					.addFields(
						{ name: "Nome", value: role.name, inline: true },
						{ name: "ID", value: role.id, inline: true },
						{ name: "Moderador", value: moderador, inline: true }
					)
					.setColor("Green")
					.setTimestamp()
					.setFooter({ text: `ID: ${role.id}` })
			]
		});
	});

	client.on("roleDelete", async role => {
		const moderador = await fetchModerator(role.guild, AuditLogEvent.RoleDelete, role.id);
		sendLog(role.guild?.id, "role_logs", {
			embeds: [
				new EmbedBuilder()
					.setTitle("🗑️ Cargo Deletado")
					.addFields(
						{ name: "Nome", value: role.name, inline: true },
						{ name: "ID", value: role.id, inline: true },
						{ name: "Moderador", value: moderador, inline: true }
					)
					.setColor("Red")
					.setTimestamp()
					.setFooter({ text: `ID: ${role.id}` })
			]
		});
	});

	// ---------------- CANAIS ----------------
	client.on("channelCreate", async channel => {
		if (channel.type === ChannelType.GuildCategory) return; // Ignora categorias
		// Ignora canais de tickets

		const moderador = await fetchModerator(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
		sendLog(channel.guild?.id, "channel_logs", {
			embeds: [
				new EmbedBuilder()
					.setTitle("📢 Canal Criado")
					.addFields(
						{ name: "Nome", value: channel.name, inline: true },
						{ name: "ID", value: channel.id, inline: true },
						{ name: "Moderador", value: moderador, inline: true }
					)
					.setColor("Green")
					.setTimestamp()
					.setFooter({ text: `ID: ${channel.id}` })
			]
		});
	});

	client.on("channelDelete", async channel => {
		if (channel.type === ChannelType.GuildCategory) return; // Ignora categorias
		// Ignora canais de tickets
		const moderador = await fetchModerator(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
		sendLog(channel.guild?.id, "channel_logs", {
			embeds: [
				new EmbedBuilder()
					.setTitle("📢 Canal Deletado")
					.addFields(
						{ name: "Nome", value: channel.name, inline: true },
						{ name: "ID", value: channel.id, inline: true },
						{ name: "Moderador", value: moderador, inline: true }
					)
					.setColor("Red")
					.setTimestamp()
					.setFooter({ text: `ID: ${channel.id}` })
			]
		});
	});

	client.on("channelUpdate", async (oldChannel, newChannel) => {
		// Ignora canais de tickets
		if (oldChannel.name !== newChannel.name) {
			const moderador = await fetchModerator(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
			sendLog(newChannel.guild?.id, "channel_logs", {
				embeds: [
					new EmbedBuilder()
						.setTitle("✏️ Canal Renomeado")
						.addFields(
							{ name: "Antigo Nome", value: oldChannel.name, inline: true },
							{ name: "Novo Nome", value: newChannel.name, inline: true },
							{ name: "Moderador", value: moderador, inline: true }
						)
						.setColor("Blue")
						.setTimestamp()
						.setFooter({ text: `ID: ${newChannel.id}` })
				]
			});
		}
		if (oldChannel.topic !== newChannel.topic) {
			const moderador = await fetchModerator(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
			sendLog(newChannel.guild?.id, "channel_logs", {
				embeds: [
					new EmbedBuilder()
						.setTitle("✏️ Canal Atualizado")
						.addFields(
							{ name: "Antigo Tópico", value: oldChannel.topic || "Nenhum", inline: true },
							{ name: "Novo Tópico", value: newChannel.topic || "Nenhum", inline: true },
							{ name: "Moderador", value: moderador, inline: true }
						)
						.setColor("Blue")
						.setTimestamp()
						.setFooter({ text: `ID: ${newChannel.id}` })
				]
			});
		}
		if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
			const moderador = await fetchModerator(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
			sendLog(newChannel.guild?.id, "channel_logs", {
				embeds: [
					new EmbedBuilder()
						.setTitle("✏️ Canal Atualizado")
						.setDescription(`⏱️ Slowmode do canal <#${newChannel.id}> alterado.`)
						.addFields(
							{ name: "Antigo Slowmode", value: `${oldChannel.rateLimitPerUser || 0} segundos`, inline: true },
							{ name: "Novo Slowmode", value: `${newChannel.rateLimitPerUser || 0} segundos`, inline: true },
							{ name: "Moderador", value: moderador, inline: true }
						)
						.setColor("Blue")
						.setTimestamp()
						.setFooter({ text: `ID: ${newChannel.id}` })
				]
			});
		}
		if (oldChannel.parentId !== newChannel.parentId) {
			const moderador = await fetchModerator(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
			sendLog(newChannel.guild?.id, "channel_logs", {
				embeds: [
					new EmbedBuilder()
						.setTitle("✏️ Canal Atualizado")
						.setDescription(`📂 Categoria do canal <#${newChannel.id}> alterada.`)
						.addFields(
							{ name: "Antiga Categoria", value: oldChannel.parent ? oldChannel.parent.name : "Nenhuma", inline: true },
							{ name: "Nova Categoria", value: newChannel.parent ? newChannel.parent.name : "Nenhuma", inline: true },
							{ name: "Moderador", value: moderador, inline: true }
						)
						.setColor("Blue")
						.setTimestamp()
						.setFooter({ text: `ID: ${newChannel.id}` })
				]
			});
		}
		// Diferenças de permissões por overwrite (allow/deny)
		if (!oldChannel.permissionOverwrites || !newChannel.permissionOverwrites) return;
		const oldMap = new Map(oldChannel.permissionOverwrites.cache.map(po => [po.id, po]));
		const newMap = new Map(newChannel.permissionOverwrites.cache.map(po => [po.id, po]));
		let lines = [];
		for (const [id, newPO] of newMap) {
			const oldPO = oldMap.get(id);
			const newAllow = newPO.allow?.toArray?.() || [];
			const newDeny = newPO.deny?.toArray?.() || [];
			const oldAllow = oldPO?.allow?.toArray?.() || [];
			const oldDeny = oldPO?.deny?.toArray?.() || [];

			const allowAdded = newAllow.filter(p => !oldAllow.includes(p));
			const denyAdded = newDeny.filter(p => !oldDeny.includes(p));
			const allowRemoved = oldAllow.filter(p => !newAllow.includes(p));
			const denyRemoved = oldDeny.filter(p => !newDeny.includes(p));

			if (allowAdded.length || denyAdded.length || allowRemoved.length || denyRemoved.length) {
				lines.push(`↘️ ${resolveMention(newChannel.guild, id)}`);
				allowAdded.forEach(p => lines.push(`✅ ${formatPermName(p)}`));
				denyAdded.forEach(p => lines.push(`🚫 ${formatPermName(p)}`));
				allowRemoved.forEach(p => lines.push(`➖ (allow) ${formatPermName(p)}`));
				denyRemoved.forEach(p => lines.push(`➖ (deny) ${formatPermName(p)}`));
			}
		}
		// Captura overwrites removidos inteiros
		for (const [id, oldPO] of oldMap) {
			if (!newMap.has(id)) {
				const removedAllow = oldPO.allow?.toArray?.() || [];
				const removedDeny = oldPO.deny?.toArray?.() || [];
				if (removedAllow.length || removedDeny.length) {
					lines.push(`↘️ ${resolveMention(newChannel.guild, id)}`);
					removedAllow.forEach(p => lines.push(`➖ (allow) ${formatPermName(p)}`));
					removedDeny.forEach(p => lines.push(`➖ (deny) ${formatPermName(p)}`));
				}
			}
		}

		if (lines.length) {
			let permsText = lines.join("\n");
			if (permsText.length > 1024) permsText = permsText.slice(0, 1021) + "...";
			let moderador = await fetchModerator(newChannel.guild, AuditLogEvent.ChannelOverwriteUpdate, newChannel.id);
			if (moderador === "*desconhecido*") {
				moderador = await fetchModerator(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
			}
			sendLog(newChannel.guild?.id, "channel_logs", {
				embeds: [
					new EmbedBuilder()
						.setTitle(`🏠 Channel Permissions Updated: ${newChannel.name}`)
						.addFields(
							{ name: "Permissions", value: permsText || "—" },
							{ name: "Responsible Moderator", value: moderador }
						)
						.setColor("Blue")
						.setTimestamp()
						.setFooter({ text: `ID: ${newChannel.id}` })
				]
			});
		}
	});

	// ---------------- SERVIDOR ----------------
	client.on("guildUpdate", async (oldGuild, newGuild) => {
		let changes = [];
		if (oldGuild.name !== newGuild.name) {
			changes.push(`✏️ Nome do servidor alterado: **${oldGuild.name}** → **${newGuild.name}**`);
		}
		if (oldGuild.icon !== newGuild.icon) {
			changes.push(`🖼️ Ícone do servidor alterado.`);
		}
		if (oldGuild.banner !== newGuild.banner) {
			changes.push(`🖼️ Banner do servidor alterado.`);
		}

		if (changes.length) {
			const moderador = await fetchModerator(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
			sendLog(newGuild.id, "guild_logs", {
				embeds: [
					new EmbedBuilder()
						.setTitle("⚙️ Servidor Atualizado")
						.setDescription(changes.join("\n"))
						.addFields({ name: "Moderador", value: moderador, inline: true })
						.setThumbnail(newGuild.iconURL())
						.setColor("Purple")
						.setTimestamp()
						.setFooter({ text: `ID: ${newGuild.id}` })
				]
			});
		}
	});
}
