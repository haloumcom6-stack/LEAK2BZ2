'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS, EMOJI } = require('./constants');
const { baseEmbed } = require('./embeds');
const { generateId, shuffle, formatDuration, discordDate, truncate } = require('./utils');
const { levelFromXp } = require('./levels');

const MAX_TIMEOUT = 2 ** 31 - 1;

class GiveawayManager {
  constructor(client, db) {
    this.client = client;
    this.db = db;
    this.timers = new Map();
    this.refreshTimers = new Map();
  }

  get data() {
    return this.db.data.giveaways;
  }

  get(id) {
    return this.data[id] || null;
  }

  listForGuild(guildId) {
    return Object.values(this.data)
      .filter((gw) => gw.guildId === guildId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  buildEmbed(gw) {
    const lines = [];
    if (gw.description) lines.push(truncate(gw.description, 1500), '');
    lines.push(`**Fin :** ${gw.ended ? 'Terminé' : discordDate(gw.endAt, 'R')}`);
    lines.push(`**Gagnants :** ${gw.winnersCount}`);
    lines.push(`**Participants :** ${gw.entries.length}`);
    lines.push(`**Organisé par :** <@${gw.hostId}>`);
    if (gw.requirements?.roleId) lines.push(`**Condition :** rôle <@&${gw.requirements.roleId}>`);
    if (gw.requirements?.level) lines.push(`**Condition :** niveau **${gw.requirements.level}** minimum`);
    if (gw.ended) {
      lines.push('');
      lines.push(gw.winners?.length
        ? `**Gagnant${gw.winners.length > 1 ? 's' : ''} :** ${gw.winners.map((id) => `<@${id}>`).join(', ')}`
        : '**Gagnant :** aucun participant');
    }

    return baseEmbed({
      color: gw.ended ? COLORS.neutral : COLORS.giveaway,
      title: `${EMOJI.giveaway} ${gw.prize}`,
      description: lines.join('\n'),
      footer: gw.ended ? 'Giveaway terminé' : `Se termine ${discordDate(gw.endAt, 'R')}`,
      timestamp: false,
    });
  }

  buildComponents(gw) {
    if (gw.ended) return [];
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway:join:${gw.id}`)
        .setLabel('Participer')
        .setEmoji('🎉')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`giveaway:leave:${gw.id}`)
        .setLabel('Quitter')
        .setStyle(ButtonStyle.Secondary),
    );
    return [row];
  }

  async create({ guild, channel, prize, description, winnersCount = 1, durationMs, hostId, roleId = null, level = null }) {
    const now = Date.now();
    const gw = {
      id: generateId('gw_'),
      guildId: guild.id,
      channelId: channel.id,
      messageId: null,
      prize: truncate(prize, 100),
      description: description ? truncate(description, 1500) : null,
      winnersCount: Math.max(1, Math.min(20, winnersCount)),
      endAt: now + durationMs,
      hostId,
      entries: [],
      requirements: { roleId: roleId || null, level: level || null },
      ended: false,
      winners: [],
      createdAt: now,
    };

    const message = await channel.send({
      embeds: [this.buildEmbed(gw)],
      components: this.buildComponents(gw),
      allowedMentions: { parse: [] },
    });
    gw.messageId = message.id;
    this.data[gw.id] = gw;
    this.db.save();
    this.schedule(gw);
    return { gw, message };
  }

  schedule(gw) {
    this.clearTimer(gw.id);
    if (gw.ended) return;
    const delay = gw.endAt - Date.now();
    if (delay <= 0) {
      this.end(gw).catch((error) => console.error('[GIVEAWAY] Échec de fin :', error));
      return;
    }
    if (delay > MAX_TIMEOUT) {
      const timer = setTimeout(() => this.schedule(gw), MAX_TIMEOUT);
      timer.unref?.();
      this.timers.set(gw.id, timer);
      return;
    }
    const timer = setTimeout(() => {
      this.timers.delete(gw.id);
      this.end(gw).catch((error) => console.error('[GIVEAWAY] Échec de fin :', error));
    }, delay);
    timer.unref?.();
    this.timers.set(gw.id, timer);
  }

  clearTimer(id) {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
  }

  refresh(gw) {
    if (this.refreshTimers.has(gw.id)) return;
    const timer = setTimeout(() => {
      this.refreshTimers.delete(gw.id);
      this.updateMessage(gw).catch(() => null);
    }, 4000);
    timer.unref?.();
    this.refreshTimers.set(gw.id, timer);
  }

  async fetchMessage(gw) {
    const channel = this.client.channels.cache.get(gw.channelId)
      || await this.client.channels.fetch(gw.channelId).catch(() => null);
    if (!channel?.isTextBased()) return { channel: null, message: null };
    const message = await channel.messages.fetch(gw.messageId).catch(() => null);
    return { channel, message };
  }

  async updateMessage(gw) {
    const { message } = await this.fetchMessage(gw);
    if (!message) return null;
    return message.edit({
      embeds: [this.buildEmbed(gw)],
      components: this.buildComponents(gw),
      allowedMentions: { parse: [] },
    }).catch(() => null);
  }

  checkRequirements(gw, member) {
    const cfg = this.db.guild(gw.guildId);
    if (gw.requirements?.roleId && !member.roles.cache.has(gw.requirements.roleId)) {
      return `Il te faut le rôle <@&${gw.requirements.roleId}> pour participer.`;
    }
    if (gw.requirements?.level) {
      const data = cfg.levels.users?.[member.id];
      const level = data?.level ?? levelFromXp(data?.xp || 0);
      if (level < gw.requirements.level) {
        return `Il te faut être au niveau **${gw.requirements.level}** minimum (tu es niveau **${level}**).`;
      }
    }
    return null;
  }

  async toggleEntry(interaction, gw, action) {
    if (gw.ended) return { ok: false, message: 'Ce giveaway est terminé.' };
    const member = interaction.member;
    if (!member || member.user.bot) return { ok: false, message: 'Les bots ne peuvent pas participer.' };
    const requirementError = this.checkRequirements(gw, member);
    if (requirementError) return { ok: false, message: requirementError };

    const index = gw.entries.indexOf(member.id);
    if (action === 'join') {
      if (index !== -1) return { ok: false, message: 'Tu participes déjà à ce giveaway !' };
      gw.entries.push(member.id);
      this.db.save();
      this.refresh(gw);
      return { ok: true, message: `Participation enregistrée ! Bonne chance 🍀 **(${gw.entries.length} participant${gw.entries.length > 1 ? 's' : ''})**` };
    }

    if (index === -1) return { ok: false, message: 'Tu ne participes pas à ce giveaway.' };
    gw.entries.splice(index, 1);
    this.db.save();
    this.refresh(gw);
    return { ok: true, message: `Ta participation a été retirée. **(${gw.entries.length} participant${gw.entries.length > 1 ? 's' : ''})**` };
  }

  async pickWinners(gw, exclude = []) {
    const candidates = shuffle(gw.entries.filter((id) => !exclude.includes(id)));
    if (candidates.length === 0) return [];
    const guild = this.client.guilds.cache.get(gw.guildId);
    const winners = [];
    for (const id of candidates) {
      if (winners.length >= gw.winnersCount) break;
      if (guild) {
        const member = guild.members.cache.get(id) || await guild.members.fetch(id).catch(() => null);
        if (!member) continue;
      }
      winners.push(id);
    }
    return winners;
  }

  async end(gw, { announce = true } = {}) {
    if (!gw || gw.ended) return null;
    gw.ended = true;
    this.clearTimer(gw.id);
    gw.winners = await this.pickWinners(gw);
    this.db.save();
    await this.updateMessage(gw);

    if (announce) {
      const { channel } = await this.fetchMessage(gw);
      if (channel?.isTextBased()) {
        const content = gw.winners.length
          ? `🎉 Félicitations ${gw.winners.map((id) => `<@${id}>`).join(', ')} ! Vous gagnez **${gw.prize}** !`
          : `😢 Aucun participant valide pour **${gw.prize}**, il n’y a pas de gagnant.`;
        await channel.send({
          content,
          allowedMentions: { users: gw.winners },
          reply: { messageReference: gw.messageId, failIfNotExists: false },
        }).catch(() => null);
      }
    }
    return gw.winners;
  }

  async reroll(gw) {
    if (!gw.ended) return { ok: false, message: 'Ce giveaway est encore en cours.' };
    if (!gw.entries.length) return { ok: false, message: 'Aucun participant, impossible de retirer au sort.' };
    const winners = await this.pickWinners(gw, gw.winners || []);
    if (!winners.length) return { ok: false, message: 'Aucun autre participant valide n’a été trouvé.' };
    gw.winners = winners;
    this.db.save();
    await this.updateMessage(gw);
    const { channel } = await this.fetchMessage(gw);
    if (channel?.isTextBased()) {
      await channel.send({
        content: `🔄 Nouveau tirage pour **${gw.prize}** : félicitations ${winners.map((id) => `<@${id}>`).join(', ')} !`,
        allowedMentions: { users: winners },
      }).catch(() => null);
    }
    return { ok: true, winners };
  }

  async remove(gw) {
    this.clearTimer(gw.id);
    const pending = this.refreshTimers.get(gw.id);
    if (pending) clearTimeout(pending);
    this.refreshTimers.delete(gw.id);
    const { message } = await this.fetchMessage(gw);
    if (message) await message.delete().catch(() => null);
    delete this.data[gw.id];
    this.db.save();
  }

  async restore() {
    const now = Date.now();
    let restored = 0;
    for (const gw of Object.values(this.data)) {
      if (gw.ended) continue;
      restored += 1;
      if (gw.endAt <= now) {
        await this.end(gw).catch((error) => console.error('[GIVEAWAY] Restauration :', error));
      } else {
        this.schedule(gw);
      }
    }
    if (restored > 0) console.log(`[GIVEAWAY] ${restored} giveaway(s) restauré(s).`);
  }

  formatDuration(ms) {
    return formatDuration(ms);
  }
}

module.exports = { GiveawayManager };
