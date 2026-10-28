'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS, EMOJI } = require('./constants');
const { baseEmbed } = require('./embeds');
const { progressBar, truncate } = require('./utils');

const NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

function totalVotes(poll) {
  return poll.options.reduce((total, option) => total + option.votes.length, 0);
}

function buildPollEmbed(poll) {
  const total = totalVotes(poll);
  const lines = [poll.question, ''];
  poll.options.forEach((option, index) => {
    const count = option.votes.length;
    const percent = total ? Math.round((count / total) * 100) : 0;
    lines.push(`${NUMBERS[index] || `**${index + 1}.**`} **${truncate(option.label, 120)}**`);
    lines.push(`> ${progressBar(count, total || 1, 10)} **${count}** vote(s) • **${percent}%**`);
  });
  lines.push('', `**Total :** ${total} vote(s)`);

  return baseEmbed({
    color: COLORS.primary,
    title: `${EMOJI.info} Sondage`,
    description: lines.join('\n'),
    footer: `Sondage de ${poll.authorId ? `un membre` : 'serveur'} • Vote en cliquant sur un bouton`,
  });
}

function buildPollComponents(poll) {
  const row = new ActionRowBuilder();
  poll.options.forEach((option, index) => {
    row.addComponents(new ButtonBuilder()
      .setCustomId(`poll:vote:${poll.messageId}:${index}`)
      .setLabel(`${index + 1}. ${truncate(option.label, 70)}`)
      .setStyle(ButtonStyle.Secondary));
  });
  return [row];
}

async function handlePollVote(interaction) {
  const [, , messageId, indexRaw] = interaction.customId.split(':');
  const index = Number(indexRaw);
  const poll = interaction.client.db.data.polls[messageId];
  if (!poll || !Number.isInteger(index) || index < 0 || index >= poll.options.length) {
    return interaction.reply({ content: '❌ Ce sondage n’existe plus.', ephemeral: true });
  }

  const userId = interaction.user.id;
  const existing = poll.options.findIndex((option) => option.votes.includes(userId));
  if (existing === index) {
    poll.options[index].votes = poll.options[index].votes.filter((id) => id !== userId);
    interaction.client.db.save();
    await interaction.message.edit({ embeds: [buildPollEmbed(poll)] }).catch(() => null);
    return interaction.reply({ content: '🗳️ Ton vote a été retiré.', ephemeral: true });
  }

  if (existing !== -1) {
    poll.options[existing].votes = poll.options[existing].votes.filter((id) => id !== userId);
  }
  poll.options[index].votes.push(userId);
  interaction.client.db.save();
  await interaction.message.edit({ embeds: [buildPollEmbed(poll)] }).catch(() => null);
  return interaction.reply({ content: `✅ Vote enregistré pour **${truncate(poll.options[index].label, 100)}**.`, ephemeral: true });
}

module.exports = { buildPollEmbed, buildPollComponents, handlePollVote, totalVotes };
