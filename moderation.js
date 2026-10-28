'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  Collection,
} = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed, errorEmbed, modEmbed, successEmbed, warningEmbed } = require('../core/embeds');
const { requirePermissions, assertHierarchy } = require('../core/guard');
const { addCase, getWarnings, getCasesForUser, getCase, removeCase, caseTypeLabel, caseTypeEmoji } = require('../core/cases');
const { sendLog } = require('../core/logs');
const { parseDuration, formatDuration, discordDate, isSnowflake, truncate } = require('../core/utils');
const { addTempban, cancelTempban } = require('../core/tempbans');
const { clearRaidMode } = require('../core/automod');

const ACTION_LABELS = {
  ban: 'Bannissement',
  tempban: 'Bannissement temporaire',
  kick: 'Expulsion',
  softban: 'Softban',
  timeout: 'Exclusion temporaire',
  untimeout: 'Fin d’exclusion',
  warn: 'Avertissement',
};

async function notifyUser(user, guild, { action, reason, duration, caseId }) {
  if (!user || user.bot) return;
  const description = {
    ban: 'Tu as été **banni** du serveur.',
    tempban: 'Tu as été **banni temporairement** du serveur.',
    kick: 'Tu as été **expulsé** du serveur.',
    softban: 'Tu as été **softban** (banni puis débanni pour supprimer tes messages).',
    timeout: 'Tu as été **exclu temporairement** du serveur.',
    warn: 'Tu as reçu un **avertissement**.',
  }[action] || `Sanction appliquée : **${action}**.`;

  await user.send({
    embeds: [baseEmbed({
      color: action === 'warn' ? COLORS.warning : COLORS.error,
      title: `${EMOJI.shield} Sanction — ${guild.name}`,
      description,
      fields: [
        { name: 'Raison', value: reason || 'Aucune raison fournie', inline: false },
        ...(duration ? [{ name: 'Durée', value: formatDuration(duration, { long: true }), inline: true }] : []),
        ...(caseId ? [{ name: 'Dossier', value: `#${caseId}`, inline: true }] : []),
      ],
      footer: 'Modération',
    })],
  }).catch(() => null);
}

async function logAction(guild, embed) {
  await sendLog(guild, 'mod', embed);
}

function buildSanctionResponse(ctx, action, target, reason, entry, duration, extra) {
  return modEmbed({
    action: `${ACTION_LABELS[action] || action} — ${target.tag || target.username}`,
    target,
    moderator: ctx.user,
    reason,
    caseId: entry?.id,
    duration,
    color: action === 'warn' ? COLORS.warning : COLORS.moderation,
    extra,
  });
}

