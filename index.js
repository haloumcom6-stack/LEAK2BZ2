'use strict';

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./core/config');
const { BOT_NAME } = require('./core/constants');
const { Database } = require('./core/db');
const { GiveawayManager } = require('./core/giveaways');
const { registerCommands } = require('./handlers/commands');
const { registerEvents } = require('./handlers/events');

if (!config.token) {
  console.error('');
  console.error('❌ DISCORD_TOKEN est introuvable.');
  console.error('   Copie `.env.example` en `.env` puis renseigne ton token.');
  console.error('   Guide : https://discord.com/developers/applications');
  console.error('');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.Message,
    Partials.Reaction,
    Partials.User,
  ],
  allowedMentions: { parse: ['users', 'roles'] },
});

client.config = config;
client.db = new Database(config.dbPath);
client.snipes = new Map();

const commandCount = registerCommands(client);
client.giveaways = new GiveawayManager(client, client.db);
const eventCount = registerEvents(client);

console.log(`[CHARGEMENT] ${commandCount} commande(s) et ${eventCount} gestionnaire(s) d’événements chargés.`);

process.on('unhandledRejection', (reason) => {
  console.error('[PROMESSE] Rejet non géré :', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[EXCEPTION] Erreur non gérée :', error);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[SORTIE] Signal ${signal} reçu, sauvegarde et déconnexion…`);
  try {
    client.user?.setPresence({ status: 'invisible' });
    if (client.presenceInterval) clearInterval(client.presenceInterval);
    await client.destroy();
  } catch {
    /* ignore */
  } finally {
    client.db.flush();
    console.log('[SORTIE] Base de données sauvegardée. À bientôt !');
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(config.token).catch((error) => {
  console.error('');
  console.error(`❌ Connexion impossible : ${error.message}`);
  console.error('   Vérifie que le token est valide et que les intents privilégiés');
  console.error('   « Message Content » et « Server Members » sont activés dans le portail.');
  console.error('');
  client.db.flush();
  process.exit(1);
});

module.exports = client;
