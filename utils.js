'use strict';

/** Unités acceptées par parseDuration (ordre : toujours les plus longues d'abord). */
const DURATION_UNITS = new Map([
  ['semaines', 7 * 24 * 60 * 60 * 1000],
  ['semaine', 7 * 24 * 60 * 60 * 1000],
  ['sem', 7 * 24 * 60 * 60 * 1000],
  ['jours', 24 * 60 * 60 * 1000],
  ['jour', 24 * 60 * 60 * 1000],
  ['heures', 60 * 60 * 1000],
  ['heure', 60 * 60 * 1000],
  ['minutes', 60 * 1000],
  ['minute', 60 * 1000],
  ['secondes', 1000],
  ['seconde', 1000],
  ['mois', 30 * 24 * 60 * 60 * 1000],
  ['w', 7 * 24 * 60 * 60 * 1000],
  ['j', 24 * 60 * 60 * 1000],
  ['d', 24 * 60 * 60 * 1000],
  ['h', 60 * 60 * 1000],
  ['min', 60 * 1000],
  ['m', 60 * 1000],
  ['sec', 1000],
  ['s', 1000],
]);

const UNIT_KEYS = [...DURATION_UNITS.keys()].sort((a, b) => b.length - a.length);
const UNIT_PATTERN = UNIT_KEYS.join('|');
const DURATION_REGEX = new RegExp(`(\\d+(?:[.,]\\d+)?)(${UNIT_PATTERN})`, 'gi');

/**
 * Convertit une durée lisible en millisecondes.
 * Exemples : "10m", "1h30", "2 jours", "1 j 12 h", "30" (= 30 minutes).
 * @returns {number|null}
 */
function parseDuration(input) {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim().toLowerCase();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const minutes = Number(raw);
    return minutes > 0 ? minutes * 60 * 1000 : null;
  }

  const compact = raw.replace(/\s+/g, '');
  DURATION_REGEX.lastIndex = 0;
  let match;
  let total = 0;
  let consumed = '';
  let lastUnit = null;
  while ((match = DURATION_REGEX.exec(compact)) !== null) {
    const amount = Number(match[1].replace(',', '.'));
    const unitKey = match[2].toLowerCase();
    const unit = DURATION_UNITS.get(unitKey);
    if (!unit || !Number.isFinite(amount)) return null;
    total += amount * unit;
    consumed += match[0];
    lastUnit = unitKey;
  }

  // Compatibilité avec le format court « 1h30 » (= 1 heure 30 minutes).
  if (consumed !== compact && /^(heures?|h)$/.test(lastUnit || '')) {
    const rest = compact.slice(consumed.length);
    const minutes = Number(rest.replace(',', '.'));
    if (/^\d+(?:[.,]\d+)?$/.test(rest) && Number.isFinite(minutes)) {
      total += minutes * 60 * 1000;
      consumed += rest;
    }
  }

  if (!consumed || consumed !== compact || total <= 0) return null;
  if (total > 365 * 24 * 60 * 60 * 1000) return null;
  return Math.round(total);
}

/**
 * Formate une durée en millisecondes.
 * @param {number} ms
 * @param {{ long?: boolean, max?: number }} [options]
 */
function formatDuration(ms, options = {}) {
  const { long = false, max = 4 } = options;
  if (!Number.isFinite(ms) || ms <= 0) return long ? '0 seconde' : '0s';
  const units = [
    [long ? 'jour' : 'j', 24 * 60 * 60 * 1000],
    [long ? 'heure' : 'h', 60 * 60 * 1000],
    [long ? 'minute' : 'm', 60 * 1000],
    [long ? 'seconde' : 's', 1000],
  ];
  let remaining = Math.floor(ms / 1000) * 1000;
  const parts = [];
  for (const [label, value] of units) {
    if (remaining >= value && parts.length < max) {
      const count = Math.floor(remaining / value);
      remaining %= value;
      const finalLabel = long && count > 1 ? `${label}s` : label;
      parts.push(`${count}${long ? ' ' : ''}${finalLabel}`);
    }
  }
  return parts.length ? parts.join(long ? ' et ' : ' ') : (long ? '0 seconde' : '0s');
}

