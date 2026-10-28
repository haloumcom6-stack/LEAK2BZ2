'use strict';

const { Events } = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed } = require('../core/embeds');
const { sendLog } = require('../core/logs');
const { sendGreeting } = require('../core/greetings');
const { handleRaidJoin } = require('../core/automod');
const { discordDate, formatDuration } = require('../core/utils');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    if (!member.guild) return;
    const client = member.client;
    const cfg = client.db.guild(member.guild.id);

    try {
      const kicked = await handleRaidJoin(member, client);
      if (kicked) return;
    } catch (error) {
      console.error('[ANTI-RAID]', error);
    }

    if (!member.user.bot) {
      try {
        const me = member.guild.members.me;
        const roles = cfg.autoroles
          .map((id) => member.guild.roles.cache.get(id))
          .filter((role) => role && !role.managed && (!me || role.position < me.roles.highest.position));
        if (roles.length > 0) {
          await member.roles.add(roles, 'Autorôle').catch((error) => {
            console.error('[AUTOROLE]', error.message);
          });
        }
      } catch (error) {
        console.error('[AUTOROLE]', error);
      }
    }

    await sendGreeting(client, {
      guild: member.guild,
      user: member.user,
      member,
      kind: 'welcome',
    }).catch(() => null);

    const accountAge = Date.now() - member.user.createdTimestamp;
    const embed = baseEmbed({
      color: COLORS.success,
      title: `${EMOJI.user} ${member.user.bot ? 'Bot ajouté' : 'Membre rejoint'}`,
      description: `${member} (\`${member.id}\`)`,
      thumbnail: member.user.displayAvatarURL({ size: 256 }),
      fields: [
        { name: 'Compte créé', value: `${discordDate(member.user.createdTimestamp, 'R')}\n> ${formatDuration(accountAge, { long: true, max: 2 })}`, inline: true },
        { name: 'Membres', value: `**${member.guild.memberCount}**`, inline: true },
        { name: 'Bot', value: member.user.bot ? 'Oui' : 'Non', inline: true },
      ],
      footer: 'Arrivées',
    });
    await sendLog(member.guild, 'members', embed);
  },
};
