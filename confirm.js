'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS } = require('./constants');
const { baseEmbed } = require('./embeds');

/**
 * Demande une confirmation par boutons avant une action destructrice.
 * @returns {Promise<boolean>}
 */
async function confirmAction(ctx, {
  title = 'Confirmation requise',
  description = 'Es-tu sûr de vouloir effectuer cette action ?',
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = true,
  timeout = 20_000,
} = {}) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('confirm:yes')
      .setLabel(confirmLabel)
      .setStyle(danger ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('confirm:no')
      .setLabel(cancelLabel)
      .setStyle(ButtonStyle.Secondary),
  );

  await ctx.reply({
    embeds: [baseEmbed({
      color: danger ? COLORS.warning : COLORS.primary,
      title: `⚠️ ${title}`,
      description: `${description}\n\n*Cette demande expire dans ${Math.round(timeout / 1000)} secondes.*`,
    })],
    components: [row],
    ephemeral: true,
  });

  let message;
  if (ctx.isSlash) {
    message = await ctx.interaction.fetchReply().catch(() => null);
  } else {
    message = ctx.lastMessage;
  }
  if (!message) return false;

  return new Promise((resolve) => {
    const collector = message.createMessageComponentCollector({
      filter: (interaction) => interaction.user.id === ctx.user.id,
      time: timeout,
      max: 1,
    });

    collector.on('collect', async (interaction) => {
      const confirmed = interaction.customId === 'confirm:yes';
      await interaction.update({
        embeds: [baseEmbed({
          color: confirmed ? COLORS.success : COLORS.neutral,
          title: confirmed ? '✅ Action confirmée' : '❌ Action annulée',
          description: confirmed ? 'Traitement en cours…' : 'Aucune modification n’a été effectuée.',
        })],
        components: [],
      }).catch(() => null);
      resolve(confirmed);
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'time') {
        await message.edit({
          embeds: [baseEmbed({
            color: COLORS.neutral,
            title: '⌛ Délai expiré',
            description: 'Aucune confirmation reçue, action annulée.',
          })],
          components: [],
        }).catch(() => null);
        resolve(false);
      }
    });
  });
}

module.exports = { confirmAction };
