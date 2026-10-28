'use strict';

const { Events, MessageFlags } = require('discord.js');
const { createSlashContext } = require('../core/context');
const { checkCooldown } = require('../core/cooldown');
const { errorEmbed } = require('../core/embeds');
const { isBotOwner } = require('../core/guard');
const { renderHome, renderCategory } = require('../core/help');
const { formatDuration, truncate } = require('../core/utils');
const { openTicket, closeTicket, claimTicket } = require('../core/tickets');
const { handlePollVote } = require('../core/polls');
const { BOT_NAME } = require('../core/constants');

async function replyInternalError(interaction, error, commandName) {
  console.error(`[INTERACTION] /${commandName || interaction.customId} :`, error);
  const payload = {
    embeds: [errorEmbed(
      `Une erreur est survenue pendant l’exécution de cette commande.\n\`\`\`${truncate(error.message || String(error), 800)}\`\`\``,
      '❌ Erreur interne',
    )],
    ephemeral: true,
  };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => null);
  } else {
    await interaction.reply(payload).catch(() => null);
  }
}

async function handleGiveawayButton(interaction) {
  const [, action, id] = interaction.customId.split(':');
  const giveaway = interaction.client.giveaways.get(id);
  if (!giveaway) {
    return interaction.reply({ content: '❌ Ce giveaway n’existe plus.', ephemeral: true });
  }
  const result = await interaction.client.giveaways.toggleEntry(interaction, giveaway, action === 'join' ? 'join' : 'leave');
  return interaction.reply({
    content: `${result.ok ? '✅' : '❌'} ${result.message}`,
    ephemeral: true,
  });
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const client = interaction.client;

    try {
      if (interaction.isChatInputCommand()) {
        if (!interaction.inGuild()) {
          return interaction.reply({ content: '❌ Ce bot fonctionne uniquement sur un serveur.', ephemeral: true });
        }
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          return interaction.reply({ content: '❌ Commande inconnue. Redéploie les commandes avec `npm run deploy`.', ephemeral: true });
        }
        if (command.ownerOnly && !isBotOwner(client, interaction.user.id)) {
          return interaction.reply({ content: '❌ Cette commande est réservée au propriétaire du bot.', ephemeral: true });
        }

        const remaining = checkCooldown(client, interaction.user.id, command);
        if (remaining > 0) {
          return interaction.reply({
            embeds: [errorEmbed(`Patiente encore **${formatDuration(remaining)}** avant de réutiliser cette commande.`, '⏳ Cooldown')],
            ephemeral: true,
          });
        }

        if (!interaction.guild.members.cache.has(interaction.user.id)) {
          await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        }

        const ctx = createSlashContext(client, command, interaction);
        try {
          await command.execute(ctx);
        } catch (error) {
          await replyInternalError(interaction, error, interaction.commandName);
        }
        return;
      }

      if (interaction.isButton()) {
        if (interaction.customId.startsWith('giveaway:join:') || interaction.customId.startsWith('giveaway:leave:')) {
          return handleGiveawayButton(interaction).catch((error) => replyInternalError(interaction, error, interaction.customId));
        }
        if (interaction.customId === 'ticket:open') {
          return openTicket(interaction).catch((error) => replyInternalError(interaction, error, interaction.customId));
        }
        if (interaction.customId === 'ticket:close') {
          return closeTicket(interaction).catch((error) => replyInternalError(interaction, error, interaction.customId));
        }
        if (interaction.customId === 'ticket:claim') {
          return claimTicket(interaction).catch((error) => replyInternalError(interaction, error, interaction.customId));
        }
        if (interaction.customId.startsWith('poll:vote:')) {
          return handlePollVote(interaction).catch((error) => replyInternalError(interaction, error, interaction.customId));
        }
        if (interaction.customId === 'help:home') {
          const prefix = interaction.guild ? client.db.guild(interaction.guild.id).prefix || client.config.defaultPrefix : client.config.defaultPrefix;
          return interaction.update(renderHome(client, prefix)).catch(() => null);
        }
        return;
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'help:category') {
        const key = interaction.values[0];
        const prefix = interaction.guild ? client.db.guild(interaction.guild.id).prefix || client.config.defaultPrefix : client.config.defaultPrefix;
        return interaction.update(renderCategory(client, key, prefix)).catch(() => null);
      }

      if (interaction.isAutocomplete()) {
        return;
      }
    } catch (error) {
      console.error(`[INTERACTION] ${BOT_NAME} :`, error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed(`Une erreur inattendue est survenue.\n\`\`\`${truncate(error.message || String(error), 800)}\`\`\``)],
          ephemeral: true,
        }).catch(() => null);
      }
    }
  },
};
