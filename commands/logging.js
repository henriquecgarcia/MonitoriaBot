let rest = global.rest;
let client = global.client;
let { Events, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
let logging_channel = {};

module.exports = {
	data: new SlashCommandBuilder()
		.setName('log')
		.setDescription('Logs a command to the logging channel.')
		.addChannelOption(option =>
			option.setName('channel')
				.setDescription('The channel to log the command to')
				.setRequired(true))
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		const channel = interaction.options.getChannel('channel');
		if (!channel) {
			return interaction.followUp({ content: '❌ Canal inválido.', ephemeral: true });
		}
		if (!interaction.guild.members.me.permissionsIn(channel).has(PermissionFlagsBits.SendMessages)) {
			return interaction.followUp({ content: '❌ Eu não tenho permissão para enviar mensagens neste canal.', ephemeral: true });
		}
		if (!interaction.guild.members.me.permissionsIn(channel).has(PermissionFlagsBits.ViewChannel)) {
			return interaction.followUp({ content: '❌ Eu não tenho permissão para ver este canal.', ephemeral: true });
		}
		if (!interaction.guild.members.me.permissionsIn(channel).has(PermissionFlagsBits.EmbedLinks)) {
			return interaction.followUp({ content: '❌ Eu não tenho permissão para enviar embeds neste canal.', ephemeral: true });
		}
		if (!interaction.guild.members.me.permissionsIn(channel).has(PermissionFlagsBits.AddReactions)) {
			return interaction.followUp({ content: '❌ Eu não tenho permissão para adicionar reações neste canal.', ephemeral: true });
		}
		if (!interaction.guild.members.me.permissionsIn(channel).has(PermissionFlagsBits.ReadMessageHistory)) {
			return interaction.followUp({ content: '❌ Eu não tenho permissão para ler o histórico de mensagens neste canal.', ephemeral: true });
		}
		if (!interaction.guild.members.me.permissionsIn(channel).has(PermissionFlagsBits.AttachFiles)) {
			return interaction.followUp({ content: '❌ Eu não tenho permissão para anexar arquivos neste canal.', ephemeral: true });
		}
		if (!interaction.guild.members.me.permissionsIn(channel).has(PermissionFlagsBits.UseExternalEmojis)) {
			return interaction.followUp({ content: '❌ Eu não tenho permissão para usar emojis externos neste canal.', ephemeral: true });
		}
		logging_channel[interaction.guild.id] = channel.id;
		await interaction.editReply({ content: `✅ Canal de log definido para ${channel}.`, ephemeral: true });
	}
}

