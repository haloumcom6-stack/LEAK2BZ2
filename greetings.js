'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed, successEmbed } = require('../core/embeds');
const { requirePermissions } = require('../core/guard');
const { sendGreeting } = require('../core/greetings');
const { truncate } = require('../core/utils');

const PLACEHOLDERS = '`{user}` mention • `{username}` pseudo • `{tag}` tag • `{nickname}` surnom\n`{server}` serveur • `{count}` membres • `{created}` création du compte';

function buildGreetingCommand(kind) {
  const isWelcome = kind === 'welcome';
  const title = isWelcome ? 'Bienvenue' : 'Au revoir';
  const builder = new SlashCommandBuilder()
    .setName(kind)
    .setDescription(isWelcome ? 'Configure les messages de bienvenue.' : 'Configure les messages d’au revoir.')
    .addSubcommand((sub) => sub
      .setName('channel')
      .setDescription(isWelcome ? 'Définit le salon de bienvenue.' : 'Définit le salon d’au revoir.')
      .addChannelOption((option) => option.setName('salon').setDescription('Salon textuel').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((sub) => sub
      .setName('message')
      .setDescription('Définit le message personnalisé.')
      .addStringOption((option) => option.setName('texte').setDescription('Message avec variables').setRequired(true).setMaxLength(1800)))
    .addSubcommand((sub) => sub
      .setName('embed')
      .setDescription('Active ou désactive l’affichage en embed.')
      .addBooleanOption((option) => option.setName('activer').setDescription('Activer l’embed ?').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('toggle')
      .setDescription('Active ou désactive le module.')
      .addBooleanOption((option) => option.setName('activer').setDescription('Activer le module ?').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('test')
      .setDescription('Envoie un message de test.'));

  if (isWelcome) {
    builder.addSubcommand((sub) => sub
      .setName('dm')
      .setDescription('Active ou désactive le message privé de bienvenue.')
      .addBooleanOption((option) => option.setName('activer').setDescription('Envoyer un MP ?').setRequired(true)));
  }

  return {
    category: 'Configuration',
    cooldown: 2,
    aliases: [kind],
    permissions: ['ManageGuild'],
    data: builder,
    async execute(ctx) {
      if (!(await requirePermissions(ctx, ['ManageGuild'], []))) return;
      const cfg = ctx.guildConfig;
      const conf = cfg[kind];
      const sub = ctx.subcommand;

      if (sub === 'channel') {
        const channel = ctx.getChannel('salon');
        if (!channel?.isTextBased()) return ctx.replyError('Choisis un salon textuel.');
        conf.channelId = channel.id;
        conf.enabled = true;
        ctx.client.db.save();
        return ctx.reply({
          embeds: [successEmbed(`Les messages de **${title.toLowerCase()}** seront envoyés dans ${channel}.\n\n**Variables disponibles :**\n${PLACEHOLDERS}`)],
        });
      }

      if (sub === 'message') {
        const text = ctx.getString('texte');
        if (!text?.trim()) return ctx.replyError('Le message ne peut pas être vide.');
        conf.message = text.trim();
        ctx.client.db.save();
        return ctx.reply({
          embeds: [successEmbed(`Le message de **${title.toLowerCase()}** a été mis à jour.\n\n**Aperçu :**\n${truncate(text, 1000)}\n\n**Variables :** ${PLACEHOLDERS}`)],
        });
      }

      if (sub === 'embed') {
        conf.embed = ctx.getBoolean('activer');
        ctx.client.db.save();
        return ctx.reply({ embeds: [successEmbed(`L’affichage en embed est maintenant **${conf.embed ? 'activé' : 'désactivé'}**.`)] });
      }

      if (sub === 'toggle') {
        conf.enabled = ctx.getBoolean('activer');
        if (conf.enabled && !conf.channelId) {
          return ctx.replyError('Configure d’abord un salon avec la sous-commande `channel`.');
        }
        ctx.client.db.save();
        return ctx.reply({ embeds: [successEmbed(`Le module **${title.toLowerCase()}** est maintenant **${conf.enabled ? 'activé' : 'désactivé'}**.`)] });
      }

      if (sub === 'dm') {
        conf.dm = ctx.getBoolean('activer');
        ctx.client.db.save();
        return ctx.reply({ embeds: [successEmbed(`Le message privé de bienvenue est maintenant **${conf.dm ? 'activé' : 'désactivé'}**.`)] });
      }

      if (sub === 'test') {
        const channel = conf.channelId
          ? ctx.guild.channels.cache.get(conf.channelId) || await ctx.guild.channels.fetch(conf.channelId).catch(() => null)
          : ctx.channel;
        if (!channel?.isTextBased()) return ctx.replyError('Aucun salon valide n’est configuré.');

        const ok = await sendGreeting(ctx.client, {
          guild: ctx.guild,
          user: ctx.user,
          member: ctx.member,
          kind,
          force: true,
          channel,
          sendDm: false,
        });
        if (!ok) return ctx.replyError('Impossible d’envoyer le message de test.');
        return ctx.reply({ embeds: [successEmbed(`Message de test envoyé dans ${channel}.`)], ephemeral: true });
      }
    },
  };
}

module.exports = [
  buildGreetingCommand('welcome'),
  buildGreetingCommand('goodbye'),
];