const banCommand = {
  category: 'Moderation',
  cooldown: 3,
  aliases: ['bannir'],
  permissions: ['BanMembers'],
  botPermissions: ['BanMembers'],
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannit un membre du serveur.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre à bannir').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Raison du bannissement'))
    .addStringOption((option) => option.setName('duree').setDescription('Durée (ex: 1j, 12h, 30m) — vide = permanent'))
    .addIntegerOption((option) => option.setName('messages').setDescription('Supprimer les messages des N derniers jours (0-7)').setMinValue(0).setMaxValue(7)),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['BanMembers'], ['BanMembers']))) return;
    const user = ctx.getUser('membre');
    if (!user) return ctx.replyError('Membre introuvable.');

    if (user.id === ctx.user.id) return ctx.replyError('Tu ne peux pas te bannir toi-même.');
    if (user.id === ctx.client.user.id) return ctx.replyError('Je ne peux pas me bannir moi-même.');
    if (user.id === ctx.guild.ownerId) return ctx.replyError('Impossible de bannir le propriétaire du serveur.');

    const member = await ctx.fetchMember('membre');
    if (member && !(await assertHierarchy(ctx, member, { action: 'bannir' }))) return;

    const reason = ctx.getString('raison')?.trim() || 'Aucune raison fournie';
    const durationInput = ctx.getString('duree');
    let duration = null;
    if (durationInput) {
      duration = parseDuration(durationInput);
      if (!duration) return ctx.replyError('Durée invalide. Exemples : `1j`, `12h`, `30m`, `2j12h`.');
    }

    const deleteDays = ctx.getInteger('messages') ?? 0;
    const existing = await ctx.guild.bans.fetch(user.id).catch(() => null);
    if (existing) return ctx.replyError(`${user} est déjà banni du serveur.`);

    await ctx.defer({ ephemeral: false });
    const banned = await ctx.guild.bans.create(user.id, {
      reason: `${reason} — ${ctx.user.tag || ctx.user.username}`,
      deleteMessageSeconds: deleteDays * 24 * 60 * 60,
    }).then(() => true).catch((error) => {
      ctx.replyError(`Impossible de bannir ce membre : ${truncate(error.message, 200)}`);
      return false;
    });
    if (!banned) return;

    if (duration) addTempban(ctx.client, ctx.guild.id, user.id, Date.now() + duration, reason);

    const entry = addCase(ctx.client.db, ctx.guild.id, {
      type: duration ? 'tempban' : 'ban',
      userId: user.id,
      moderatorId: ctx.user.id,
      reason,
      duration,
    });

    const embed = buildSanctionResponse(ctx, duration ? 'tempban' : 'ban', user, reason, entry, duration,
      duration ? `Fin automatique : ${discordDate(Date.now() + duration, 'R')}` : null);
    await notifyUser(user, ctx.guild, { action: duration ? 'tempban' : 'ban', reason, duration, caseId: entry.id });
    await logAction(ctx.guild, embed);
    await ctx.edit({ embeds: [embed] }).catch(async () => {
      await ctx.reply({ embeds: [embed] }).catch(() => null);
    });
  },
};

const kickCommand = {
  category: 'Moderation',
  cooldown: 3,
  aliases: ['expulser'],
  permissions: ['KickMembers'],
  botPermissions: ['KickMembers'],
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulse un membre du serveur.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre à expulser').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Raison de l’expulsion')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['KickMembers'], ['KickMembers']))) return;
    const member = await ctx.fetchMember('membre');
    if (!member) return ctx.replyError('Membre introuvable sur ce serveur.');
    if (!(await assertHierarchy(ctx, member, { action: 'expulser' }))) return;

    const reason = ctx.getString('raison')?.trim() || 'Aucune raison fournie';
    await ctx.defer({ ephemeral: false });
    const ok = await member.kick(`${reason} — ${ctx.user.tag || ctx.user.username}`).then(() => true).catch((error) => {
      ctx.replyError(`Impossible d’expulser ce membre : ${truncate(error.message, 200)}`);
      return false;
    });
    if (!ok) return;

    const entry = addCase(ctx.client.db, ctx.guild.id, {
      type: 'kick',
      userId: member.id,
      moderatorId: ctx.user.id,
      reason,
    });
    const embed = buildSanctionResponse(ctx, 'kick', member.user, reason, entry);
    await notifyUser(member.user, ctx.guild, { action: 'kick', reason, caseId: entry.id });
    await logAction(ctx.guild, embed);
    await ctx.edit({ embeds: [embed] }).catch(async () => {
      await ctx.reply({ embeds: [embed] }).catch(() => null);
    });
  },
};

