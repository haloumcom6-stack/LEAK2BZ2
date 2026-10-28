'use strict';

const { Events, ChannelType } = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed } = require('../core/embeds');
const { sendLog } = require('../core/logs');
const { truncate } = require('../core/utils');

const CHANNEL_TYPES = {
  [ChannelType.GuildText]: 'Salon textuel',
  [ChannelType.GuildVoice]: 'Salon vocal',
  [ChannelType.GuildCategory]: 'Catégorie',
  [ChannelType.GuildAnnouncement]: 'Salon d’annonces',
  [ChannelType.GuildForum]: 'Forum',
  [ChannelType.GuildStageVoice]: 'Conférence',
};

function channelTypeLabel(type) {
  return CHANNEL_TYPES[type] || String(type);
}

module.exports = [
  {
    name: Events.ChannelCreate,
    async execute(channel) {
      if (!channel.guild) return;
      const embed = baseEmbed({
        color: COLORS.success,
        title: `${EMOJI.settings} Salon créé`,
        description: `<#${channel.id}> • ${channelTypeLabel(channel.type)}`,
        fields: [{ name: 'Identifiant', value: `\`${channel.id}\``, inline: true }],
        footer: 'Serveur',
      });
      await sendLog(channel.guild, 'server', embed);
    },
  },
  {
    name: Events.ChannelDelete,
    async execute(channel) {
      if (!channel.guild) return;
      const embed = baseEmbed({
        color: COLORS.error,
        title: `${EMOJI.trash} Salon supprimé`,
        description: `**${channel.name}** • ${channelTypeLabel(channel.type)}`,
        fields: [{ name: 'Identifiant', value: `\`${channel.id}\``, inline: true }],
        footer: 'Serveur',
      });
      await sendLog(channel.guild, 'server', embed);
    },
  },
  {
    name: Events.ChannelUpdate,
    async execute(oldChannel, newChannel) {
      if (!newChannel.guild) return;
      const changes = [];
      if (oldChannel.name !== newChannel.name) changes.push(`**Nom :** ${oldChannel.name} ➜ ${newChannel.name}`);
      if (oldChannel.parentId !== newChannel.parentId) changes.push(`**Catégorie :** ${oldChannel.parentId ? `<#${oldChannel.parentId}>` : 'aucune'} ➜ ${newChannel.parentId ? `<#${newChannel.parentId}>` : 'aucune'}`);
      if ('topic' in newChannel && oldChannel.topic !== newChannel.topic) changes.push(`**Sujet :** ${truncate(newChannel.topic || '`aucun`', 300)}`);
      if ('nsfw' in newChannel && oldChannel.nsfw !== newChannel.nsfw) changes.push(`**NSFW :** ${newChannel.nsfw ? 'oui' : 'non'}`);
      if ('rateLimitPerUser' in newChannel && oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) changes.push(`**Mode lent :** ${newChannel.rateLimitPerUser}s`);
      if ('userLimit' in newChannel && oldChannel.userLimit !== newChannel.userLimit) changes.push(`**Limite vocale :** ${newChannel.userLimit || 'illimitée'}`);
      if (!changes.length) return;
      const embed = baseEmbed({
        color: COLORS.warning,
        title: `${EMOJI.settings} Salon modifié`,
        description: `<#${newChannel.id}>\n${changes.join('\n')}`,
        footer: 'Serveur',
      });
      await sendLog(newChannel.guild, 'server', embed);
    },
  },
  {
    name: Events.GuildRoleCreate,
    async execute(role) {
      if (!role.guild) return;
      const embed = baseEmbed({
        color: role.color || COLORS.success,
        title: '🎭 Rôle créé',
        description: `${role} (\`${role.id}\`)`,
        footer: 'Serveur',
      });
      await sendLog(role.guild, 'server', embed);
    },
  },
  {
    name: Events.GuildRoleDelete,
    async execute(role) {
      if (!role.guild) return;
      const embed = baseEmbed({
        color: COLORS.error,
        title: '🎭 Rôle supprimé',
        description: `**${role.name}** (\`${role.id}\`)`,
        footer: 'Serveur',
      });
      await sendLog(role.guild, 'server', embed);
    },
  },
  {
    name: Events.GuildRoleUpdate,
    async execute(oldRole, newRole) {
      if (!newRole.guild) return;
      const changes = [];
      if (oldRole.name !== newRole.name) changes.push(`**Nom :** ${oldRole.name} ➜ ${newRole.name}`);
      if (oldRole.color !== newRole.color) changes.push(`**Couleur :** ${oldRole.hexColor} ➜ ${newRole.hexColor}`);
      if (oldRole.hoist !== newRole.hoist) changes.push(`**Affiché séparément :** ${newRole.hoist ? 'oui' : 'non'}`);
      if (oldRole.mentionable !== newRole.mentionable) changes.push(`**Mentionnable :** ${newRole.mentionable ? 'oui' : 'non'}`);
      if (!oldRole.permissions.equals(newRole.permissions)) changes.push('**Permissions modifiées**');
      if (!changes.length) return;
      const embed = baseEmbed({
        color: newRole.color || COLORS.warning,
        title: '🎭 Rôle modifié',
        description: `${newRole}\n${changes.join('\n')}`,
        footer: 'Serveur',
      });
      await sendLog(newRole.guild, 'server', embed);
    },
  },
  {
    name: Events.GuildUpdate,
    async execute(oldGuild, newGuild) {
      const changes = [];
      if (oldGuild.name !== newGuild.name) changes.push(`**Nom :** ${oldGuild.name} ➜ ${newGuild.name}`);
      if (oldGuild.icon !== newGuild.icon) changes.push('**Icône modifiée**');
      if (oldGuild.banner !== newGuild.banner) changes.push('**Bannière modifiée**');
      if (oldGuild.verificationLevel !== newGuild.verificationLevel) changes.push(`**Vérification :** ${newGuild.verificationLevel}`);
      if (!changes.length) return;
      const embed = baseEmbed({
        color: COLORS.warning,
        title: `${EMOJI.server} Serveur modifié`,
        description: `${newGuild.name}\n${changes.join('\n')}`,
        thumbnail: newGuild.iconURL({ size: 256 }),
        footer: 'Serveur',
      });
      await sendLog(newGuild, 'server', embed);
    },
  },
  {
    name: Events.GuildEmojiCreate,
    async execute(emoji) {
      if (!emoji.guild) return;
      await sendLog(emoji.guild, 'server', baseEmbed({
        color: COLORS.success,
        title: '😀 Emoji ajouté',
        description: `${emoji} • \`${emoji.name}\``,
        footer: 'Serveur',
      }));
    },
  },
  {
    name: Events.GuildEmojiDelete,
    async execute(emoji) {
      if (!emoji.guild) return;
      await sendLog(emoji.guild, 'server', baseEmbed({
        color: COLORS.error,
        title: '😀 Emoji supprimé',
        description: `\`${emoji.name}\``,
        footer: 'Serveur',
      }));
    },
  },
];
