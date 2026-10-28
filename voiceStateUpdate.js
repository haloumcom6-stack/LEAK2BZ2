'use strict';

const { Events } = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed } = require('../core/embeds');
const { sendLog } = require('../core/logs');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const lines = [];
    if (!oldState.channelId && newState.channelId) {
      lines.push(`🔊 A rejoint <#${newState.channelId}>`);
    } else if (oldState.channelId && !newState.channelId) {
      lines.push(`🔇 A quitté <#${oldState.channelId}>`);
    } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      lines.push(`➡️ Déplacé de <#${oldState.channelId}> vers <#${newState.channelId}>`);
    }

    if (oldState.serverMute !== newState.serverMute) lines.push(newState.serverMute ? '🔇 Serveur mute' : '🔊 Serveur unmute');
    if (oldState.serverDeaf !== newState.serverDeaf) lines.push(newState.serverDeaf ? '🙉 Serveur deaf' : '👂 Serveur undeaf');
    if (oldState.selfMute !== newState.selfMute) lines.push(newState.selfMute ? '🎤 Micro coupé' : '🎤 Micro activé');
    if (oldState.selfDeaf !== newState.selfDeaf) lines.push(newState.selfDeaf ? '🎧 Casque coupé' : '🎧 Casque activé');
    if (oldState.streaming !== newState.streaming) lines.push(newState.streaming ? '📺 En stream' : '📺 Stream arrêté');
    if (oldState.selfVideo !== newState.selfVideo) lines.push(newState.selfVideo ? '📷 Caméra activée' : '📷 Caméra désactivée');

    if (!lines.length) return;

    const embed = baseEmbed({
      color: COLORS.primary,
      title: `${EMOJI.info} Vocal`,
      description: `${member} (\`${member.id}\`)\n${lines.map((line) => `> ${line}`).join('\n')}`,
      footer: 'Vocal',
    });
    await sendLog(newState.guild, 'voice', embed);
  },
};
