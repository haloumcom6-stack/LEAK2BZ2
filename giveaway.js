'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed, errorEmbed, successEmbed, warningEmbed } = require('../core/embeds');
const { requirePermissions } = require('../core/guard');
const { confirmAction } = require('../core/confirm');
const { parseDuration, formatDuration, discordDate, truncate } = require('../core/utils');

function findGiveaway(client, guildId, id, defaultFilter = (gw) => !gw.ended) {
  if (id) {
    const direct = client.giveaways.get(id);
    if (direct && direct.guildId === guildId) return direct;
    return Object.values(client.db.data.giveaways)
      .find((gw) => gw.guildId === guildId && (gw.messageId === id || gw.id === id)) || null;
  }
  return client.giveaways.listForGuild(guildId).find(defaultFilter) || null;
}

function canManage(ctx, gw) {
  if (gw.hostId === ctx.user.id) return true;
  if (ctx.member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (ctx.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return false;
}

const giveawayCommand = {
  category: 'Giveaways',
  cooldown: 3,
  aliases: ['gw', 'concours'],
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Gère les giveaways du serveur.')
    .addSubcommand((sub) => sub
      .setName('start')
      .setDescription('Lance un nouveau giveaway.')
      .addStringOption((option) => option.setName('prix').setDescription('Lot à gagner').setRequired(true).setMaxLength(100))
      .addStringOption((option) => option.setName('duree').setDescription('Durée (ex: 10m, 1h, 2j — max 30 jours)').setRequired(true))
      .addIntegerOption((option) => option.setName('gagnants').setDescription('Nombre de gagnants (1-20)').setMinValue(1).setMaxValue(20))
      .addChannelOption((option) => option.setName('salon').setDescription('Salon où envoyer le giveaway').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption((option) => option.setName('description').setDescription('Description / règles du giveaway').setMaxLength(1500))
      .addRoleOption((option) => option.setName('role_requis').setDescription('Rôle obligatoire pour participer'))
      .addIntegerOption((option) => option.setName('niveau_requis').setDescription('Niveau minimum pour participer').setMinValue(0).setMaxValue(1000)))
    .addSubcommand((sub) => sub
      .setName('end')
      .setDescription('Termine immédiatement un giveaway.')
      .addStringOption((option) => option.setName('identifiant').setDescription('ID du message ou du giveaway (défaut : dernier actif)')))
    .addSubcommand((sub) => sub
      .setName('reroll')
      .setDescription('Retire au sort un nouveau gagnant.')
      .addStringOption((option) => option.setName('identifiant').setDescription('ID du message ou du giveaway (défaut : dernier giveaway terminé)')))
    .addSubcommand((sub) => sub
      .setName('list')
      .setDescription('Affiche la liste des giveaways du serveur.'))
    .addSubcommand((sub) => sub
      .setName('delete')
      .setDescription('Supprime un giveaway et son message.')
      .addStringOption((option) => option.setName('identifiant').setDescription('ID du message ou du giveaway (défaut : dernier actif)')))
    .addSubcommand((sub) => sub
      .setName('info')
      .setDescription('Affiche les détails d’un giveaway.')
      .addStringOption((option) => option.setName('identifiant').setDescription('ID du message ou du giveaway (défaut : dernier actif)')))
  ,
  async execute(ctx) {
    const sub = ctx.sub;

    if (sub === 'start') {
      if (!(await requirePermissions(ctx, ['ManageGuild'], []))) return;
      const channel = ctx.getChannel('salon') || ctx.channel;
      if (!channel?.isTextBased()) return ctx.replyError('Salon invalide : choisis un salon textuel.');

      const me = ctx.guild.members.me;
      const permissions = channel.permissionsFor(me);
      if (!permissions?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return ctx.replyError(`Je n’ai pas les permissions d’envoyer des embeds dans ${channel}.`);
      }

      const prize = ctx.getString('prix')?.trim();
      if (!prize) return ctx.replyError('Le prix est obligatoire.');
      const duration = parseDuration(ctx.getString('duree'));
      if (!duration) return ctx.replyError('Durée invalide. Exemples : `10m`, `1h`, `2j12h`.');
      if (duration < 10_000) return ctx.replyError('La durée minimale est de **10 secondes**.');
      if (duration > 30 * 24 * 60 * 60 * 1000) return ctx.replyError('La durée maximale est de **30 jours**.');

      const winners = Math.min(20, Math.max(1, ctx.getInteger('gagnants') || 1));
      const role = ctx.getRole('role_requis');
      const level = ctx.getInteger('niveau_requis') || null;

      const { gw } = await ctx.client.giveaways.create({
        guild: ctx.guild,
        channel,
        prize,
        description: ctx.getString('description')?.trim() || null,
        winnersCount: winners,
        durationMs: duration,
        hostId: ctx.user.id,
        roleId: role?.id || null,
        level,
      });

      await ctx.reply({
        embeds: [successEmbed(
          `Le giveaway pour **${prize}** a été lancé dans ${channel} !\n**Fin :** ${discordDate(gw.endAt, 'R')}\n**Durée :** ${formatDuration(duration)}`,
          `${EMOJI.giveaway} Giveaway lancé`,
        )],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'list') {
      const giveaways = ctx.client.giveaways.listForGuild(ctx.guild.id);
      if (!giveaways.length) return ctx.reply({ embeds: [warningEmbed('Aucun giveaway n’a encore été organisé sur ce serveur.')], ephemeral: true });
      const active = giveaways.filter((gw) => !gw.ended);
      const ended = giveaways.filter((gw) => gw.ended);
      const format = (gw) => `${gw.ended ? '⚪' : '🎉'} **${truncate(gw.prize, 60)}** — <#${gw.channelId}>\n> ${gw.ended ? 'Terminé' : `Fin ${discordDate(gw.endAt, 'R')}`} • ${gw.entries.length} participant(s) • [message](https://discord.com/channels/${ctx.guild.id}/${gw.channelId}/${gw.messageId})`;
      const embed = baseEmbed({
        color: COLORS.giveaway,
        title: `${EMOJI.giveaway} Giveaways du serveur`,
        description: `${active.length ? `**En cours (${active.length})**\n${active.slice(0, 8).map(format).join('\n\n')}` : ''}${active.length && ended.length ? '\n\n' : ''}${ended.length ? `**Terminés (${ended.length})**\n${ended.slice(0, 5).map(format).join('\n\n')}` : ''}`,
        footer: `${giveaways.length} giveaway(s)`,
      });
      return ctx.reply({ embeds: [embed], ephemeral: true });
    }

    const gw = findGiveaway(
      ctx.client,
      ctx.guild.id,
      ctx.getString('identifiant'),
      sub === 'reroll' ? (giveaway) => giveaway.ended : undefined,
    );
    if (!gw) return ctx.replyError('Giveaway introuvable. Utilise `giveaway list` pour voir les giveaways du serveur.');

    if (sub === 'info') {
      return ctx.reply({ embeds: [ctx.client.giveaways.buildEmbed(gw)], ephemeral: true });
    }

    if (!canManage(ctx, gw)) {
      return ctx.replyError('Seul l’organisateur du giveaway ou un membre avec **Gérer le serveur** peut faire ça.');
    }

    if (sub === 'end') {
      if (gw.ended) return ctx.replyError('Ce giveaway est déjà terminé.');
      const winners = await ctx.client.giveaways.end(gw);
      return ctx.reply({
        embeds: [successEmbed(winners?.length
          ? `Giveaway terminé ! Gagnant(s) : ${winners.map((id) => `<@${id}>`).join(', ')}`
          : 'Giveaway terminé sans participant valide.', '🎉 Giveaway terminé')],
        ephemeral: true,
      });
    }

    if (sub === 'reroll') {
      if (!gw.ended) return ctx.replyError('Ce giveaway est encore en cours. Termine-le d’abord avec `giveaway end`.');
      const result = await ctx.client.giveaways.reroll(gw);
      if (!result.ok) return ctx.replyError(result.message);
      return ctx.reply({
        embeds: [successEmbed(`Nouveau tirage : ${result.winners.map((id) => `<@${id}>`).join(', ')} !`, '🔄 Reroll effectué')],
        ephemeral: true,
      });
    }

    if (sub === 'delete') {
      const confirmed = await confirmAction(ctx, {
        title: 'Supprimer le giveaway',
        description: `Le giveaway **${gw.prize}** et son message seront définitivement supprimés.`,
        confirmLabel: 'Supprimer',
      });
      if (!confirmed) return;
      await ctx.client.giveaways.remove(gw);
      return ctx.edit({ embeds: [successEmbed('Le giveaway a été supprimé.')], components: [] }).catch(async () => {
        await ctx.reply({ embeds: [successEmbed('Le giveaway a été supprimé.')], ephemeral: true });
      });
    }
  },
};

module.exports = [giveawayCommand];