const log_mods = {
	[Events.MessageDelete]: async (message) => {
		if (!logging_channel[message.guild.id]) return;
		const channel = message.guild.channels.cache.get(logging_channel[message.guild.id]);
		if (!channel) return;

		const embed = new EmbedBuilder()
			.setTitle('Mensagem deletada')
			.setDescription(`A mensagem de ${message.author.tag} foi deletada no canal ${message.channel.name}`)
			.addFields(
				{ name: 'Conteúdo', value: message.content || 'Nenhum conteúdo' },
				{ name: 'Autor', value: message.author.tag || 'Desconhecido' }
			)
			.setColor('#0099ff')
			.setTimestamp();

		await channel.send({ embeds: [embed] });
	},
	[Events.MessageUpdate]: async (oldMessage, newMessage) => {
		if (!logging_channel[oldMessage.guild.id]) return;
		const channel = oldMessage.guild.channels.cache.get(logging_channel[oldMessage.guild.id]);
		if (!channel) return;

		const embed = new EmbedBuilder()
			.setTitle('Mensagem atualizada')
			.setDescription(`A mensagem de ${oldMessage.author.tag} foi atualizada no canal ${oldMessage.channel.name}`)
			.addFields(
				{ name: 'Antes', value: oldMessage.content || 'Nenhum conteúdo' },
				{ name: 'Depois', value: newMessage.content || 'Nenhum conteúdo' }
			)
			.setColor('#0099ff')
			.setTimestamp();

		await channel.send({ embeds: [embed] });
	},
	[Events.GuildMemberUpdate]: async (oldMember, newMember) => {
		if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
			const channel = oldMember.guild.channels.cache.get(logging_channel[oldMember.guild.id]);
			if (!channel) return;

			let added_roles = [];
			let removed_roles = [];
			newMember.roles.cache.forEach(role => {
				if (!oldMember.roles.cache.has(role.id)) {
					added_roles.push(role.name);
				}
			});
			oldMember.roles.cache.forEach(role => {
				if (!newMember.roles.cache.has(role.id)) {
					removed_roles.push(role.name);
				}
			});

			const embed = new EmbedBuilder()
				.setTitle('Cargo alterado')
				.setDescription(`O cargo de ${oldMember.user.tag} foi alterado`)
				.addFields(
					{ name: 'Cargos adicionados', value: added_roles.length > 0 ? added_roles.join(', ') : 'Nenhum' },
					{ name: 'Cargos removidos', value: removed_roles.length > 0 ? removed_roles.join(', ') : 'Nenhum' },
					{ name: 'Membro', value: oldMember.user.tag || 'Desconhecido' }
				)
				.setColor('#0099ff')
				.setTimestamp();

			await channel.send({ embeds: [embed] });
		}
	},
	[Events.GuildMemberAdd]: async (member) => {
		const channel = member.guild.channels.cache.get(logging_channel[member.guild.id]);
		if (!channel) return;

		const embed = new EmbedBuilder()
			.setTitle('Novo membro')
			.setDescription(`O membro ${member.user.tag} entrou no servidor`)
			.addFields(
				{ name: 'ID', value: member.id },
				{ name: 'Data de entrada', value: new Date().toLocaleString() }
			)
			.setColor('#0099ff')
			.setTimestamp();

		await channel.send({ embeds: [embed] });
	},
	[Events.GuildMemberRemove]: async (member) => {
		const channel = member.guild.channels.cache.get(logging_channel[member.guild.id]);
		if (!channel) return;

		const embed = new EmbedBuilder()
			.setTitle('Membro removido')
			.setDescription(`O membro ${member.user.tag} saiu do servidor`)
			.addFields(
				{ name: 'ID', value: member.id },
				{ name: 'Data de saída', value: new Date().toLocaleString() }
			)
			.setColor('#0099ff')
			.setTimestamp();

		await channel.send({ embeds: [embed] });
	},
	[Events.GuildBanAdd]: async (ban) => {
		const channel = ban.guild.channels.cache.get(logging_channel[ban.guild.id]);
		if (!channel) return;

		const embed = new EmbedBuilder()
			.setTitle('Membro banido')
			.setDescription(`O membro ${ban.user.tag} foi banido do servidor`)
			.addFields(
				{ name: 'ID', value: ban.user.id },
				{ name: 'Data de banimento', value: new Date().toLocaleString() },
				{ name: 'Motivo', value: ban.reason || 'Nenhum motivo fornecido' }
			)
			.setColor('#0099ff')
			.setTimestamp();

		await channel.send({ embeds: [embed] });
	},
	[Events.GuildBanRemove]: async (ban) => {
		const channel = ban.guild.channels.cache.get(logging_channel[ban.guild.id]);
		if (!channel) return;

		const embed = new EmbedBuilder()
			.setTitle('Membro desbanido')
			.setDescription(`O membro ${ban.user.tag} foi desbanido do servidor`)
			.addFields(
				{ name: 'ID', value: ban.user.id },
				{ name: 'Data de desbanimento', value: new Date().toLocaleString() },
				{ name: 'Motivo', value: ban.reason || 'Nenhum motivo fornecido' }
			)
			.setColor('#0099ff')
			.setTimestamp();

		await channel.send({ embeds: [embed] });
	},
	[Events.GuildRoleCreate]: async (role) => {
		const channel = role.guild.channels.cache.get(logging_channel[role.guild.id]);
		if (!channel) return;

		const embed = new EmbedBuilder()
			.setTitle('Cargo criado')
			.setDescription(`O cargo ${role.name} foi criado`)
			.addFields(
				{ name: 'ID', value: role.id },
				{ name: 'Data de criação', value: new Date().toLocaleString() }
			)
			.setColor('#0099ff')
			.setTimestamp();

		await channel.send({ embeds: [embed] });
	},
	[Events.GuildRoleDelete]: async (role) => {
		const channel = role.guild.channels.cache.get(logging_channel[role.guild.id]);
		if (!channel) return;

		const embed = new EmbedBuilder()
			.setTitle('Cargo deletado')
			.setDescription(`O cargo ${role.name} foi deletado`)
			.addFields(
				{ name: 'ID', value: role.id },
				{ name: 'Data de deleção', value: new Date().toLocaleString() }
			)
			.setColor('#0099ff')
			.setTimestamp();

		await channel.send({ embeds: [embed] });
	},
	[Events.GuildRoleUpdate]: async (oldRole, newRole) => {
		const channel = oldRole.guild.channels.cache.get(logging_channel[oldRole.guild.id]);
		if (!channel) return;

		const embed = new EmbedBuilder()
			.setTitle('Cargo atualizado')
			.setDescription(`O cargo ${oldRole.name} foi atualizado`)
			.addFields(
				{ name: 'Antes', value: oldRole.name },
				{ name: 'Depois', value: newRole.name }
			)
			.setColor('#0099ff')
			.setTimestamp();

		await channel.send({ embeds: [embed] });
	},
	[Events.GuildChannelCreate]: async (channel) => {
		const guild = channel.guild;
		const logChannel = guild.channels.cache.get(logging_channel[guild.id]);
		if (!logChannel) return;

		const embed = new EmbedBuilder()
			.setTitle('Canal criado')
			.setDescription(`O canal ${channel.name} foi criado`)
			.addFields(
				{ name: 'ID', value: channel.id },
				{ name: 'Tipo', value: channel.type }
			)
			.setColor('#0099ff')
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	},
	[Events.GuildChannelDelete]: async (channel) => {
		const guild = channel.guild;
		const logChannel = guild.channels.cache.get(logging_channel[guild.id]);
		if (!logChannel) return;

		const embed = new EmbedBuilder()
			.setTitle('Canal deletado')
			.setDescription(`O canal ${channel.name} foi deletado`)
			.addFields(
				{ name: 'ID', value: channel.id },
				{ name: 'Tipo', value: channel.type }
			)
			.setColor('#0099ff')
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	},
	[Events.GuildChannelUpdate]: async (oldChannel, newChannel) => {
		const guild = oldChannel.guild;
		const logChannel = guild.channels.cache.get(logging_channel[guild.id]);
		if (!logChannel) return;

		const embed = new EmbedBuilder()
			.setTitle('Canal atualizado')
			.setDescription(`O canal ${oldChannel.name} foi atualizado`)
			.addFields(
				{ name: 'Antes', value: oldChannel.name },
				{ name: 'Depois', value: newChannel.name }
			)
			.setColor('#0099ff')
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	},
	[Events.GuildEmojiCreate]: async (emoji) => {
		const guild = emoji.guild;
		const logChannel = guild.channels.cache.get(logging_channel[guild.id]);
		if (!logChannel) return;

		const embed = new EmbedBuilder()
			.setTitle('Emoji criado')
			.setDescription(`O emoji ${emoji.name} foi criado`)
			.addFields(
				{ name: 'ID', value: emoji.id },
				{ name: 'Data de criação', value: new Date().toLocaleString() }
			)
			.setImage(emoji.url)
			.setFooter({ text: `Emoji ID: ${emoji.id}` })
			.setColor('#0099ff')
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	},
	[Events.GuildEmojiDelete]: async (emoji) => {
		const guild = emoji.guild;
		const logChannel = guild.channels.cache.get(logging_channel[guild.id]);
		if (!logChannel) return;

		const embed = new EmbedBuilder()
			.setTitle('Emoji deletado')
			.setDescription(`O emoji ${emoji.name} foi deletado`)
			.addFields(
				{ name: 'ID', value: emoji.id },
				{ name: 'Data de deleção', value: new Date().toLocaleString() }
			)
			.setImage(emoji.url)
			.setFooter({ text: `Emoji ID: ${emoji.id}` })
			.setColor('#0099ff')
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	},
	[Events.GuildEmojiUpdate]: async (oldEmoji, newEmoji) => {
		const guild = oldEmoji.guild;
		const logChannel = guild.channels.cache.get(logging_channel[guild.id]);
		if (!logChannel) return;

		const embed = new EmbedBuilder()
			.setTitle('Emoji atualizado')
			.setDescription(`O emoji ${oldEmoji.name} foi atualizado`)
			.addFields(
				{ name: 'Antes', value: oldEmoji.name },
				{ name: 'Depois', value: newEmoji.name }
			)
			.setImage(newEmoji.url)
			.setFooter({ text: `Emoji ID: ${newEmoji.id}` })
			.setColor('#0099ff')
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	},
	[Events.GuildIntegrationsUpdate]: async (guild) => {
		const logChannel = guild.channels.cache.get(logging_channel[guild.id]);
		if (!logChannel) return;

		const embed = new EmbedBuilder()
			.setTitle('Integrações atualizadas')
			.setDescription(`As integrações do servidor ${guild.name} foram atualizadas`)
			.addFields(
				{ name: 'ID', value: guild.id },
				{ name: 'Data de atualização', value: new Date().toLocaleString() }
			)
			.setColor('#0099ff')
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	},
	[Events.GuildUpdate]: async (oldGuild, newGuild) => {
		const logChannel = oldGuild.channels.cache.get(logging_channel[oldGuild.id]);
		if (!logChannel) return;

		const embed = new EmbedBuilder()
			.setTitle('Servidor atualizado')
			.setDescription(`O servidor ${oldGuild.name} foi atualizado`)
			.addFields(
				{ name: 'ID', value: oldGuild.id },
				{ name: 'Data de atualização', value: new Date().toLocaleString() }
			)
			.setColor('#0099ff')
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	},
	[Events.GuildStickerCreate]: async (sticker) => {
		const guild = sticker.guild;
		const logChannel = guild.channels.cache.get(logging_channel[guild.id]);
		if (!logChannel) return;

		const embed = new EmbedBuilder()
			.setTitle('Sticker criado')
			.setDescription(`O sticker ${sticker.name} foi criado`)
			.addFields(
				{ name: 'ID', value: sticker.id },
				{ name: 'Data de criação', value: new Date().toLocaleString() }
			)
			.setImage(sticker.url)
			.setFooter({ text: `Sticker ID: ${sticker.id}` })
			.setColor('#0099ff')
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	},
	[Events.GuildStickerDelete]: async (sticker) => {
		const guild = sticker.guild;
		const logChannel = guild.channels.cache.get(logging_channel[guild.id]);
		if (!logChannel) return;

		const embed = new EmbedBuilder()
			.setTitle('Sticker deletado')
			.setDescription(`O sticker ${sticker.name} foi deletado`)
			.addFields(
				{ name: 'ID', value: sticker.id },
				{ name: 'Data de deleção', value: new Date().toLocaleString() }
			)
			.setImage(sticker.url)
			.setFooter({ text: `Sticker ID: ${sticker.id}` })
			.setColor('#0099ff')
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	},
	[Events.GuildStickerUpdate]: async (oldSticker, newSticker) => {
		const guild = oldSticker.guild;
		const logChannel = guild.channels.cache.get(logging_channel[guild.id]);
		if (!logChannel) return;

		const embed = new EmbedBuilder()
			.setTitle('Sticker atualizado')
			.setDescription(`O sticker ${oldSticker.name} foi atualizado`)
			.addFields(
				{ name: 'Antes', value: oldSticker.name },
				{ name: 'Depois', value: newSticker.name }
			)
			.setImage(newSticker.url)
			.setFooter({ text: `Sticker ID: ${newSticker.id}` })
			.setColor('#0099ff')
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	},
	[Events.GuildWebhooksUpdate]: async (guild) => {
		const logChannel = guild.channels.cache.get(logging_channel[guild.id]);
		if (!logChannel) return;

		const embed = new EmbedBuilder()
			.setTitle('Webhooks atualizados')
			.setDescription(`Os webhooks do servidor ${guild.name} foram atualizados`)
			.addFields(
				{ name: 'ID', value: guild.id },
				{ name: 'Data de atualização', value: new Date().toLocaleString() }
			)
			.setColor('#0099ff')
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	}
};
for (const [event, handler] of Object.entries(log_mods)) {
	client.on(event, handler);
}