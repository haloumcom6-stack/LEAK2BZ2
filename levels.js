'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed, successEmbed, yesNo } = require('../core/embeds');
const { requirePermissions } = require('../core/guard');
const { confirmAction } = require('../core/confirm');
const {
  getUserData,
  getRank,
  xpBar,
  leaderboard,
  addXp,
  setXp,
  levelFromXp,
  xpForLevel,
} = require('../core/levels');
const { formatNumber, discordDate } = require('../core/utils');

const levelsCommand = {
  category: 'Configuration',
  cooldown: 3,
  aliases: ['lvl', 'niveaux'],
  data: new SlashCommandBuilder()
    .setName('levels')
    .setDescription('Configure le système de niveaux et d’XP.')
    .addSubcommand((sub) => sub.setName('config').setDescription('Configure le système de niveaux.')
      .addBooleanOption((option) => option.setName('activer').setDescription('Activer les niveaux ?').setRequired(true))
      .addChannelOption((option) => option.setName('salon').setDescription('Salon des messages de level-up'))
      .addIntegerOption((option) => option.setName('xp_min').setDescription('XP minimum par message (5-100)').setMinValue(5).setMaxValue(100))
      .addIntegerOption((option) => option.setName('xp_max').setDescription('XP maximum par message (5-100)').setMinValue(5).setMaxValue(100))
      .addIntegerOption((option) => option.setName('cooldown').setDescription('Cooldown entre deux gains d’XP en secondes (10-3600)').setMinValue(10).setMaxValue(3600)))
    .addSubcommand((sub) => sub.setName('reward').setDescription('Ajoute une récompense de rôle pour un niveau.')
      .addIntegerOption((option) => option.setName('niveau').setDescription('Niveau requis').setRequired(true).setMinValue(1).setMaxValue(1000))
      .addRoleOption((option) => option.setName('role').setDescription('Rôle à attribuer').setRequired(true)))
    .addSubcommand((sub) => sub.setName('remove').setDescription('Retire une récompense de niveau.')
      .addIntegerOption((option) => option.setName('niveau').setDescription('Niveau concerné').setRequired(true).setMinValue(1).setMaxValue(1000)))
    .addSubcommand((sub) => sub.setName('rewards').setDescription('Liste les récompenses de niveau.'))
    .addSubcommand((sub) => sub.setName('reset').setDescription('Réinitialise l’XP d’un membre ou de tout le serveur.')
      .addUserOption((option) => option.setName('membre').setDescription('Membre à réinitialiser (vide = tout le serveur)')))
    .addSubcommand((sub) => sub.setName('addxp').setDescription('Ajoute de l’XP à un membre.')
      .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true))
      .addIntegerOption((option) => option.setName('montant').setDescription('XP à ajouter').setRequired(true).setMinValue(1).setMaxValue(1_000_000)))
    .addSubcommand((sub) => sub.setName('removexp').setDescription('Retire de l’XP à un membre.')
      .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true))
      .addIntegerOption((option) => option.setName('montant').setDescription('XP à retirer').setRequired(true).setMinValue(1).setMaxValue(1_000_000)))
    .addSubcommand((sub) => sub.setName('setxp').setDescription('Définit l’XP exacte d’un membre.')
      .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true))
      .addIntegerOption((option) => option.setName('montant').setDescription('XP total').setRequired(true).setMinValue(0).setMaxValue(1_000_000_000))),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageGuild'], []))) return;
    const cfg = ctx.guildConfig;
    const levels = cfg.levels;
    const sub = ctx.subcommand;
    const me = ctx.guild.members.me;

    if (sub === 'config') {
      levels.enabled = ctx.getBoolean('activer');
      const channel = ctx.getChannel('salon');
      if (channel) {
        if (!channel.isTextBased()) return ctx.replyError('Choisis un salon textuel.');
        levels.channelId = channel.id;
      }
      const min = ctx.getInteger('xp_min');
      const max = ctx.getInteger('xp_max');
      const cooldown = ctx.getInteger('cooldown');
      if (min !== null) levels.xpMin = min;
      if (max !== null) levels.xpMax = max;
      if (levels.xpMax < levels.xpMin) [levels.xpMin, levels.xpMax] = [levels.xpMax, levels.xpMin];
      if (cooldown !== null) levels.cooldown = cooldown;
      ctx.client.db.save();
      return ctx.reply({
        embeds: [successEmbed(`**Niveaux :** ${yesNo(levels.enabled)}\n**XP par message :** ${levels.xpMin}-${levels.xpMax}\n**Cooldown :** ${levels.cooldown}s\n**Salon de level-up :** ${levels.channelId ? `<#${levels.channelId}>` : 'salon courant'}`)],
      });
    }

    if (sub === 'reward') {
      const level = ctx.getInteger('niveau');
      const role = ctx.getRole('role');
      if (!role) return ctx.replyError('Rôle introuvable.');
      if (role.managed) return ctx.replyError('Ce rôle est géré par une intégration.');
      if (role.position >= me.roles.highest.position) return ctx.replyError('Ce rôle est au-dessus de mon rôle le plus haut.');
      levels.rewards[String(level)] = role.id;
      ctx.client.db.save();
      return ctx.reply({ embeds: [successEmbed(`Le rôle ${role} sera attribué au niveau **${level}**.`)] });
    }

    if (sub === 'remove') {
      const level = String(ctx.getInteger('niveau'));
      if (!levels.rewards[level]) return ctx.replyError(`Aucune récompense configurée pour le niveau **${level}**.`);
      delete levels.rewards[level];
      ctx.client.db.save();
      return ctx.reply({ embeds: [successEmbed(`La récompense du niveau **${level}** a été supprimée.`)] });
    }

    if (sub === 'rewards') {
      const entries = Object.entries(levels.rewards || {}).sort((a, b) => Number(a[0]) - Number(b[0]));
      return ctx.reply({
        embeds: [baseEmbed({
          color: COLORS.level,
          title: `${EMOJI.level} Récompenses de niveau`,
          description: entries.length
            ? entries.map(([level, roleId]) => `**Niveau ${level}** ➜ <@&${roleId}>`).join('\n')
            : 'Aucune récompense configurée. Utilise `levels reward`.',
          footer: 'Niveaux',
        })],
        ephemeral: true,
      });
    }

    if (sub === 'reset') {
      const user = ctx.getUser('membre');
      if (user) {
        delete levels.users[user.id];
        ctx.client.db.save();
        return ctx.reply({ embeds: [successEmbed(`L’XP de ${user} a été réinitialisée.`)] });
      }
      const confirmed = await confirmAction(ctx, {
        title: 'Réinitialiser tous les niveaux',
        description: `Toute l’XP de **${Object.keys(levels.users).length} membre(s)** sera définitivement supprimée.`,
      });
      if (!confirmed) return;
      levels.users = {};
      ctx.client.db.save();
      return ctx.edit({ embeds: [successEmbed('Toute l’XP du serveur a été réinitialisée.')], components: [] }).catch(async () => {
        await ctx.reply({ embeds: [successEmbed('Toute l’XP du serveur a été réinitialisée.')] });
      });
    }

    if (sub === 'addxp' || sub === 'removexp' || sub === 'setxp') {
      const user = ctx.getUser('membre');
      const amount = ctx.getInteger('montant');
      if (!user) return ctx.replyError('Membre introuvable.');
      let data;
      if (sub === 'addxp') data = addXp(levels, user.id, amount);
      else if (sub === 'removexp') data = addXp(levels, user.id, -amount);
      else data = setXp(levels, user.id, amount);
      ctx.client.db.save();
      return ctx.reply({
        embeds: [successEmbed(`**${user.tag || user.username}** a maintenant **${formatNumber(data.xp)} XP** (niveau **${data.level}**).`)],
      });
    }
  },
};

