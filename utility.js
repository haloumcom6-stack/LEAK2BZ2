'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  version: djsVersion,
} = require('discord.js');
const os = require('node:os');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed, errorEmbed, infoEmbed } = require('../core/embeds');
const { PERMISSION_LABELS, label: permissionLabel } = require('../core/guard');
const { renderHome, renderCategory, renderCommandDetail, findCommand } = require('../core/help');
const {
  formatNumber,
  humanUptime,
  timeAgo,
  discordDate,
  truncate,
} = require('../core/utils');

const helpCommand = {
  category: 'Utility',
  cooldown: 2,
  aliases: ['aide', 'h'],
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Affiche l’aide du bot et la liste des commandes.')
    .addStringOption((option) => option.setName('commande').setDescription('Nom d’une commande pour plus de détails').setMaxLength(32)),
  async execute(ctx) {
    const query = ctx.getString('commande');
    const prefix = ctx.guildConfig?.prefix || ctx.client.config.defaultPrefix;
    if (query) {
      const command = findCommand(ctx.client, query);
      if (!command) return ctx.replyError(`Commande **${query}** introuvable. Utilise \`/help\` pour voir la liste.`);
      return ctx.reply(renderCommandDetail(ctx.client, command, prefix));
    }
    return ctx.reply(renderHome(ctx.client, prefix));
  },
};

const pingCommand = {
  category: 'Utility',
  cooldown: 2,
  aliases: ['latence'],
  data: new SlashCommandBuilder().setName('ping').setDescription('Affiche la latence du bot.'),
  async execute(ctx) {
    const start = Date.now();
    await ctx.reply({ content: '🏓 Pong…' });
    const roundtrip = Date.now() - start;
    const embed = baseEmbed({
      color: COLORS.success,
      title: '🏓 Pong !',
      fields: [
        { name: 'Aller-retour', value: `**${roundtrip} ms**`, inline: true },
        { name: 'WebSocket', value: `**${Math.round(ctx.client.ws.ping)} ms**`, inline: true },
        { name: 'Uptime', value: humanUptime(ctx.client.uptime || 0), inline: true },
      ],
      footer: 'Latence',
    });
    await ctx.edit({ content: null, embeds: [embed] });
  },
};

const botinfoCommand = {
  category: 'Utility',
  cooldown: 3,
  aliases: ['infobot'],
  data: new SlashCommandBuilder().setName('botinfo').setDescription('Affiche les informations et statistiques du bot.'),
  async execute(ctx) {
    const memory = process.memoryUsage();
    const users = ctx.client.guilds.cache.reduce((total, guild) => total + (guild.memberCount || 0), 0);
    const embed = baseEmbed({
      color: COLORS.primary,
      title: `${EMOJI.bot} ${ctx.client.user.username}`,
      description: `Un bot de gestion complet, rapide et configurable.`,
      thumbnail: ctx.client.user.displayAvatarURL({ size: 256 }),
      fields: [
        { name: 'Serveurs', value: `**${formatNumber(ctx.client.guilds.cache.size)}**`, inline: true },
        { name: 'Membres', value: `**${formatNumber(users)}**`, inline: true },
        { name: 'Commandes', value: `**${ctx.client.commands.size}**`, inline: true },
        { name: 'Uptime', value: humanUptime(ctx.client.uptime || 0), inline: true },
        { name: 'WebSocket', value: `${Math.round(ctx.client.ws.ping)} ms`, inline: true },
        { name: 'Mémoire', value: `${(memory.heapUsed / 1024 / 1024).toFixed(1)} Mo`, inline: true },
        { name: 'Node.js', value: `\`${process.version}\``, inline: true },
        { name: 'discord.js', value: `\`v${djsVersion}\``, inline: true },
        { name: 'Système', value: `\`${os.platform()} ${os.arch()}\``, inline: true },
        { name: 'Créé le', value: discordDate(ctx.client.user.createdTimestamp, 'D'), inline: true },
      ],
      footer: 'Informations',
    });
    await ctx.reply({ embeds: [embed] });
  },
};

