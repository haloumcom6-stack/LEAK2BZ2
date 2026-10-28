'use strict';

const { Events } = require('discord.js');
const { handleReaction } = require('../core/reactionHandler');

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    await handleReaction(reaction, user, true);
  },
};
