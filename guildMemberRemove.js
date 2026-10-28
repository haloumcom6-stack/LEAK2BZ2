'use strict';

const { Events } = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed } = require('../core/embeds');
const { sendLog } = require('../core/logs');
const { sendGreeting } = require('../core/greetings');
const { discordDate, truncate } = require('../core/utils');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(source) {
    const member = source.partial
      ? await source.fetch().catch(() => source)
      : source;
    if (!member.guild) return;
    const client = member.client;
    const user = member.user;
    if (!user) return;

    await sendGreeting(client, {
      guild: member.guild,
      user,
      member,
      kind: 'goodbye',
    }).catch(() => null);

    const roles = member.roles?.cache
      ? [...member.roles.cache.values()].filter((role) => role.id !== member.guild.id)
      : [];

    const embed = baseEmbed({
      color: COLORS.error,
      title: `${EMOJI.wave} ${user.bot ? 'Bot retiré' : 'Membre parti'}`,
      description: `${user.tag || user.username} (\`${user.id}\`)`,
      thumbnail: user.displayAvatarURL({ size: 256 }),
      fields: [
        { name: 'Avait rejoint', value: member.joinedTimestamp ? discordDate(member.joinedTimestamp, 'R') : 'inconnu', inline: true },
        { name: 'Membres restants', value: `**${member.guild.memberCount}**`, inline: true },
        { name: 'Rôles', value: roles.length ? truncate(roles.map((role) => role.toString()).join(', '), 1024) : '`aucun`', inline: false },
      ],
      footer: 'Départs',
    });
    await sendLog(member.guild, 'members', embed);
  },
};