const serverinfoCommand = {
  category: 'Utility',
  cooldown: 3,
  aliases: ['serveurinfo', 'si'],
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Affiche les informations du serveur.'),
  async execute(ctx) {
    const guild = ctx.guild;
    const owner = await guild.fetchOwner().catch(() => null);
    const channels = guild.channels.cache;
    const textChannels = channels.filter((channel) => channel.type === ChannelType.GuildText).size;
    const voiceChannels = channels.filter((channel) => channel.type === ChannelType.GuildVoice).size;
    const categories = channels.filter((channel) => channel.type === ChannelType.GuildCategory).size;
    const verification = ['Aucun', 'Faible', 'Moyen', 'Élevé', 'Très élevé'][guild.verificationLevel] || guild.verificationLevel;

    const embed = baseEmbed({
      color: COLORS.primary,
      title: `${EMOJI.server} ${guild.name}`,
      thumbnail: guild.iconURL({ size: 256 }),
      image: guild.bannerURL({ size: 1024 }) || undefined,
      fields: [
        { name: 'Identifiant', value: `\`${guild.id}\``, inline: true },
        { name: 'Propriétaire', value: owner ? `${owner.user.tag || owner.user.username}` : `<@${guild.ownerId}>`, inline: true },
        { name: 'Créé', value: discordDate(guild.createdTimestamp, 'D'), inline: true },
        { name: 'Membres', value: `**${formatNumber(guild.memberCount)}**`, inline: true },
        { name: 'Salons', value: `${textChannels} texte • ${voiceChannels} vocal • ${categories} catégories`, inline: true },
        { name: 'Rôles', value: `**${guild.roles.cache.size}**`, inline: true },
        { name: 'Boosts', value: `**${guild.premiumSubscriptionCount || 0}** • tier **${guild.premiumTier}**`, inline: true },
        { name: 'Emojis', value: `**${guild.emojis.cache.size}**`, inline: true },
        { name: 'Vérification', value: verification, inline: true },
        { name: 'Salon AFK', value: guild.afkChannelId ? `<#${guild.afkChannelId}>` : '`aucun`', inline: true },
        { name: 'Langue', value: guild.preferredLocale || 'inconnue', inline: true },
      ],
      footer: 'Informations du serveur',
    });
    await ctx.reply({ embeds: [embed] });
  },
};

const userinfoCommand = {
  category: 'Utility',
  cooldown: 2,
  aliases: ['qui', 'ui'],
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Affiche les informations d’un membre.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre à consulter')),
  async execute(ctx) {
    const user = ctx.getUser('membre') || ctx.user;
    const member = await ctx.guild.members.fetch(user.id).catch(() => null);
    const roles = member
      ? [...member.roles.cache.values()]
        .filter((role) => role.id !== ctx.guild.id)
        .sort((a, b) => b.position - a.position)
      : [];

    const fields = [
      { name: 'Identifiant', value: `\`${user.id}\``, inline: true },
      { name: 'Bot', value: user.bot ? 'Oui' : 'Non', inline: true },
      { name: 'Compte créé', value: discordDate(user.createdTimestamp, 'D'), inline: true },
    ];
    if (member) {
      fields.push({ name: 'A rejoint', value: member.joinedTimestamp ? discordDate(member.joinedTimestamp, 'D') : 'inconnu', inline: true });
      fields.push({ name: 'Rôle le plus haut', value: `${member.roles.highest}`, inline: true });
      fields.push({ name: 'Surnom', value: member.nickname || '`aucun`', inline: true });
      fields.push({ name: 'Rôles', value: roles.length ? roles.slice(0, 20).map((role) => role.toString()).join(', ') : '`aucun`', inline: false });
      if (member.communicationDisabledUntilTimestamp) {
        fields.push({ name: 'Timeout jusqu’à', value: discordDate(member.communicationDisabledUntilTimestamp, 'f'), inline: true });
      }
    }

    const embed = baseEmbed({
      color: member?.displayColor || COLORS.primary,
      title: `${EMOJI.user} ${user.tag || user.username}`,
      thumbnail: user.displayAvatarURL({ size: 256 }),
      fields,
      footer: 'Informations du membre',
    });
    await ctx.reply({ embeds: [embed] });
  },
};

const avatarCommand = {
  category: 'Utility',
  cooldown: 2,
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Affiche l’avatar d’un membre.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre concerné')),
  async execute(ctx) {
    const user = ctx.getUser('membre') || ctx.user;
    const member = await ctx.guild.members.fetch(user.id).catch(() => null);
    const globalAvatar = user.displayAvatarURL({ size: 4096 });
    const serverAvatar = member?.avatarURL({ size: 4096 });
    const embed = baseEmbed({
      color: COLORS.primary,
      title: `🖼️ Avatar de ${user.tag || user.username}`,
      image: serverAvatar || globalAvatar,
      fields: [
        { name: 'Avatar global', value: `[PNG](${user.displayAvatarURL({ size: 4096, extension: 'png' })}) • [JPG](${user.displayAvatarURL({ size: 4096, extension: 'jpg' })})`, inline: true },
      ],
      footer: 'Avatar',
    });
    if (serverAvatar) {
      embed.addFields({ name: 'Avatar serveur', value: `[PNG](${member.avatarURL({ size: 4096, extension: 'png' })}) • [JPG](${member.avatarURL({ size: 4096, extension: 'jpg' })})`, inline: true });
    }
    await ctx.reply({ embeds: [embed] });
  },
};