/** Formate une date Discord (<t:...:f>). */
function discordDate(ms, style = 'F') {
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

/** Temps relatif en français. */
function timeAgo(ms) {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'à l’instant';
  return `il y a ${formatDuration(diff, { long: true, max: 2 })}`;
}

function truncate(text, max = 1024) {
  if (!text) return '';
  const str = String(text);
  return str.length > max ? `${str.slice(0, Math.max(0, max - 1))}…` : str;
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeMarkdown(text) {
  return String(text).replace(/([*_`~|\\>])/g, '\\$1');
}

/** Normalise accents, majuscules et caractères invisibles. */
function normalizeText(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase();
}

/** Normalise + convertit le leet speak pour le filtre de gros mots. */
function filterNormalize(text) {
  return normalizeText(text)
    .replace(/[0@]/g, 'o')
    .replace(/[4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!]/g, 'i')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[8]/g, 'b')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Renvoie le premier gros mot trouvé, ou null. */
function findBadWord(content, words) {
  if (!content || !Array.isArray(words) || words.length === 0) return null;
  const padded = ` ${filterNormalize(content)} `;
  if (padded.trim().length === 0) return null;
  for (const word of words) {
    const normalized = filterNormalize(word);
    if (!normalized) continue;
    if (padded.includes(` ${normalized} `)) return word;
  }
  return null;
}

const INVITE_REGEX = /(?:discord\.(?:gg|me)|discordapp\.com\/invite|discord\.com\/invite|dsc\.gg)\/[a-z0-9-_]{2,}/i;

function containsInvite(content) {
  return INVITE_REGEX.test(String(content || ''));
}

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>()"']+|(?<![\w@./])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?:\/[^\s<>()"']*)?/gi;

function extractUrls(content) {
  const str = String(content || '');
  URL_REGEX.lastIndex = 0;
  const matches = str.match(URL_REGEX);
  if (!matches) return [];
  return [...new Set(matches.map((url) => url.replace(/[.,;:!?]+$/, '')))];
}

/** Vérifie si une URL appartient à un domaine autorisé (sous-domaines inclus). */
function isAllowedDomain(rawUrl, allowedDomains) {
  if (!rawUrl) return false;
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) return false;
  let url = String(rawUrl).trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return allowedDomains.some((domain) => {
      const clean = String(domain).toLowerCase().replace(/^www\./, '');
      return hostname === clean || hostname.endsWith(`.${clean}`);
    });
  } catch {
    return false;
  }
}

function looksLikePhishing(content, phishingWords = []) {
  const normalized = normalizeText(content);
  if (normalized.includes('discord.gift/')) return true;
  if (normalized.includes('discordnitro')) return true;
  if (normalized.includes('steamcommunity.com/gift')) return true;
  return phishingWords.some((word) => normalized.includes(normalizeText(word)));
}

/** Valide et renvoie un emoji utilisable dans une réaction. */
function parseEmoji(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^<a?:\w{2,32}:\d{15,22}>$/.test(raw)) return raw;
  if (/^\d{15,22}$/.test(raw)) return raw;
  if (/^\d\uFE0F?\u20E3$/.test(raw)) return raw;
  const match = raw.match(/(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)/u);
  if (match && match[0].length <= 16) return match[0];
  return null;
}

function progressBar(current, total, size = 12, filled = '█', empty = '░') {
  if (total <= 0) return empty.repeat(size);
  const ratio = Math.min(1, Math.max(0, current / total));
  const count = Math.round(ratio * size);
  return filled.repeat(count) + empty.repeat(Math.max(0, size - count));
}

function chunk(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) result.push(array.slice(i, i + size));
  return result;
}

function formatNumber(value) {
  return new Intl.NumberFormat('fr-FR').format(value);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseHexColor(input) {
  if (!input) return null;
  const match = String(input).trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? Number.parseInt(match[1], 16) : null;
}

function isSnowflake(value) {
  return /^\d{15,22}$/.test(String(value || ''));
}

function parseId(input) {
  const match = String(input || '').match(/\d{15,22}/);
  return match ? match[0] : null;
}

function generateId(prefix = '') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeChannelName(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90) || 'ticket';
}

/** Remplace les variables de bienvenue / au revoir. */
function applyPlaceholders(text, { guild, user, member } = {}) {
  if (!text) return '';
  return String(text)
    .replace(/\{user\}/g, user ? `<@${user.id}>` : '')
    .replace(/\{mention\}/g, user ? `<@${user.id}>` : '')
    .replace(/\{username\}/g, user ? user.username : '')
    .replace(/\{tag\}/g, user ? (user.tag || user.username) : '')
    .replace(/\{nickname\}/g, member ? member.displayName : (user ? user.username : ''))
    .replace(/\{server\}/g, guild ? guild.name : '')
    .replace(/\{count\}/g, guild ? String(guild.memberCount) : '0')
    .replace(/\{created\}/g, user ? discordDate(user.createdTimestamp, 'R') : '')
    .replace(/\{id\}/g, user ? user.id : '');
}

function humanUptime(ms) {
  return formatDuration(ms, { long: true, max: 3 });
}

function shorten(text, max = 100) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function unique(array) {
  return [...new Set(array)];
}

function sortByDesc(array, selector) {
  return [...array].sort((a, b) => selector(b) - selector(a));
}

function isImageUrl(url) {
  return /^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(String(url || ''));
}

module.exports = {
  parseDuration,
  formatDuration,
  discordDate,
  timeAgo,
  truncate,
  escapeRegex,
  escapeMarkdown,
  normalizeText,
  filterNormalize,
  findBadWord,
  containsInvite,
  extractUrls,
  isAllowedDomain,
  looksLikePhishing,
  parseEmoji,
  progressBar,
  chunk,
  formatNumber,
  randomInt,
  pick,
  shuffle,
  sleep,
  parseHexColor,
  isSnowflake,
  parseId,
  generateId,
  sanitizeChannelName,
  applyPlaceholders,
  humanUptime,
  shorten,
  unique,
  sortByDesc,
  isImageUrl,
};
