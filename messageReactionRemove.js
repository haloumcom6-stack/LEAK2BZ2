'use strict';

const { Events } = require('discord.js');
const { handleReaction } = require('../core/reactionHandler');

module.exports = {
  name: Events.MessageReactionRemove,
  async execute(reaction, user) {
    await handleReaction(reaction, user, false);
  },
};