const bannerCommand = {
  category: 'Utility',
  cooldown: 2,
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('Affiche la bannière d’un utilisateur.')
    .addUserOption((option) => option.setName('membre').setDescription('Utilisateur concerné')),
  async execute(ctx) {
    const target = ctx.getUser('membre') || ctx.user;
    const user = await ctx.client.users.fetch(target.id, { force: true }).catch(() => target);
    const banner = user.bannerURL({ size: 2048 });
    if (!banner) return ctx.reply({ embeds: [infoEmbed(`${user} n’a pas de bannière.`, '🖼️ Aucune bannière')] });
    await ctx.reply({
      embeds: [baseEmbed({
        color: user.accentColor || COLORS.primary,
        title: `🖼️ Bannière de ${user.tag || user.username}`,
        image: banner,
        footer: 'Bannière',
      })],
    });
  },
};

const roleinfoCommand = {
  category: 'Utility',
  cooldown: 2,
  data: new SlashCommandBuilder()
    .setName('roleinfo')
    .setDescription('Affiche les informations d’un rôle.')
    .addRoleOption((option) => option.setName('role').setDescription('Rôle à consulter').setRequired(true)),
  async execute(ctx) {
    const role = ctx.getRole('role');
    if (!role) return ctx.replyError('Rôle introuvable.');
    const members = ctx.guild.members.cache.filter((member) => member.roles.cache.has(role.id)).size;
    const permissions = role.permissions.toArray();
    const embed = baseEmbed({
      color: role.color || COLORS.primary,
      title: `🎭 ${role.name}`,
      fields: [
        { name: 'Identifiant', value: `\`${role.id}\``, inline: true },
        { name: 'Couleur', value: role.hexColor === '#000000' ? '`aucune`' : role.hexColor, inline: true },
        { name: 'Position', value: `${role.position}`, inline: true },
        { name: 'Membres (cache)', value: `${members}`, inline: true },
        { name: 'Mentionnable', value: role.mentionable ? 'Oui' : 'Non', inline: true },
        { name: 'Affiché séparément', value: role.hoist ? 'Oui' : 'Non', inline: true },
        { name: 'Géré par intégration', value: role.managed ? 'Oui' : 'Non', inline: true },
        { name: 'Créé', value: discordDate(role.createdTimestamp, 'D'), inline: true },
        { name: 'Permissions', value: permissions.length ? permissions.slice(0, 25).map((perm) => `\`${permissionLabel(perm)}\``).join(', ') : '`aucune`', inline: false },
      ],
      footer: 'Rôles',
    });
    await ctx.reply({ embeds: [embed] });
  },
};

const CHANNEL_TYPES = {
  [ChannelType.GuildText]: 'Salon textuel',
  [ChannelType.GuildVoice]: 'Salon vocal',
  [ChannelType.GuildCategory]: 'Catégorie',
  [ChannelType.GuildAnnouncement]: 'Salon d’annonces',
  [ChannelType.GuildForum]: 'Forum',
  [ChannelType.GuildStageVoice]: 'Salon de conférence',
  [ChannelType.PublicThread]: 'Fil public',
  [ChannelType.PrivateThread]: 'Fil privé',
};

