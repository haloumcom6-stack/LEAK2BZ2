'use strict';

const { EmbedBuilder } = require('discord.js');
const { BOT_NAME, COLORS, EMOJI } = require('./constants');
const { truncate, formatDuration } = require('./utils');

/**
 * Embed de base avec la couleur, le pied de page et l'horodatage du bot.
 * @param {{color?: number, title?: string, description?: string, fields?: object[], thumbnail?: string, image?: string, author?: object, footer?: string, timestamp?: boolean}} options
 */
function baseEmbed(options = {}) {
  const embed = new EmbedBuilder()
    .setColor(options.color ?? COLORS.primary)
    .setFooter({ text: options.footer ? `${options.footer} • ${BOT_NAME}` : BOT_NAME });
  if (options.title) embed.setTitle(truncate(options.title, 256));
  if (options.description) embed.setDescription(truncate(options.description, 4096));
  if (Array.isArray(options.fields) && options.fields.length) {
    embed.addFields(options.fields.slice(0, 25).map((field) => ({
      name: truncate(field.name, 256),
      value: truncate(field.value, 1024) || '—',
      inline: Boolean(field.inline),
    })));
  }
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.image) embed.setImage(options.image);
  if (options.author) embed.setAuthor(options.author);
  if (options.timestamp !== false) embed.setTimestamp();
  return embed;
}

function successEmbed(description, title = `${EMOJI.success} Succès`) {
  return baseEmbed({ color: COLORS.success, title, description });
}

function errorEmbed(description, title = `${EMOJI.error} Erreur`) {
  return baseEmbed({ color: COLORS.error, title, description });
}

function warningEmbed(description, title = `${EMOJI.warning} Attention`) {
  return baseEmbed({ color: COLORS.warning, title, description });
}

function infoEmbed(description, title = `${EMOJI.info} Information`) {
  return baseEmbed({ color: COLORS.primary, title, description });
}

function logEmbed(title, description, color = COLORS.primary) {
  return baseEmbed({ color, title, description });
}

/**
 * Embed de sanction pour les logs de modération.
 */
function modEmbed({ action, target, moderator, reason, caseId, duration, color = COLORS.moderation, extra }) {
  const fields = [
    { name: 'Cible', value: target ? `${target.tag || target.username || target} (${target.id || target})` : 'Inconnue', inline: true },
    { name: 'Modérateur', value: moderator ? `${moderator.tag || moderator.username || moderator} (${moderator.id || moderator})` : 'Inconnu', inline: true },
    { name: 'Raison', value: reason || 'Aucune raison fournie', inline: false },
  ];
  if (duration) fields.push({ name: 'Durée', value: formatDuration(duration, { long: true }), inline: true });
  if (caseId) fields.push({ name: 'Dossier', value: `#${caseId}`, inline: true });
  if (extra) fields.push({ name: 'Détails', value: extra, inline: false });
  return baseEmbed({
    color,
    title: `${EMOJI.shield} ${action}`,
    fields,
  });
}

function yesNo(value) {
  return value ? `${EMOJI.success} Activé` : `${EMOJI.error} Désactivé`;
}

module.exports = {
  baseEmbed,
  successEmbed,
  errorEmbed,
  warningEmbed,
  infoEmbed,
  logEmbed,
  modEmbed,
  yesNo,
};
