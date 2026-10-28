'use strict';

const { Events } = require('discord.js');

module.exports = {
  name: Events.GuildDelete,
  async execute(guild) {
    console.log(`[GUILDE] Retiré de ${guild.name} (${guild.id}).`);
    guild.client.db.save();
  },
};
