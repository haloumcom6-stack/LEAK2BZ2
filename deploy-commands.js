'use strict';

const { REST, Routes } = require('discord.js');
const config = require('./core/config');
const { collectCommandModules } = require('./handlers/commands');

if (!config.token || !config.clientId) {
  console.error('');
  console.error('❌ DISCORD_TOKEN et CLIENT_ID sont requis dans le fichier `.env`.');
  console.error('');
  process.exit(1);
}

const modules = collectCommandModules();
const commands = modules.map((command) => command.data.toJSON());
const names = new Set();
for (const command of commands) {
  if (names.has(command.name)) {
    console.error(`❌ Commande dupliquée : /${command.name}`);
    process.exit(1);
  }
  names.add(command.name);
}

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  console.log(`[DÉPLOIEMENT] Envoi de ${commands.length} commande(s)…`);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  const result = await rest.put(route, { body: commands });
  const resultList = Array.isArray(result) ? result : [];
  console.log(`[DÉPLOIEMENT] ✅ ${resultList.length || commands.length} commande(s) déployée(s) ${config.guildId ? `sur le serveur ${config.guildId}` : 'globalement'}.`);
  if (!config.guildId) {
    console.log('[DÉPLOIEMENT] Les commandes globales peuvent mettre jusqu’à 1 heure à apparaître.');
  }
})().catch((error) => {
  console.error('');
  console.error('❌ Échec du déploiement :', error);
  console.error('');
  console.error('Vérifie : token valide, CLIENT_ID correct, et le scope applications.commands.');
  process.exit(1);
});
