'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed, successEmbed } = require('../core/embeds');
const { requirePermissions } = require('../core/guard');
const { parseEmoji, isSnowflake } = require('../core/utils');
const { matchesReaction, emojiLabel } = require('../core/reactionroles');

const reactionRoleCommand = {
  category: 'Roles',
  cooldown: 3,
  aliases: ['rr', 'reactionrole'],
  permissions: ['ManageRoles'],
  botPermissions: ['ManageRoles', 'AddReactions', 'ReadMessageHistory'],
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Configure des rôles via des réactions.')
    .addSubcommand((sub) => sub
      .setName('add')
      .setDescription('Ajoute un rôle-réaction sur un message.')
      .addChannelOption((option) => option.setName('salon').setDescription('Salon du message').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption((option) => option.setName('message_id').setDescription('ID du message').setRequired(true))
      .addStringOption((option) => option.setName('emoji').setDescription('Emoji (unicode ou personnalisé)').setRequired(true).setMaxLength(100))
      .addRoleOption((option) => option.setName('role').setDescription('Rôle à attribuer').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('remove')
      .setDescription('Retire un rôle-réaction.')
      .addStringOption((option) => option.setName('message_id').setDescription('ID du message').setRequired(true))
      .addStringOption((option) => option.setName('emoji').setDescription('Emoji concerné').setRequired(true).setMaxLength(100)))
    .addSubcommand((sub) => sub.setName('list').setDescription('Liste les rôles-réactions du serveur.'))
    .addSubcommand((sub) => sub
      .setName('clear')
      .setDescription('Supprime tous les rôles-réactions d’un message.')
      .addStringOption((option) => option.setName('message_id').setDescription('ID du message').setRequired(true))),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageRoles'], ['ManageRoles', 'AddReactions', 'ReadMessageHistory']))) return;
    const cfg = ctx.guildConfig;
    const sub = ctx.subcommand;
    const me = ctx.guild.members.me;

    if (sub === 'add') {
      const channel = ctx.getChannel('salon');
      const messageId = ctx.getString('message_id').trim();
      const rawEmoji = ctx.getString('emoji').trim();
      const role = ctx.getRole('role');
      if (!channel?.isTextBased()) return ctx.replyError('Salon invalide.');
      if (!isSnowflake(messageId)) return ctx.replyError('ID de message invalide.');
      if (!role) return ctx.replyError('Rôle introuvable.');
      if (role.id === ctx.guild.roles.everyone.id) return ctx.replyError('Impossible d’utiliser @everyone.');
      if (role.managed) return ctx.replyError('Ce rôle est géré par une intégration.');
      if (role.position >= me.roles.highest.position) return ctx.replyError('Ce rôle est au-dessus de mon rôle le plus haut.');

      const emoji = parseEmoji(rawEmoji);
      if (!emoji) return ctx.replyError('Emoji invalide.');

      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) return ctx.replyError('Message introuvable dans ce salon.');

      if (cfg.reactionRoles.some((entry) => entry.messageId === messageId && matchesReaction(entry.emoji, {
        id: emoji.match(/\d{15,22}/)?.[0],
        name: emoji.startsWith('<') ? null : emoji,
      }))) {
        return ctx.replyError('Un rôle-réaction existe déjà pour cet emoji sur ce message.');
      }

      const reacted = await message.react(emoji).then(() => true).catch(() => false);
      if (!reacted) return ctx.replyError('Impossible d’ajouter la réaction. Vérifie que l’emoji est accessible.');

      cfg.reactionRoles.push({
        messageId,
        channelId: channel.id,
        emoji,
        roleId: role.id,
        createdAt: Date.now(),
      });
      ctx.client.db.save();
      return ctx.reply({
        embeds: [successEmbed(`Réaction ${emoji} ajoutée sur [ce message](${message.url}).\nLes membres qui réagissent recevront ${role}.`)],
      });
    }

    if (sub === 'remove') {
      const messageId = ctx.getString('message_id').trim();
      const rawEmoji = ctx.getString('emoji').trim();
      const index = cfg.reactionRoles.findIndex((entry) => entry.messageId === messageId && matchesReaction(entry.emoji, {
        id: rawEmoji.match(/\d{15,22}/)?.[0],
        name: rawEmoji.startsWith('<') ? null : rawEmoji,
      }));
      if (index === -1) return ctx.replyError('Aucun rôle-réaction correspondant.');
      const [entry] = cfg.reactionRoles.splice(index, 1);
      ctx.client.db.save();

      const channel = ctx.guild.channels.cache.get(entry.channelId);
      const message = await channel?.messages?.fetch(entry.messageId).catch(() => null);
      const reaction = message?.reactions?.cache.find((r) => matchesReaction(entry.emoji, r.emoji));
      if (reaction) await reaction.users.remove(ctx.client.user.id).catch(() => null);

      return ctx.reply({ embeds: [successEmbed('Le rôle-réaction a été supprimé.')] });
    }

    if (sub === 'list') {
      if (!cfg.reactionRoles.length) return ctx.reply({ embeds: [baseEmbed({ color: COLORS.neutral, title: '🎭 Rôles-réactions', description: 'Aucun rôle-réaction configuré.' })], ephemeral: true });
      const description = cfg.reactionRoles.slice(0, 20).map((entry) =>
        `${emojiLabel(entry.emoji)} ➜ <@&${entry.roleId}>\n> [Message](https://discord.com/channels/${ctx.guild.id}/${entry.channelId}/${entry.messageId}) • <#${entry.channelId}>`,
      ).join('\n\n');
      return ctx.reply({
        embeds: [baseEmbed({
          color: COLORS.primary,
          title: '🎭 Rôles-réactions',
          description,
          footer: `${cfg.reactionRoles.length} configuration(s)`,
        })],
        ephemeral: true,
      });
    }

    if (sub === 'clear') {
      const messageId = ctx.getString('message_id').trim();
      const entries = cfg.reactionRoles.filter((entry) => entry.messageId === messageId);
      if (!entries.length) return ctx.replyError('Aucun rôle-réaction sur ce message.');
      cfg.reactionRoles = cfg.reactionRoles.filter((entry) => entry.messageId !== messageId);
      ctx.client.db.save();
      return ctx.reply({ embeds: [successEmbed(`${entries.length} rôle(s)-réaction(s) supprimé(s) pour ce message.`)] });
    }
  },
};

module.exports = [reactionRoleCommand];
