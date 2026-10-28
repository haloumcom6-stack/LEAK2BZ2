'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed, successEmbed } = require('../core/embeds');
const { requirePermissions } = require('../core/guard');
const { sendPanel, closeTicket, addUserToTicket, removeUserFromTicket } = require('../core/tickets');
const { discordDate } = require('../core/utils');

const ticketCommand = {
  category: 'Tickets',
  cooldown: 3,
  aliases: ['tickets', 'support'],
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Système de tickets et support.')
    .addSubcommand((sub) => sub
      .setName('setup')
      .setDescription('Configure le système de tickets.')
      .addChannelOption((option) => option.setName('salon_panel').setDescription('Salon du panneau d’ouverture').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addChannelOption((option) => option.setName('categorie').setDescription('Catégorie où créer les tickets').addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption((option) => option.setName('role_support').setDescription('Rôle du staff support'))
      .addChannelOption((option) => option.setName('salon_logs').setDescription('Salon des transcripts et logs de tickets').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((sub) => sub
      .setName('panel')
      .setDescription('Renvoie le panneau d’ouverture des tickets.')
      .addChannelOption((option) => option.setName('salon').setDescription('Salon où envoyer le panneau').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((sub) => sub
      .setName('welcome')
      .setDescription('Définit le message d’accueil dans les tickets.')
      .addStringOption((option) => option.setName('texte').setDescription('Message affiché à l’ouverture').setRequired(true).setMaxLength(1800)))
    .addSubcommand((sub) => sub
      .setName('panel-message')
      .setDescription('Définit la description du panneau de tickets.')
      .addStringOption((option) => option.setName('texte').setDescription('Description du panneau').setRequired(true).setMaxLength(1800)))
    .addSubcommand((sub) => sub
      .setName('toggle')
      .setDescription('Active ou désactive le système de tickets.')
      .addBooleanOption((option) => option.setName('activer').setDescription('Activer ?').setRequired(true)))
    .addSubcommand((sub) => sub.setName('stats').setDescription('Affiche les statistiques des tickets.'))
    .addSubcommand((sub) => sub
      .setName('close')
      .setDescription('Ferme le ticket actuel et envoie un transcript.')
      .addStringOption((option) => option.setName('raison').setDescription('Raison de la fermeture')))
    .addSubcommand((sub) => sub
      .setName('add')
      .setDescription('Ajoute un membre au ticket actuel.')
      .addUserOption((option) => option.setName('membre').setDescription('Membre à ajouter').setRequired(true)))
    .addSubcommand((sub) => sub
      .setName('remove')
      .setDescription('Retire un membre du ticket actuel.')
      .addUserOption((option) => option.setName('membre').setDescription('Membre à retirer').setRequired(true))),
  async execute(ctx) {
    const cfg = ctx.guildConfig;
    const sub = ctx.subcommand;

    if (sub === 'setup') {
      if (!(await requirePermissions(ctx, ['ManageGuild'], ['ManageChannels', 'ManageRoles', 'EmbedLinks']))) return;
      const panelChannel = ctx.getChannel('salon_panel');
      if (!panelChannel?.isTextBased()) return ctx.replyError('Choisis un salon textuel pour le panneau.');
      const category = ctx.getChannel('categorie');
      if (category && category.type !== ChannelType.GuildCategory) return ctx.replyError('La catégorie choisie est invalide.');
      const supportRole = ctx.getRole('role_support');
      const logChannel = ctx.getChannel('salon_logs');
      if (logChannel && !logChannel.isTextBased()) return ctx.replyError('Le salon de logs doit être textuel.');

      const me = ctx.guild.members.me;
      const permissions = panelChannel.permissionsFor(me);
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return ctx.replyError(`Je ne peux pas écrire dans ${panelChannel}.`);
      }

      cfg.tickets.enabled = true;
      cfg.tickets.panelChannelId = panelChannel.id;
      cfg.tickets.categoryId = category?.id || null;
      cfg.tickets.supportRoleId = supportRole?.id || null;
      cfg.tickets.logChannelId = logChannel?.id || null;
      if (logChannel) cfg.logs.tickets = logChannel.id;
      ctx.client.db.save();

      const panel = await sendPanel(panelChannel, ctx.client).catch(() => null);
      if (!panel) return ctx.replyError('Configuration enregistrée, mais impossible d’envoyer le panneau. Vérifie mes permissions.');

      return ctx.reply({
        embeds: [successEmbed(`Le système de tickets est **activé** !\n\n**Panneau :** ${panelChannel}\n**Catégorie :** ${category || '`aucune`'}\n**Rôle support :** ${supportRole || '`aucun`'}\n**Logs :** ${logChannel || '`aucun`'}\n\nPanneau : ${panel.url}`)],
        ephemeral: true,
      });
    }

    if (sub === 'panel') {
      if (!(await requirePermissions(ctx, ['ManageGuild'], ['SendMessages', 'EmbedLinks']))) return;
      const channel = ctx.getChannel('salon')
        || (cfg.tickets.panelChannelId ? ctx.guild.channels.cache.get(cfg.tickets.panelChannelId) : null)
        || ctx.channel;
      if (!channel?.isTextBased()) return ctx.replyError('Salon invalide.');
      const panel = await sendPanel(channel, ctx.client).catch(() => null);
      if (!panel) return ctx.replyError('Impossible d’envoyer le panneau (permissions manquantes).');
      cfg.tickets.panelChannelId = channel.id;
      ctx.client.db.save();
      return ctx.reply({ embeds: [successEmbed(`Panneau envoyé dans ${channel} : ${panel.url}`)], ephemeral: true });
    }

    if (sub === 'welcome') {
      if (!(await requirePermissions(ctx, ['ManageGuild'], []))) return;
      cfg.tickets.welcomeMessage = ctx.getString('texte').trim();
      ctx.client.db.save();
      return ctx.reply({ embeds: [successEmbed('Le message d’accueil des tickets a été mis à jour.')] });
    }

    if (sub === 'panel-message') {
      if (!(await requirePermissions(ctx, ['ManageGuild'], []))) return;
      cfg.tickets.panelMessage = ctx.getString('texte').trim();
      ctx.client.db.save();
      return ctx.reply({ embeds: [successEmbed('La description du panneau a été mise à jour. Utilise `ticket panel` pour renvoyer le panneau.')] });
    }

    if (sub === 'toggle') {
      if (!(await requirePermissions(ctx, ['ManageGuild'], []))) return;
      cfg.tickets.enabled = ctx.getBoolean('activer');
      ctx.client.db.save();
      return ctx.reply({ embeds: [successEmbed(`Le système de tickets est maintenant **${cfg.tickets.enabled ? 'activé' : 'désactivé'}**.`)] });
    }

    if (sub === 'stats') {
      if (!(await requirePermissions(ctx, ['ManageGuild'], []))) return;
      const total = cfg.tickets.counter || 0;
      const open = Object.keys(cfg.tickets.open || {}).length;
      return ctx.reply({
        embeds: [baseEmbed({
          color: COLORS.ticket,
          title: `${EMOJI.ticket} Statistiques des tickets`,
          fields: [
            { name: 'Tickets ouverts au total', value: `**${total}**`, inline: true },
            { name: 'Tickets actuellement ouverts', value: `**${open}**`, inline: true },
            { name: 'Rôle support', value: cfg.tickets.supportRoleId ? `<@&${cfg.tickets.supportRoleId}>` : '`aucun`', inline: false },
            { name: 'Salon de logs', value: cfg.tickets.logChannelId ? `<#${cfg.tickets.logChannelId}>` : '`aucun`', inline: false },
          ],
          footer: 'Support',
        })],
        ephemeral: true,
      });
    }

    if (sub === 'close') {
      const reason = ctx.getString('raison') || null;
      const target = ctx.isSlash ? ctx.interaction : ctx;
      return closeTicket(target, reason);
    }

    if (sub === 'add' || sub === 'remove') {
      const user = ctx.getUser('membre');
      if (!user) return ctx.replyError('Membre introuvable.');
      const result = sub === 'add'
        ? await addUserToTicket(ctx, user)
        : await removeUserFromTicket(ctx, user);
      return result.ok ? ctx.reply({ embeds: [successEmbed(result.message)] }) : ctx.replyError(result.message);
    }
  },
};

module.exports = [ticketCommand];
