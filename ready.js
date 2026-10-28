'use strict';

const { Events, ActivityType } = require('discord.js');
const { BOT_NAME } = require('../core/constants');
const { restoreTempbans } = require('../core/tempbans');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log('');
    console.log('══════════════════════════════════════════════');
    console.log(`  ${BOT_NAME}`);
    console.log(`  Connecté en tant que ${client.user.tag}`);
    console.log(`  ${client.guilds.cache.size} serveur(s) • ${client.commands.size} commande(s)`);
    console.log('══════════════════════════════════════════════');
    console.log('');

    const updatePresence = () => {
      const statuses = [
        { name: `${client.guilds.cache.size} serveurs • /help`, type: ActivityType.Watching },
        { name: 'la modération 🛡️', type: ActivityType.Watching },
        { name: 'les giveaways 🎉', type: ActivityType.Watching },
        { name: `avec ${client.commands.size} commandes`, type: ActivityType.Playing },
      ];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      client.user.setPresence({ activities: [status], status: 'online' });
    };
    updatePresence();
    const interval = setInterval(updatePresence, 30_000);
    interval.unref?.();
    client.presenceInterval = interval;

    await client.giveaways.restore();
    await restoreTempbans(client);

    console.log('[BOT] Prêt !');
  },
};
