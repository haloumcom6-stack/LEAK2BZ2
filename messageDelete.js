'use strict';

const { Events } = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed } = require('../core/embeds');
const { sendLog } = require('../core/logs');
const { truncate } = require('../core/utils');

module.exports = {
  name: Events.MessageDelete,
  async execute(source) {
    const message = source.partial
      ? await source.fetch().catch(() => null)
      : source;
    if (!message?.guild || !message.author || message.author.bot) return;

    const client = message.client;
    if (!client.snipes) client.snipes = new Map();
    client.snipes.set(message.channelId, {
      content: message.content || '',
      authorTag: message.author.tag || message.author.username,
      authorId: message.author.id,
      at: Date.now(),
      attachments: [...message.attachments.values()].map((attachment) => attachment.url),
    });
    if (client.snipes.size > 200) {
      const oldest = client.snipes.keys().next().value;
      client.snipes.delete(oldest);
    }

    const attachments = [...message.attachments.values()];
    const embed = baseEmbed({
      color: COLORS.error,
      title: `${EMOJI.trash} Message supprimé`,
      description: message.content ? truncate(message.content, 3000) : '*Aucun texte (pièce jointe ou embed)*',
      fields: [
        { name: 'Auteur', value: `${message.author.tag || message.author.username} (<@${message.author.id}>)`, inline: true },
        { name: 'Salon', value: `<#${message.channelId}>`, inline: true },
        { name: 'Identifiant', value: `\`${message.id}\``, inline: true },
      ],
      footer: 'Messages',
    });
    if (attachments.length) {
      embed.addFields({ name: 'Pièces jointes', value: attachments.slice(0, 5).map((attachment) => `[${attachment.name}](${attachment.url})`).join('\n'), inline: false });
    }
    await sendLog(message.guild, 'messages', embed);
  },
};
