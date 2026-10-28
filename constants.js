'use strict';

/**
 * Nom affiché du bot, utilisé dans les embeds, les logs et l'activité.
 * Le nom demandé est conservé à l'identique (caractères Unicode inclus).
 */
const BOT_NAME = '[! 𝘨𝘦𝘴𝘵𝘪𝘰𝘯 ] L2B🎃';

const COLORS = Object.freeze({
  primary: 0x5865f2,
  success: 0x57f287,
  error: 0xed4245,
  warning: 0xfee75c,
  info: 0x3ba55d,
  neutral: 0x2b2d31,
  dark: 0x1e1f22,
  giveaway: 0xeb459e,
  ticket: 0xfaa61a,
  level: 0x9b59b6,
  moderation: 0xe67e22,
});

const EMOJI = Object.freeze({
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  ban: '🔨',
  kick: '👢',
  timeout: '⏳',
  warn: '⚠️',
  trash: '🗑️',
  lock: '🔒',
  unlock: '🔓',
  giveaway: '🎉',
  ticket: '🎫',
  level: '📈',
  crown: '👑',
  sparkles: '✨',
  arrow: '➜',
  shield: '🛡️',
  settings: '⚙️',
  link: '🔗',
  wave: '👋',
  user: '👤',
  server: '🏠',
  bot: '🤖',
  clock: '🕒',
  check: '☑️',
  cross: '✖️',
});

const CATEGORY_META = Object.freeze({
  Moderation: { label: 'Modération', emoji: '🛡️', description: 'Sanctions, gestion des messages et des salons.' },
  Configuration: { label: 'Configuration', emoji: '⚙️', description: 'Personnalise le bot sur ton serveur.' },
  Giveaways: { label: 'Giveaways', emoji: '🎉', description: 'Organise et gère des concours.' },
  Utility: { label: 'Utilitaires', emoji: '🧰', description: 'Infos serveur, membre, bot et aide.' },
  Levels: { label: 'Niveaux', emoji: '📈', description: 'Système d’XP et de récompenses.' },
  Tickets: { label: 'Tickets', emoji: '🎫', description: 'Support privé avec transcripts.' },
  Roles: { label: 'Rôles', emoji: '🎭', description: 'Rôles-réactions et rôles automatiques.' },
  Fun: { label: 'Fun', emoji: '🎲', description: 'Jeux et commandes amusantes.' },
  Announcements: { label: 'Annonces', emoji: '📢', description: 'Annonces, messages et sondages.' },
});

module.exports = { BOT_NAME, COLORS, EMOJI, CATEGORY_META };
