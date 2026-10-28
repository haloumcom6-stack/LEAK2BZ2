'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed, successEmbed, errorEmbed } = require('../core/embeds');
const { requirePermissions } = require('../core/guard');
const { buildPollEmbed, buildPollComponents } = require('../core/polls');
const { parseHexColor, isImageUrl, truncate } = require('../core/utils');

const announceCommand = {
  category: 'Announcements',
  cooldown: 3,
  aliases: ['annonce', 'announce'],
  permissions: ['ManageGuild'],
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Envoie une annonce en embed.')
    .addChannelOption((option) => option.setName('salon').setDescription('Salon de l’annonce').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((option) => option.setName('titre').setDescription('Titre de l’annonce').setRequired(true).setMaxLength(256))
    .addStringOption((option) => option.setName('message').setDescription('Contenu de l’annonce').setRequired(true).setMaxLength(4000))
    .addStringOption((option) => option.setName('couleur').setDescription('Couleur hexadécimale (ex: #5865f2)'))
    .addStringOption((option) => option.setName('mention').setDescription('Mention à ajouter').addChoices(
      { name: 'Aucune', value: 'none' },
      { name: '@everyone', value: 'everyone' },
      { name: '@here', value: 'here' },
    ))
    .addStringOption((option) => option.setName('image').setDescription('URL d’une image')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageGuild'], ['SendMessages', 'EmbedLinks']))) return;
    const channel = ctx.getChannel('salon');
    if (!channel?.isTextBased()) return ctx.replyError('Choisis un salon textuel.');

    const me = ctx.guild.members.me;
    const permissions = channel.permissionsFor(me);
    if (!permissions?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      return ctx.replyError(`Je ne peux pas écrire d’embed dans ${channel}.`);
    }

    const mention = ctx.getString('mention') || 'none';
    if (mention !== 'none' && !ctx.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
      return ctx.replyError('Tu n’as pas la permission **Mentionner @everyone** pour utiliser cette mention.');
    }

    const color = parseHexColor(ctx.getString('couleur')) ?? COLORS.primary;
    const image = ctx.getString('image');
    if (image && !isImageUrl(image)) return ctx.replyError('L’URL de l’image est invalide (png, jpg, gif ou webp).');

    const embed = baseEmbed({
      color,
      title: ctx.getString('titre'),
      description: ctx.getString('message'),
      image: image || undefined,
      author: {
        name: `${ctx.user.tag || ctx.user.username}`,
        iconURL: ctx.user.displayAvatarURL({ size: 128 }),
      },
      footer: 'Annonce',
    });

    const payload = {
      embeds: [embed],
      allowedMentions: { parse: mention === 'none' ? [] : ['everyone'] },
    };
    if (mention !== 'none') payload.content = mention === 'everyone' ? '@everyone' : '@here';

    const message = await channel.send(payload).catch(() => null);
    if (!message) return ctx.replyError('Impossible d’envoyer l’annonce.');
    await ctx.reply({ embeds: [successEmbed(`Annonce envoyée dans ${channel} : ${message.url}`)], ephemeral: true });
  },
};

const sayCommand = {
  category: 'Announcements',
  cooldown: 2,
  aliases: ['dire'],
  permissions: ['ManageGuild'],
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Envoie un message simple en tant que bot.')
    .addChannelOption((option) => option.setName('salon').setDescription('Salon cible').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((option) => option.setName('message').setDescription('Message à envoyer').setRequired(true).setMaxLength(2000)),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageGuild'], ['SendMessages']))) return;
    const channel = ctx.getChannel('salon');
    if (!channel?.isTextBased()) return ctx.replyError('Choisis un salon textuel.');

    const canPingEveryone = ctx.member.permissions.has(PermissionFlagsBits.MentionEveryone);
    const message = await channel.send({
      content: ctx.getString('message'),
      allowedMentions: { parse: canPingEveryone ? ['everyone'] : [] },
    }).catch(() => null);
    if (!message) return ctx.replyError('Impossible d’envoyer le message.');
    await ctx.reply({ embeds: [successEmbed(`Message envoyé : ${message.url}`)], ephemeral: true });
  },
};

const pollCommand = {
  category: 'Announcements',
  cooldown: 3,
  aliases: ['sondage'],
  permissions: ['ManageGuild'],
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Crée un sondage avec boutons.')
    .addChannelOption((option) => option.setName('salon').setDescription('Salon du sondage').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((option) => option.setName('question').setDescription('Question du sondage').setRequired(true).setMaxLength(250))
    .addStringOption((option) => option.setName('option1').setDescription('Premier choix').setRequired(true).setMaxLength(80))
    .addStringOption((option) => option.setName('option2').setDescription('Deuxième choix').setRequired(true).setMaxLength(80))
    .addStringOption((option) => option.setName('option3').setDescription('Troisième choix').setMaxLength(80))
    .addStringOption((option) => option.setName('option4').setDescription('Quatrième choix').setMaxLength(80))
    .addStringOption((option) => option.setName('option5').setDescription('Cinquième choix').setMaxLength(80)),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageGuild'], ['SendMessages', 'EmbedLinks']))) return;
    const channel = ctx.getChannel('salon');
    if (!channel?.isTextBased()) return ctx.replyError('Choisis un salon textuel.');

    const labels = [];
    for (let index = 1; index <= 5; index++) {
      const label = ctx.getString(`option${index}`);
      if (label?.trim()) labels.push(label.trim());
    }
    if (labels.length < 2) return ctx.replyError('Il faut au moins deux choix.');

    const question = ctx.getString('question').trim();
    const now = Date.now();
    const poll = {
      messageId: null,
      guildId: ctx.guild.id,
      channelId: channel.id,
      question,
      options: labels.map((label) => ({ label, votes: [] })),
      authorId: ctx.user.id,
      createdAt: now,
    };

    const message = await channel.send({
      embeds: [buildPollEmbed(poll)],
      allowedMentions: { parse: [] },
    }).catch(() => null);
    if (!message) return ctx.replyError('Impossible d’envoyer le sondage.');

    poll.messageId = message.id;
    ctx.client.db.data.polls[message.id] = poll;
    ctx.client.db.save();
    await message.edit({ embeds: [buildPollEmbed(poll)], components: buildPollComponents(poll) }).catch(() => null);

    await ctx.reply({ embeds: [successEmbed(`Sondage créé dans ${channel} : ${message.url}`)], ephemeral: true });
  },
};

module.exports = [announceCommand, sayCommand, pollCommand];
