'use strict';

/**
 * Vérifie et met à jour le cooldown d'une commande.
 * @returns {number} temps restant en ms (0 si la commande peut être exécutée)
 */
function checkCooldown(client, userId, command) {
  if ((client.config.ownerIds || []).includes(String(userId))) return 0;
  const name = command.data.toJSON().name;
  const key = `${userId}:${name}`;
  const now = Date.now();
  const expiresAt = client.cooldowns.get(key) || 0;
  if (expiresAt > now) return expiresAt - now;

  client.cooldowns.set(key, now + Math.max(1, command.cooldown || 3) * 1000);
  if (client.cooldowns.size > 5000) {
    for (const [entryKey, expiry] of client.cooldowns) {
      if (expiry <= now) client.cooldowns.delete(entryKey);
    }
  }
  return 0;
}

module.exports = { checkCooldown };
