'use strict';

const { Events } = require('discord.js');

module.exports = [
  {
    name: Events.Error,
    execute(error) {
      console.error('[CLIENT] Erreur :', error);
    },
  },
  {
    name: Events.Warn,
    execute(message) {
      console.warn('[CLIENT] Avertissement :', message);
    },
  },
];
