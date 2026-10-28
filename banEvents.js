'use strict';

const { Events } = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed } = require('../core/embeds');
const { sendLog } = require('../core/logs');

function hadRecentCase(cfg, userId, types, windowMs = 15_000) {
  const now = Date.now();
  return cfg.cases.slice(-15).some((entry) =>
    entry.userId === userId
    && types.includes(entry.type)
    && now - entry.at < windowMs);
}

module.exports = [
  {
    name: Events.GuildBanAdd,
    async execute(ban) {
      const cfg = ban.guild.client.db.guild(ban.guild.id);
      if (hadRecentCase(cfg, ban.user.id, ['ban', 'tempban', 'softban'])) return;
      const embed = baseEmbed({
        color: COLORS.error,
        title: `${EMOJI.ban} Membre banni`,
        description: `${ban.user.tag || ban.user.username} (\`${ban.user.id}\`)`,
        fields: [{ name: 'Raison', value: ban.reason || 'Aucune raison fournie', inline: false }],
        thumbnail: ban.user.displayAvatarURL({ size: 256 }),
        footer: 'Modération',
      });
      await sendLog(ban.guild, 'mod', embed);
    },
  },
  {
    name: Events.GuildBanRemove,
    async execute(ban) {
      const cfg = ban.guild.client.db.guild(ban.guild.id);
      if (hadRecentCase(cfg, ban.user.id, ['unban'])) return;
      const embed = baseEmbed({
        color: COLORS.success,
        title: `${EMOJI.unlock} Membre débanni`,
        description: `${ban.user.tag || ban.user.username} (\`${ban.user.id}\`)`,
        fields: [{ name: 'Raison', value: ban.reason || 'Aucune raison fournie', inline: false }],
        thumbnail: ban.user.displayAvatarURL({ size: 256 }),
        footer: 'Modération',
      });
      await sendLog(ban.guild, 'mod', embed);
    },
  },
];
