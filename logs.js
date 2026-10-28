'use strict';

const { PermissionFlagsBits } = require('discord.js');

const REQUIRED_LOG_PERMS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];

/**
 * Envoie un embed dans le salon de logs configuré pour un type donné.
 * Si le type n'est pas configuré, utilise le salon "all".
 * @param {import('discord.js').Guild} guild
 * @param {'mod'|'messages'|'members'|'voice'|'server'|'tickets'} type
 * @param {import('discord.js').EmbedBuilder} embed
 * @param {{ files?: any[], content?: string, allowedMentions?: object }} [extra]
 */
async function sendLog(guild, type, embed, extra = {}) {
  if (!guild) return null;
  const cfg = guild.client.db?.guild(guild.id);
  if (!cfg) return null;
  const channelId = (type === 'tickets' && cfg.tickets?.logChannelId)
    || cfg.logs[type]
    || cfg.logs.all;
  if (!channelId) return null;

  const channel = guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return null;

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) return null;
  const permissions = channel.permissionsFor(me);
  if (!permissions || !REQUIRED_LOG_PERMS.every((perm) => permissions.has(perm))) return null;

  try {
    return await channel.send({
      content: extra.content || undefined,
      embeds: embed ? [embed] : [],
      files: extra.files || [],
      allowedMentions: extra.allowedMentions || { parse: [] },
    });
  } catch (error) {
    console.error(`[LOGS] Échec d'envoi (${type}) sur ${guild.id}:`, error.message);
    return null;
  }
}

/** Vérifie que le bot peut envoyer des embeds dans un salon. */
function canSendEmbeds(channel, me) {
  const permissions = channel?.permissionsFor?.(me);
  return Boolean(permissions?.has(REQUIRED_LOG_PERMS));
}

module.exports = { sendLog, canSendEmbeds, REQUIRED_LOG_PERMS };
