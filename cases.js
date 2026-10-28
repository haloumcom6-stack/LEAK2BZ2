'use strict';

const CASE_TYPES = Object.freeze({
  ban: { label: 'Bannissement', emoji: '🔨' },
  tempban: { label: 'Bannissement temporaire', emoji: '⏳' },
  unban: { label: 'Débannissement', emoji: '🔓' },
  kick: { label: 'Expulsion', emoji: '👢' },
  timeout: { label: 'Exclusion temporaire', emoji: '⏳' },
  untimeout: { label: 'Fin d’exclusion', emoji: '🔓' },
  warn: { label: 'Avertissement', emoji: '⚠️' },
  softban: { label: 'Softban', emoji: '🧹' },
  automod: { label: 'Automod', emoji: '🛡️' },
  raid: { label: 'Anti-raid', emoji: '🚨' },
  ticket: { label: 'Ticket', emoji: '🎫' },
});

/**
 * Ajoute un dossier de modération au serveur.
 */
function addCase(db, guildId, data) {
  const cfg = db.guild(guildId);
  cfg.caseCounter = (cfg.caseCounter || 0) + 1;
  const entry = {
    id: cfg.caseCounter,
    type: data.type || 'warn',
    userId: data.userId || null,
    moderatorId: data.moderatorId || null,
    reason: data.reason || 'Aucune raison fournie',
    at: Date.now(),
    duration: data.duration || null,
  };
  cfg.cases.push(entry);
  if (cfg.cases.length > 1000) cfg.cases.splice(0, cfg.cases.length - 1000);
  db.save();
  return entry;
}

function getCasesForUser(cfg, userId) {
  return cfg.cases.filter((entry) => entry.userId === String(userId));
}

function getWarnings(cfg, userId) {
  return getCasesForUser(cfg, userId).filter((entry) => entry.type === 'warn');
}

function getCase(cfg, caseId) {
  return cfg.cases.find((entry) => entry.id === Number(caseId)) || null;
}

function removeCase(cfg, caseId) {
  const index = cfg.cases.findIndex((entry) => entry.id === Number(caseId));
  if (index === -1) return null;
  return cfg.cases.splice(index, 1)[0];
}

function caseTypeLabel(type) {
  return CASE_TYPES[type]?.label || type;
}

function caseTypeEmoji(type) {
  return CASE_TYPES[type]?.emoji || '📁';
}

module.exports = {
  CASE_TYPES,
  addCase,
  getCasesForUser,
  getWarnings,
  getCase,
  removeCase,
  caseTypeLabel,
  caseTypeEmoji,
};