const channelinfoCommand = {
  category: 'Utility',
  cooldown: 2,
  data: new SlashCommandBuilder()
    .setName('channelinfo')
    .setDescription('Affiche les informations d’un salon.')
    .addChannelOption((option) => option.setName('salon').setDescription('Salon à consulter')),
  async execute(ctx) {
    const channel = ctx.getChannel('salon') || ctx.channel;
    if (!channel) return ctx.replyError('Salon introuvable.');
    const fields = [
      { name: 'Identifiant', value: `\`${channel.id}\``, inline: true },
      { name: 'Type', value: CHANNEL_TYPES[channel.type] || String(channel.type), inline: true },
      { name: 'Créé', value: discordDate(channel.createdTimestamp, 'D'), inline: true },
    ];
    if ('parentId' in channel) fields.push({ name: 'Catégorie', value: channel.parentId ? `<#${channel.parentId}>` : '`aucune`', inline: true });
    if ('position' in channel) fields.push({ name: 'Position', value: `${channel.position}`, inline: true });
    if ('rateLimitPerUser' in channel) fields.push({ name: 'Mode lent', value: `${channel.rateLimitPerUser}s`, inline: true });
    if ('nsfw' in channel) fields.push({ name: 'NSFW', value: channel.nsfw ? 'Oui' : 'Non', inline: true });
    if ('topic' in channel && channel.topic) fields.push({ name: 'Sujet', value: truncate(channel.topic, 1000), inline: false });
    if ('bitrate' in channel) fields.push({ name: 'Bitrate', value: `${Math.round(channel.bitrate / 1000)} kbps`, inline: true });
    if ('userLimit' in channel) fields.push({ name: 'Limite', value: channel.userLimit ? `${channel.userLimit}` : 'illimitée', inline: true });
    await ctx.reply({
      embeds: [baseEmbed({
        color: COLORS.primary,
        title: `#️⃣ ${channel.name}`,
        fields,
        footer: 'Salons',
      })],
    });
  },
};

const inviteCommand = {
  category: 'Utility',
  cooldown: 5,
  aliases: ['invitation'],
  data: new SlashCommandBuilder().setName('invite').setDescription('Obtiens le lien d’invitation du bot.'),
  async execute(ctx) {
    if (!ctx.client.config.clientId) return ctx.replyError('CLIENT_ID n’est pas configuré dans le fichier `.env`.');
    const url = `https://discord.com/oauth2/authorize?client_id=${ctx.client.config.clientId}&permissions=8&scope=bot%20applications.commands`;
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    await ctx.reply({
      embeds: [baseEmbed({
        color: COLORS.primary,
        title: '➕ Inviter le bot',
        description: `Ajoute **[! 𝘨𝘦𝘴𝘵𝘪𝘰𝘯 ] L2B🎃** à ton serveur.\n\nLe bot demande la permission **Administrateur** pour toutes ses fonctionnalités (modération, tickets, logs, etc.).`,
        footer: 'Invitation',
      })],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Inviter le bot').setEmoji('➕').setStyle(ButtonStyle.Link).setURL(url),
      )],
    });
  },
};

const uptimeCommand = {
  category: 'Utility',
  cooldown: 2,
  data: new SlashCommandBuilder().setName('uptime').setDescription('Affiche depuis combien de temps le bot est en ligne.'),
  async execute(ctx) {
    const start = Date.now() - (ctx.client.uptime || 0);
    await ctx.reply({
      embeds: [infoEmbed(`En ligne depuis **${humanUptime(ctx.client.uptime || 0)}**.\nDémarré ${discordDate(start, 'R')}.`, '🕒 Uptime')],
    });
  },
};

const snipeCommand = {
  category: 'Utility',
  cooldown: 3,
  data: new SlashCommandBuilder().setName('snipe').setDescription('Affiche le dernier message supprimé du salon.'),
  async execute(ctx) {
    const entry = ctx.client.snipes?.get(ctx.channel.id);
    if (!entry) return ctx.reply({ embeds: [infoEmbed('Aucun message supprimé récemment dans ce salon.', '🔍 Rien à sniper')], ephemeral: true });
    const embed = baseEmbed({
      color: COLORS.neutral,
      title: '🔍 Dernier message supprimé',
      description: entry.content ? truncate(entry.content, 3000) : '*Aucun texte (pièce jointe ou embed)*',
      fields: [
        { name: 'Auteur', value: `${entry.authorTag} (<@${entry.authorId}>)`, inline: true },
        { name: 'Supprimé', value: discordDate(entry.at, 'R'), inline: true },
      ],
      footer: 'Snipe',
    });
    if (entry.attachments?.length) embed.addFields({ name: 'Pièces jointes', value: entry.attachments.slice(0, 5).map((url) => `[lien](${url})`).join(' • '), inline: false });
    await ctx.reply({ embeds: [embed], ephemeral: true });
  },
};

module.exports = [
  helpCommand,
  pingCommand,
  botinfoCommand,
  serverinfoCommand,
  userinfoCommand,
  avatarCommand,
  bannerCommand,
  roleinfoCommand,
  channelinfoCommand,
  inviteCommand,
  uptimeCommand,
  snipeCommand,
];
