'use strict';

const { Events } = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed } = require('../core/embeds');
const { sendLog } = require('../core/logs');
const { runAutomod } = require('../core/automod');
const { truncate } = require('../core/utils');

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldSource, newSource) {
    const before = oldSource.partial
      ? await oldSource.fetch().catch(() => null)
      : oldSource;
    const after = newSource.partial
      ? await newSource.fetch().catch(() => null)
      : newSource;
    if (!before || !after) return;
    if (!after.guild || !after.author || after.author.bot) return;
    if (before.content === after.content) return;

    const embed = baseEmbed({
      color: COLORS.warning,
      title: `${EMOJI.warning} Message modifié`,
      fields: [
        { name: 'Auteur', value: `${after.author.tag || after.author.username} (<@${after.author.id}>)`, inline: true },
        { name: 'Salon', value: `<#${after.channelId}>`, inline: true },
        { name: 'Lien', value: `[Aller au message](${after.url})`, inline: true },
        { name: 'Avant', value: before.content ? truncate(before.content, 1000) : '*inconnu*', inline: false },
        { name: 'Après', value: after.content ? truncate(after.content, 1000) : '*vide*', inline: false },
      ],
      footer: 'Messages',
    });
    await sendLog(after.guild, 'messages', embed);

    // Une édition peut introduire un lien, une invitation ou un mot interdit :
    // on réapplique l'automod sans recompter le message dans l'anti-spam.
    if (after.content) {
      await runAutomod(after, after.client, { skipSpam: true });
    }
  },
};