const rankCommand = {
  category: 'Levels',
  cooldown: 3,
  aliases: ['niveau', 'xp'],
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Affiche ton niveau ou celui d’un membre.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre à consulter')),
  async execute(ctx) {
    const cfg = ctx.guildConfig;
    const user = ctx.getUser('membre') || ctx.user;
    const data = getUserData(cfg.levels, user.id);
    const rank = getRank(cfg.levels, user.id);
    const progress = xpBar(cfg.levels, user.id);
    const nextXp = xpForLevel(progress.level + 1);

    const embed = baseEmbed({
      color: COLORS.level,
      title: `${EMOJI.level} ${user.tag || user.username}`,
      thumbnail: user.displayAvatarURL({ size: 256 }),
      fields: [
        { name: 'Niveau', value: `**${data.level || 0}**`, inline: true },
        { name: 'XP', value: `**${formatNumber(data.xp)}** / ${formatNumber(nextXp)}`, inline: true },
        { name: 'Classement', value: `**#${rank.rank}** / ${rank.total}`, inline: true },
        { name: 'Progression', value: `${progress.bar} **${progress.percent}%**\n> ${formatNumber(progress.current)} / ${formatNumber(progress.needed)} XP avant le niveau **${progress.level + 1}**`, inline: false },
        { name: 'Messages comptés', value: `${formatNumber(data.messages || 0)}`, inline: true },
      ],
      footer: 'Niveaux',
    });
    await ctx.reply({ embeds: [embed] });
  },
};

const leaderboardCommand = {
  category: 'Levels',
  cooldown: 5,
  aliases: ['lb', 'top'],
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Affiche le classement des niveaux du serveur.'),
  async execute(ctx) {
    const cfg = ctx.guildConfig;
    const top = leaderboard(cfg.levels, 10);
    if (!top.length) {
      return ctx.reply({ embeds: [baseEmbed({ color: COLORS.level, title: `${EMOJI.level} Classement`, description: 'Aucun membre n’a encore gagné d’XP.' })] });
    }
    const medals = ['🥇', '🥈', '🥉'];
    const description = top.map((entry, index) => {
      const member = ctx.guild.members.cache.get(entry.id);
      const name = member ? member.displayName : `<@${entry.id}>`;
      return `${medals[index] || `**#${index + 1}**`} **${name}** — niveau **${entry.level}** • ${formatNumber(entry.xp)} XP`;
    }).join('\n');

    const embed = baseEmbed({
      color: COLORS.level,
      title: `${EMOJI.crown} Classement du serveur`,
      description,
      footer: `${Object.keys(cfg.levels.users).length} membre(s) classé(s)`,
      thumbnail: ctx.guild.iconURL({ size: 256 }),
    });
    await ctx.reply({ embeds: [embed] });
  },
};

module.exports = [levelsCommand, rankCommand, leaderboardCommand];
