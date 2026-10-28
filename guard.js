'use strict';

const { PermissionFlagsBits } = require('discord.js');
const { errorEmbed } = require('./embeds');

const PERMISSION_LABELS = {
  Administrator: 'Administrateur',
  ManageGuild: 'Gérer le serveur',
  ManageRoles: 'Gérer les rôles',
  ManageChannels: 'Gérer les salons',
  ManageMessages: 'Gérer les messages',
  ManageNicknames: 'Gérer les pseudonymes',
  KickMembers: 'Expulser des membres',
  BanMembers: 'Bannir des membres',
  ModerateMembers: 'Gérer les exclusions temporaires',
  ViewChannel: 'Voir les salons',
  SendMessages: 'Envoyer des messages',
  EmbedLinks: 'Intégrer des liens',
  ReadMessageHistory: 'Lire l’historique',
  AttachFiles: 'Joindre des fichiers',
  AddReactions: 'Ajouter des réactions',
  UseExternalEmojis: 'Utiliser des emojis externes',
  ManageWebhooks: 'Gérer les webhooks',
  Connect: 'Se connecter en vocal',
  MoveMembers: 'Déplacer des membres',
  MuteMembers: 'Mettre en sourdine',
  DeafenMembers: 'Rendre sourds',
  CreatePrivateThreads: 'Créer des fils privés',
  SendMessagesInThreads: 'Envoyer dans les fils',
  ManageThreads: 'Gérer les fils',
  MentionEveryone: 'Mentionner @everyone',
  CreateInstantInvite: 'Créer des invitations',
  ManageExpressions: 'Gérer les expressions',
};

function label(perm) {
  return PERMISSION_LABELS[perm] || perm;
}

function isBotOwner(client, userId) {
  return (client.config?.ownerIds || []).includes(String(userId));
}

function hasStaffRole(member, cfg) {
  if (!member || !cfg) return false;
  return (cfg.staff?.roles || []).some((roleId) => member.roles.cache.has(roleId));
}

function isGuildOwner(member) {
  return member?.guild?.ownerId === member?.id;
}

/**
 * Vérifie les permissions utilisateur + bot, avec bypass staff pour la modération.
 * Répond automatiquement en cas d'échec.
 */
async function requirePermissions(ctx, userPerms = [], botPerms = []) {
  if (isBotOwner(ctx.client, ctx.user.id)) return true;

  const cfg = ctx.guild ? ctx.client.db.guild(ctx.guild.id) : null;
  const staffBypass = ctx.command?.category === 'Moderation' && ctx.command?.staffBypass !== false;
  const userAllowedByStaff = staffBypass && hasStaffRole(ctx.member, cfg);

  const missingUser = userPerms.filter((perm) => {
    const flag = PermissionFlagsBits[perm];
    return flag && !ctx.member?.permissions?.has(flag);
  });

  if (missingUser.length > 0 && !userAllowedByStaff && !isGuildOwner(ctx.member)) {
    await ctx.reply({
      embeds: [errorEmbed(
        `Il te manque la permission ${missingUser.map((perm) => `**${label(perm)}**`).join(', ')} pour utiliser cette commande.`,
        'Permissions insuffisantes',
      )],
      ephemeral: true,
    });
    return false;
  }

  const me = ctx.guild?.members?.me;
  const missingBot = botPerms.filter((perm) => {
    const flag = PermissionFlagsBits[perm];
    return flag && !me?.permissions?.has(flag);
  });

  if (missingBot.length > 0) {
    await ctx.reply({
      embeds: [errorEmbed(
        `Je n’ai pas les permissions nécessaires : ${missingBot.map((perm) => `**${label(perm)}**`).join(', ')}.`,
        'Permissions du bot insuffisantes',
      )],
      ephemeral: true,
    });
    return false;
  }

  return true;
}

async function fetchMember(ctx, userOrId) {
  if (!ctx.guild) return null;
  const id = typeof userOrId === 'string' ? userOrId : userOrId?.id;
  if (!id) return null;
  return ctx.guild.members.cache.get(id)
    || await ctx.guild.members.fetch(id).catch(() => null);
}

/**
 * Vérifie la hiérarchie des rôles avant une sanction.
 * @param {import('./context').Context} ctx
 * @param {import('discord.js').GuildMember|import('discord.js').User|null} target
 */
async function assertHierarchy(ctx, target, { action = 'sanctionner' } = {}) {
  if (!target || !ctx.guild) return false;
  const targetId = target.id;
  const targetMember = target.roles ? target : await fetchMember(ctx, targetId);

  if (targetId === ctx.user.id) {
    await ctx.reply({ embeds: [errorEmbed(`Tu ne peux pas ${action} toi-même.`)], ephemeral: true });
    return false;
  }
  if (targetId === ctx.client.user.id) {
    await ctx.reply({ embeds: [errorEmbed(`Je ne peux pas ${action} moi-même.`)], ephemeral: true });
    return false;
  }
  if (targetId === ctx.guild.ownerId) {
    await ctx.reply({ embeds: [errorEmbed(`Tu ne peux pas ${action} le propriétaire du serveur.`)], ephemeral: true });
    return false;
  }

  if (targetMember) {
    const actor = ctx.member;
    const actorIsOwner = ctx.guild.ownerId === ctx.user.id;
    if (!actorIsOwner && targetMember.roles.highest.position >= actor.roles.highest.position) {
      await ctx.reply({
        embeds: [errorEmbed(`Tu ne peux pas ${action} un membre dont le rôle est égal ou supérieur au tien.`)],
        ephemeral: true,
      });
      return false;
    }

    const me = ctx.guild.members.me;
    if (me && targetMember.roles.highest.position >= me.roles.highest.position) {
      await ctx.reply({
        embeds: [errorEmbed(`Mon rôle le plus haut est en dessous de celui de ce membre, je ne peux pas ${action}.`)],
        ephemeral: true,
      });
      return false;
    }
  }

  return true;
}

module.exports = {
  PERMISSION_LABELS,
  label,
  isBotOwner,
  hasStaffRole,
  requirePermissions,
  fetchMember,
  assertHierarchy,
};
