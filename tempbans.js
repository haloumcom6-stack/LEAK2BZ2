'use strict';

const { COLORS, EMOJI } = require('./constants');
const { baseEmbed } = require('./embeds');
const { sendLog } = require('./logs');
const { addCase } = require('./cases');
const { discordDate } = require('./utils');

const timers = new Map();
const MAX_TIMEOUT = 2 ** 31 - 1;

function keyFor(guildId, userId) {
  return `${guildId}:${userId}`;
}

async function executeUnban(client, guildId, userId, reason) {
  const key = keyFor(guildId, userId);
  const guild = client.guilds.cache.get(guildId);
  const cfg = client.db.guild(guildId);
  cfg.tempbans = (cfg.tempbans || []).filter((entry) => String(entry.userId) !== String(userId));
  client.db.save();
  timers.delete(key);

  if (!guild) return;
  const removed = await guild.bans.remove(userId, reason || 'Bannissement temporaire terminé').then(() => true).catch(() => false);
  if (!removed) return;

  const entry = addCase(client.db, guildId, {
    type: 'unban',
    userId: String(userId),
    moderatorId: client.user.id,
    reason: 'Bannissement temporaire terminé',
  });

  await sendLog(guild, 'mod', baseEmbed({
    color: COLORS.success,
    title: `${EMOJI.unlock} Bannissement temporaire terminé`,
    fields: [
      { name: 'Utilisateur', value: `<@${userId}> (${userId})`, inline: true },
      { name: 'Dossier', value: `#${entry.id}`, inline: true },
    ],
    footer: 'Modération',
  }));
}

function schedule(client, guildId, userId, unbanAt, reason = null) {
  const key = keyFor(guildId, userId);
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);

  const delay = unbanAt - Date.now();
  if (delay <= 0) {
    executeUnban(client, guildId, userId, reason).catch((error) => console.error('[TEMPBAN]', error));
    return;
  }

  if (delay > MAX_TIMEOUT) {
    const timer = setTimeout(() => schedule(client, guildId, userId, unbanAt, reason), MAX_TIMEOUT);
    timer.unref?.();
    timers.set(key, timer);
    return;
  }

  const timer = setTimeout(() => {
    executeUnban(client, guildId, userId, reason).catch((error) => console.error('[TEMPBAN]', error));
  }, delay);
  timer.unref?.();
  timers.set(key, timer);
}

function addTempban(client, guildId, userId, unbanAt, reason = null) {
  const cfg = client.db.guild(guildId);
  cfg.tempbans = (cfg.tempbans || []).filter((entry) => String(entry.userId) !== String(userId));
  cfg.tempbans.push({ userId: String(userId), unbanAt, reason });
  client.db.save();
  schedule(client, guildId, userId, unbanAt, reason);
}

function cancelTempban(client, guildId, userId) {
  const key = keyFor(guildId, userId);
  const timer = timers.get(key);
  if (timer) clearTimeout(timer);
  timers.delete(key);
  const cfg = client.db.guild(guildId);
  cfg.tempbans = (cfg.tempbans || []).filter((entry) => String(entry.userId) !== String(userId));
  client.db.save();
}

function getTempbans(client, guildId) {
  return client.db.guild(guildId).tempbans || [];
}

async function restoreTempbans(client) {
  let count = 0;
  for (const guild of client.guilds.cache.values()) {
    const cfg = client.db.guild(guild.id);
    for (const entry of cfg.tempbans || []) {
      schedule(client, guild.id, entry.userId, entry.unbanAt, entry.reason);
      count += 1;
    }
  }
  if (count > 0) console.log(`[TEMPBAN] ${count} bannissement(s) temporaire(s) restauré(s).`);
}

async function tempbanInfo(guildId, userId, unbanAt) {
  return `${discordDate(unbanAt)} (dans ${discordDate(unbanAt, 'R')})`;
}

module.exports = {
  addTempban,
  cancelTempban,
  restoreTempbans,
  getTempbans,
  tempbanInfo,
};