const softbanCommand = {
  category: 'Moderation',
  cooldown: 3,
  aliases: ['softbannir'],
  permissions: ['BanMembers'],
  botPermissions: ['BanMembers'],
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Bannit puis débannit immédiatement un membre pour supprimer ses messages.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre à softban').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Raison du softban')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['BanMembers'], ['BanMembers']))) return;
    const member = await ctx.fetchMember('membre');
    if (!member) return ctx.replyError('Membre introuvable sur ce serveur.');
    if (!(await assertHierarchy(ctx, member, { action: 'softban' }))) return;

    const reason = ctx.getString('raison')?.trim() || 'Aucune raison fournie';
    await ctx.defer({ ephemeral: false });
    const banned = await ctx.guild.bans.create(member.id, {
      reason: `Softban : ${reason} — ${ctx.user.tag || ctx.user.username}`,
      deleteMessageSeconds: 7 * 24 * 60 * 60,
    }).then(() => true).catch(() => false);
    if (!banned) {
      await ctx.edit({ embeds: [errorEmbed('Impossible de softban ce membre.')] }).catch(() => null);
      return;
    }
    await ctx.guild.bans.remove(member.id, 'Softban : débannissement automatique').catch(() => null);

    const entry = addCase(ctx.client.db, ctx.guild.id, {
      type: 'softban',
      userId: member.id,
      moderatorId: ctx.user.id,
      reason,
    });
    const embed = buildSanctionResponse(ctx, 'softban', member.user, reason, entry, null, 'Messages des 7 derniers jours supprimés.');
    await notifyUser(member.user, ctx.guild, { action: 'softban', reason, caseId: entry.id });
    await logAction(ctx.guild, embed);
    await ctx.edit({ embeds: [embed] }).catch(async () => {
      await ctx.reply({ embeds: [embed] }).catch(() => null);
    });
  },
};

const timeoutCommand = {
  category: 'Moderation',
  cooldown: 3,
  aliases: ['mute', 'exclure'],
  permissions: ['ModerateMembers'],
  botPermissions: ['ModerateMembers'],
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Exclut temporairement un membre (timeout).')
    .addUserOption((option) => option.setName('membre').setDescription('Membre à exclure').setRequired(true))
    .addStringOption((option) => option.setName('duree').setDescription('Durée (ex: 10m, 1h, 1j — max 28 jours)').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Raison de l’exclusion')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ModerateMembers'], ['ModerateMembers']))) return;
    const member = await ctx.fetchMember('membre');
    if (!member) return ctx.replyError('Membre introuvable sur ce serveur.');
    if (!(await assertHierarchy(ctx, member, { action: 'exclure' }))) return;
    if (member.id === ctx.client.user.id) return ctx.replyError('Je ne peux pas m’exclure moi-même.');

    const duration = parseDuration(ctx.getString('duree'));
    if (!duration) return ctx.replyError('Durée invalide. Exemples : `10m`, `1h`, `1j`.');
    if (duration > 28 * 24 * 60 * 60 * 1000) return ctx.replyError('La durée maximale d’un timeout est de **28 jours**.');
    if (!member.moderatable) return ctx.replyError('Je ne peux pas exclure ce membre (permissions ou hiérarchie).');

    const reason = ctx.getString('raison')?.trim() || 'Aucune raison fournie';
    await ctx.defer({ ephemeral: false });
    const ok = await member.timeout(duration, `${reason} — ${ctx.user.tag || ctx.user.username}`).then(() => true).catch((error) => {
      ctx.replyError(`Impossible d’exclure ce membre : ${truncate(error.message, 200)}`);
      return false;
    });
    if (!ok) return;

    const entry = addCase(ctx.client.db, ctx.guild.id, {
      type: 'timeout',
      userId: member.id,
      moderatorId: ctx.user.id,
      reason,
      duration,
    });
    const embed = buildSanctionResponse(ctx, 'timeout', member.user, reason, entry, duration, `Fin : ${discordDate(Date.now() + duration, 'R')}`);
    await notifyUser(member.user, ctx.guild, { action: 'timeout', reason, duration, caseId: entry.id });
    await logAction(ctx.guild, embed);
    await ctx.edit({ embeds: [embed] }).catch(async () => {
      await ctx.reply({ embeds: [embed] }).catch(() => null);
    });
  },
};

