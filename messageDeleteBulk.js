'use strict';

const { Events } = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed } = require('../core/embeds');
const { sendLog } = require('../core/logs');

module.exports = {
  name: Events.MessageBulkDelete,
  async execute(messages, channel) {
    if (!channel.guild) return;
    const authors = [...new Set([...messages.values()].map((message) => message.author?.tag || 'inconnu'))].slice(0, 10);
    const embed = baseEmbed({
      color: COLORS.error,
      title: `${EMOJI.trash} Suppression massive de messages`,
      description: `**${messages.size}** message(s) supprimé(s) dans <#${channel.id}>.`,
      fields: [
        { name: 'Auteurs', value: authors.join(', ') || 'inconnus', inline: false },
      ],
      footer: 'Messages',
    });
    await sendLog(channel.guild, 'messages', embed);
  },
};
