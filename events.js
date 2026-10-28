'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EVENTS_DIR = path.join(__dirname, '..', 'events');

function registerEvents(client) {
  if (!fs.existsSync(EVENTS_DIR)) return 0;
  const files = fs.readdirSync(EVENTS_DIR).filter((file) => file.endsWith('.js')).sort();
  let count = 0;

  for (const file of files) {
    const fullPath = path.join(EVENTS_DIR, file);
    let exported;
    try {
      exported = require(fullPath);
    } catch (error) {
      throw new Error(`Impossible de charger l'événement ${file} : ${error.stack || error.message}`);
    }
    const handlers = Array.isArray(exported) ? exported : [exported];
    for (const handler of handlers) {
      if (!handler?.name || typeof handler.execute !== 'function') {
        throw new Error(`L'événement ${file} est invalide (name/execute requis).`);
      }
      const register = handler.once ? client.once.bind(client) : client.on.bind(client);
      register(handler.name, (...args) => {
        Promise.resolve(handler.execute(...args)).catch((error) => {
          console.error(`[ÉVÉNEMENT] Erreur dans ${handler.name} (${file}) :`, error);
        });
      });
      count += 1;
    }
  }
  return count;
}

module.exports = { registerEvents, EVENTS_DIR };
