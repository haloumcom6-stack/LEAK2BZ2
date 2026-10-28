'use strict';

const { Events } = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed } = require('../core/embeds');
const { sendLog } = require('../core/logs');
const { discordDate, truncate } = require('../core/utils');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldSource, newSource) {
    const oldMember = oldSource.partial
      ? await oldSource.fetch().catch(() => oldSource)
      : oldSource;
    const newMember = newSource.partial
      ? await newSource.fetch().catch(() => newSource)
      : newSource;
    if (!newMember.guild || !newMember.user) return;

    const lines = [];
    if (oldMember.nickname !== newMember.nickname) {
      lines.push(`**Pseudonyme :** ${oldMember.nickname || '`aucun`'} ➜ ${newMember.nickname || '`aucun`'}`);
    }

    const added = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
    const removed = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));
    if (added.size) lines.push(`**Rôles ajoutés :** ${added.map((role) => role.toString()).join(', ')}`);
    if (removed.size) lines.push(`**Rôles retirés :** ${removed.map((role) => role.toString()).join(', ')}`);

    if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
      lines.push(newMember.communicationDisabledUntilTimestamp
        ? `**Timeout :** jusqu’à ${discordDate(newMember.communicationDisabledUntilTimestamp, 'f')}`
        : '**Timeout :** retiré');
    }

    if (oldMember.premiumSinceTimestamp !== newMember.premiumSinceTimestamp) {
      lines.push(newMember.premiumSinceTimestamp ? '**Boost :** a commencé à booster le serveur' : '**Boost :** a arrêté de booster');
    }

    if (!lines.length) return;

    const embed = baseEmbed({
      color: COLORS.primary,
      title: `${EMOJI.user} Membre mis à jour`,
      description: `${newMember} (\`${newMember.id}\`)`,
      fields: [{ name: 'Changements', value: truncate(lines.join('\n'), 1024), inline: false }],
      thumbnail: newMember.user.displayAvatarURL({ size: 128 }),
      footer: 'Membres',
    });
    await sendLog(newMember.guild, 'members', embed);
  },
};
