'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');
const { CATEGORY_META } = require('../core/constants');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

/**
 * Charge tous les modules de commandes et valide leur structure.
 * @returns {object[]}
 */
function collectCommandModules() {
  if (!fs.existsSync(COMMANDS_DIR)) return [];
  const commands = [];
  const files = fs.readdirSync(COMMANDS_DIR).filter((file) => file.endsWith('.js')).sort();

  for (const file of files) {
    const fullPath = path.join(COMMANDS_DIR, file);
    let exported;
    try {
      exported = require(fullPath);
    } catch (error) {
      throw new Error(`Impossible de charger ${file} : ${error.stack || error.message}`);
    }
    const list = Array.isArray(exported) ? exported : [exported];
    for (const command of list) {
      if (!command || typeof command !== 'object') {
        throw new Error(`${file} exporte une commande invalide.`);
      }
      if (!command.data || typeof command.data.toJSON !== 'function') {
        throw new Error(`${file} : la propriété "data" doit être un SlashCommandBuilder.`);
      }
      if (typeof command.execute !== 'function') {
        throw new Error(`${file} : la propriété "execute" doit être une fonction.`);
      }
      if (!CATEGORY_META[command.category]) {
        throw new Error(`${file} : catégorie inconnue "${command.category}".`);
      }
      const json = command.data.toJSON();
      if (!json.name || !json.description) {
        throw new Error(`${file} : la commande doit avoir un nom et une description.`);
      }
      commands.push(command);
    }
  }

  return commands;
}

function registerCommands(client) {
  client.commands = new Collection();
  client.aliases = new Map();
  client.cooldowns = new Collection();

  const modules = collectCommandModules();
  for (const command of modules) {
    const json = command.data.toJSON();
    if (client.commands.has(json.name)) {
      throw new Error(`Commande dupliquée : /${json.name}`);
    }
    client.commands.set(json.name, command);

    for (const alias of command.aliases || []) {
      const normalized = String(alias).toLowerCase();
      if (normalized === json.name) continue;
      if (client.aliases.has(normalized)) {
        console.warn(`[COMMANDES] Alias en conflit ignoré : ${normalized}`);
        continue;
      }
      client.aliases.set(normalized, json.name);
    }
  }
  return modules.length;
}

module.exports = { collectCommandModules, registerCommands, COMMANDS_DIR };
