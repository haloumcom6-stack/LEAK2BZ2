'use strict';

const { matchesReaction } = require('./reactionroles');

/**
 * Ajoute ou retire les rôles-réactions correspondant à une réaction.
 */
async function handleReaction(sourceReaction, user, add) {
  if (!user || user.bot) return 0;

  const reaction = sourceReaction.partial
    ? await sourceReaction.fetch().catch(() => null)
    : sourceReaction;
  if (!reaction) return 0;

  let message = reaction.message;
  if (!message) return 0;
  if (message.partial) {
    message = await message.fetch().catch(() => null);
  }
  if (!message?.guild) return 0;

  const client = reaction.client;
  const cfg = client.db.guild(message.guild.id);
  const entries = cfg.reactionRoles.filter((entry) =>
    entry.messageId === message.id && matchesReaction(entry.emoji, reaction.emoji));
  if (!entries.length) return 0;

  let member = message.guild.members.cache.get(user.id);
  if (!member) member = await message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return 0;

  let changed = 0;
  for (const entry of entries) {
    const role = message.guild.roles.cache.get(entry.roleId);
    if (!role) continue;
    const hasRole = member.roles.cache.has(role.id);
    if (add && !hasRole) {
      const ok = await member.roles.add(role, 'Rôle-réaction').then(() => true).catch(() => false);
      if (ok) changed += 1;
    } else if (!add && hasRole) {
      const ok = await member.roles.remove(role, 'Rôle-réaction').then(() => true).catch(() => false);
      if (ok) changed += 1;
    }
  }
  return changed;
}

module.exports = { handleReaction };