const untimeoutCommand = {
  category: 'Moderation',
  cooldown: 3,
  aliases: ['unmute', 'unexclure'],
  permissions: ['ModerateMembers'],
  botPermissions: ['ModerateMembers'],
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Retire l’exclusion temporaire d’un membre.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre à libérer').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Raison')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ModerateMembers'], ['ModerateMembers']))) return;
    const member = await ctx.fetchMember('membre');
    if (!member) return ctx.replyError('Membre introuvable sur ce serveur.');
    if (!(await assertHierarchy(ctx, member, { action: 'réhabiliter' }))) return;
    if (!member.communicationDisabledUntilTimestamp) return ctx.replyError('Ce membre n’est pas en timeout.');

    const reason = ctx.getString('raison')?.trim() || 'Aucune raison fournie';
    const ok = await member.timeout(null, `${reason} — ${ctx.user.tag || ctx.user.username}`).then(() => true).catch(() => false);
    if (!ok) return ctx.replyError('Impossible de retirer le timeout de ce membre.');

    const entry = addCase(ctx.client.db, ctx.guild.id, {
      type: 'untimeout',
      userId: member.id,
      moderatorId: ctx.user.id,
      reason,
    });
    const embed = buildSanctionResponse(ctx, 'untimeout', member.user, reason, entry);
    await logAction(ctx.guild, embed);
    await ctx.reply({ embeds: [embed] });
  },
};

const warnCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['avertir'],
  permissions: ['ModerateMembers'],
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Avertit un membre.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre à avertir').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Raison de l’avertissement')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ModerateMembers'], []))) return;
    const member = await ctx.fetchMember('membre');
    if (!member) return ctx.replyError('Membre introuvable sur ce serveur.');
    if (!(await assertHierarchy(ctx, member, { action: 'avertir' }))) return;

    const reason = ctx.getString('raison')?.trim() || 'Aucune raison fournie';
    const entry = addCase(ctx.client.db, ctx.guild.id, {
      type: 'warn',
      userId: member.id,
      moderatorId: ctx.user.id,
      reason,
    });
    const total = getWarnings(ctx.guildConfig, member.id).length;
    const embed = buildSanctionResponse(ctx, 'warn', member.user, reason, entry, null, `Total d’avertissements : **${total}**`);
    await notifyUser(member.user, ctx.guild, { action: 'warn', reason, caseId: entry.id });
    await logAction(ctx.guild, embed);
    await ctx.reply({ embeds: [embed] });
  },
};

const warningsCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['warns'],
  permissions: ['ModerateMembers'],
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Affiche les avertissements d’un membre.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre à consulter')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ModerateMembers'], []))) return;
    const user = ctx.getUser('membre') || ctx.user;
    const warnings = getWarnings(ctx.guildConfig, user.id);
    if (!warnings.length) {
      return ctx.reply({ embeds: [successEmbed(`${user} n’a aucun avertissement.`, '✅ Casier vierge')], ephemeral: true });
    }

    const embed = baseEmbed({
      color: COLORS.warning,
      title: `${EMOJI.warning} Avertissements de ${user.tag || user.username}`,
      description: warnings.slice(-20).reverse().map((entry) =>
        `**#${entry.id}** • ${discordDate(entry.at, 'R')}\n> ${truncate(entry.reason, 300)}\n> *Par <@${entry.moderatorId}>*`,
      ).join('\n\n'),
      footer: `${warnings.length} avertissement(s)`,
      thumbnail: user.displayAvatarURL({ size: 128 }),
    });
    await ctx.reply({ embeds: [embed], ephemeral: true });
  },
};

const delwarnCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['delwarns'],
  permissions: ['ModerateMembers'],
  data: new SlashCommandBuilder()
    .setName('delwarn')
    .setDescription('Supprime un avertissement.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true))
    .addIntegerOption((option) => option.setName('identifiant').setDescription('Numéro du dossier d’avertissement').setRequired(true).setMinValue(1)),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ModerateMembers'], []))) return;
    const user = ctx.getUser('membre');
    const id = ctx.getInteger('identifiant');
    if (!user) return ctx.replyError('Membre introuvable.');
    const entry = getCase(ctx.guildConfig, id);
    if (!entry || entry.userId !== user.id || entry.type !== 'warn') {
      return ctx.replyError(`Aucun avertissement **#${id}** trouvé pour ${user}.`);
    }
    removeCase(ctx.guildConfig, id);
    ctx.client.db.save();
    await ctx.reply({ embeds: [successEmbed(`L’avertissement **#${id}** de ${user} a été supprimé.`)] });
  },
};

const clearCommand = {
  category: 'Moderation',
  cooldown: 3,
  aliases: ['purge', 'clear'],
  permissions: ['ManageMessages'],
  botPermissions: ['ManageMessages'],
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprime des messages dans le salon.')
    .addIntegerOption((option) => option.setName('nombre').setDescription('Nombre de messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((option) => option.setName('membre').setDescription('Ne supprimer que les messages de ce membre'))
    .addStringOption((option) => option.setName('contient').setDescription('Ne supprimer que les messages contenant ce texte')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageMessages'], ['ManageMessages']))) return;
    const count = ctx.getInteger('nombre');
    const user = ctx.getUser('membre');
    const contains = ctx.getString('contient')?.toLowerCase();

    const fetched = await ctx.channel.messages.fetch({ limit: count }).catch(() => null);
    if (!fetched || fetched.size === 0) return ctx.replyError('Aucun message à supprimer.');

    let messages = [...fetched.values()];
    if (user) messages = messages.filter((message) => message.author.id === user.id);
    if (contains) messages = messages.filter((message) => message.content.toLowerCase().includes(contains));
    if (messages.length === 0) return ctx.replyError('Aucun message ne correspond aux filtres.');

    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const recent = messages.filter((message) => message.createdTimestamp > twoWeeksAgo);

    let deleted = 0;
    if (recent.length === 1) {
      const ok = await recent[0].delete().then(() => true).catch(() => false);
      deleted = ok ? 1 : 0;
    } else if (recent.length > 1) {
      const collection = new Collection(recent.map((message) => [message.id, message]));
      const result = await ctx.channel.bulkDelete(collection, true).catch(() => null);
      deleted = result?.size || 0;
    }

    if (!deleted) return ctx.replyError('Impossible de supprimer ces messages (ils ont peut-être plus de 14 jours).');
    await ctx.reply({
      embeds: [successEmbed(`**${deleted}** message(s) supprimé(s) dans ${ctx.channel}.`)],
      ephemeral: true,
    });
  },
};

const caseCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['dossier'],
  permissions: ['ModerateMembers'],
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Affiche un dossier de modération.')
    .addIntegerOption((option) => option.setName('identifiant').setDescription('Numéro du dossier').setRequired(true).setMinValue(1)),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ModerateMembers'], []))) return;
    const entry = getCase(ctx.guildConfig, ctx.getInteger('identifiant'));
    if (!entry) return ctx.replyError('Dossier introuvable.');
    const embed = baseEmbed({
      color: COLORS.moderation,
      title: `${caseTypeEmoji(entry.type)} Dossier #${entry.id} — ${caseTypeLabel(entry.type)}`,
      fields: [
        { name: 'Membre', value: `<@${entry.userId}> (${entry.userId})`, inline: true },
        { name: 'Modérateur', value: `<@${entry.moderatorId}> (${entry.moderatorId})`, inline: true },
        { name: 'Date', value: discordDate(entry.at, 'f'), inline: true },
        { name: 'Raison', value: truncate(entry.reason, 1000), inline: false },
        ...(entry.duration ? [{ name: 'Durée', value: formatDuration(entry.duration, { long: true }), inline: true }] : []),
      ],
      footer: 'Modération',
    });
    await ctx.reply({ embeds: [embed], ephemeral: true });
  },
};

const historyCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['casier'],
  permissions: ['ModerateMembers'],
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('Affiche l’historique de modération d’un membre.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre à consulter').setRequired(true)),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ModerateMembers'], []))) return;
    const user = ctx.getUser('membre');
    if (!user) return ctx.replyError('Membre introuvable.');
    const entries = getCasesForUser(ctx.guildConfig, user.id);
    if (!entries.length) return ctx.reply({ embeds: [successEmbed(`${user} n’a aucun dossier de modération.`, '✅ Casier vierge')], ephemeral: true });

    const embed = baseEmbed({
      color: COLORS.moderation,
      title: `${EMOJI.shield} Historique de ${user.tag || user.username}`,
      description: entries.slice(-15).reverse().map((entry) =>
        `${caseTypeEmoji(entry.type)} **#${entry.id}** • ${caseTypeLabel(entry.type)} • ${discordDate(entry.at, 'R')}\n> ${truncate(entry.reason, 200)}`,
      ).join('\n\n'),
      footer: `${entries.length} dossier(s)`,
      thumbnail: user.displayAvatarURL({ size: 128 }),
    });
    await ctx.reply({ embeds: [embed], ephemeral: true });
  },
};

const banlistCommand = {
  category: 'Moderation',
  cooldown: 3,
  aliases: ['bans'],
  permissions: ['BanMembers'],
  botPermissions: ['BanMembers'],
  data: new SlashCommandBuilder()
    .setName('banlist')
    .setDescription('Affiche la liste des membres bannis.')
    .addIntegerOption((option) => option.setName('limite').setDescription('Nombre de bans à afficher (1-50)').setMinValue(1).setMaxValue(50)),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['BanMembers'], ['BanMembers']))) return;
    const limit = ctx.getInteger('limite') || 10;
    const bans = await ctx.guild.bans.fetch({ limit }).catch(() => null);
    if (!bans || bans.size === 0) return ctx.reply({ embeds: [successEmbed('Aucun membre banni sur ce serveur.', '🔓 Liste vide')], ephemeral: true });

    const embed = baseEmbed({
      color: COLORS.error,
      title: `${EMOJI.ban} Membres bannis (${bans.size})`,
      description: [...bans.values()].slice(0, limit).map((ban) =>
        `**${truncate(ban.user.tag || ban.user.username, 60)}** (${ban.user.id})\n> ${truncate(ban.reason || 'Aucune raison', 200)}`,
      ).join('\n\n'),
      footer: 'Modération',
    });
    await ctx.reply({ embeds: [embed], ephemeral: true });
  },
};

const unbanCommand = {
  category: 'Moderation',
  cooldown: 3,
  aliases: ['debannir'],
  permissions: ['BanMembers'],
  botPermissions: ['BanMembers'],
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Débannit un utilisateur grâce à son identifiant.')
    .addStringOption((option) => option.setName('utilisateur_id').setDescription('Identifiant Discord de l’utilisateur').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Raison du débannissement')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['BanMembers'], ['BanMembers']))) return;
    const id = (ctx.getString('utilisateur_id') || '').trim();
    if (!isSnowflake(id)) return ctx.replyError('Identifiant invalide. Fournis l’ID Discord de l’utilisateur (17-20 chiffres).');

    const ban = await ctx.guild.bans.fetch(id).catch(() => null);
    if (!ban) return ctx.replyError('Cet utilisateur n’est pas banni du serveur.');

    const reason = ctx.getString('raison')?.trim() || 'Aucune raison fournie';
    const ok = await ctx.guild.bans.remove(id, `${reason} — ${ctx.user.tag || ctx.user.username}`).then(() => true).catch(() => false);
    if (!ok) return ctx.replyError('Impossible de débannir cet utilisateur.');

    cancelTempban(ctx.client, ctx.guild.id, id);
    const entry = addCase(ctx.client.db, ctx.guild.id, {
      type: 'unban',
      userId: id,
      moderatorId: ctx.user.id,
      reason,
    });
    const embed = modEmbed({
      action: `Débannissement — ${ban.user.tag || ban.user.username}`,
      target: ban.user,
      moderator: ctx.user,
      reason,
      caseId: entry.id,
      color: COLORS.success,
    });
    await logAction(ctx.guild, embed);
    await ctx.reply({ embeds: [embed] });
  },
};

const nickCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['nickname', 'pseudo'],
  permissions: ['ManageNicknames'],
  botPermissions: ['ManageNicknames'],
  data: new SlashCommandBuilder()
    .setName('nick')
    .setDescription('Change le pseudonyme d’un membre (vide = réinitialiser).')
    .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true))
    .addStringOption((option) => option.setName('pseudo').setDescription('Nouveau pseudonyme (max 32 caractères)').setMaxLength(32))
    .addStringOption((option) => option.setName('raison').setDescription('Raison du changement')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageNicknames'], ['ManageNicknames']))) return;
    const member = await ctx.fetchMember('membre');
    if (!member) return ctx.replyError('Membre introuvable sur ce serveur.');
    if (!(await assertHierarchy(ctx, member, { action: 'renommer' }))) return;
    if (!member.manageable) return ctx.replyError('Je ne peux pas modifier le pseudonyme de ce membre (hiérarchie).');

    const nickname = ctx.getString('pseudo')?.trim() || null;
    const reason = ctx.getString('raison')?.trim() || 'Aucune raison fournie';
    const ok = await member.setNickname(nickname, `${reason} — ${ctx.user.tag || ctx.user.username}`).then(() => true).catch(() => false);
    if (!ok) return ctx.replyError('Impossible de modifier le pseudonyme de ce membre.');
    await ctx.reply({
      embeds: [successEmbed(nickname
        ? `Le pseudonyme de ${member} est maintenant **${nickname}**.`
        : `Le pseudonyme de ${member} a été réinitialisé.`)],
    });
  },
};

const raidmodeCommand = {
  category: 'Moderation',
  cooldown: 3,
  aliases: ['raid'],
  permissions: ['ManageGuild'],
  data: new SlashCommandBuilder()
    .setName('raidmode')
    .setDescription('Active ou désactive manuellement le mode anti-raid.')
    .addBooleanOption((option) => option.setName('activer').setDescription('Activer ou désactiver').setRequired(true)),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageGuild'], []))) return;
    const enabled = ctx.getBoolean('activer');
    if (enabled) {
      ctx.guildConfig.raid.activeUntil = Date.now() + 60 * 60 * 1000;
      ctx.guildConfig.raid.joins = [];
      ctx.client.db.save();
      await sendLog(ctx.guild, 'mod', warningEmbed(
        `Le mode anti-raid a été activé manuellement par ${ctx.user} pour **1 heure**.\nLes comptes récents seront expulsés à l’arrivée.`,
        `${EMOJI.warning} Mode anti-raid activé`,
      ));
      return ctx.reply({ embeds: [successEmbed('Le mode anti-raid est actif pour **1 heure**.')] });
    }

    clearRaidMode(ctx.guild.id, ctx.client);
    await sendLog(ctx.guild, 'mod', successEmbed(`Le mode anti-raid a été désactivé par ${ctx.user}.`, '🛡️ Anti-raid désactivé'));
    await ctx.reply({ embeds: [successEmbed('Le mode anti-raid est désactivé.')] });
  },
};

module.exports = [
  banCommand,
  kickCommand,
  softbanCommand,
  timeoutCommand,
  untimeoutCommand,
  warnCommand,
  warningsCommand,
  delwarnCommand,
  clearCommand,
  caseCommand,
  historyCommand,
  banlistCommand,
  unbanCommand,
  nickCommand,
  raidmodeCommand,
];
