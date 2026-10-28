'use strict';

const { Events } = require('discord.js');
const { BOT_NAME, COLORS, EMOJI } = require('../core/constants');
const { baseEmbed } = require('../core/embeds');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    guild.client.db.guild(guild.id);
    console.log(`[GUILDE] Ajouté à ${guild.name} (${guild.id}) — ${guild.memberCount} membres.`);

    const owner = await guild.fetchOwner().catch(() => null);
    if (!owner) return;
    await owner.send({
      embeds: [baseEmbed({
        color: COLORS.success,
        title: `${EMOJI.wave} Merci de m’avoir ajouté !`,
        description: `Je suis **${BOT_NAME}**, ton bot de gestion complet.\n\nVoici quelques commandes pour bien démarrer :`,
        fields: [
          { name: '⚙️ Configuration', value: '`/config view` — voir la configuration\n`/config logs` — configurer les logs\n`/config staff add` — rôles staff', inline: false },
          { name: '🛡️ Modération', value: '`/automod status` — état de l’automod\n`/automod antiraid` — protection anti-raid\n`/ban`, `/kick`, `/timeout`, `/warn`', inline: false },
          { name: '🎉 Communauté', value: '`/giveaway start` — lancer un concours\n`/welcome channel` — messages de bienvenue\n`/ticket setup` — support par tickets\n`/levels config` — système d’XP', inline: false },
          { name: '📚 Aide', value: '`/help` — toutes les commandes\n`/invite` — inviter le bot ailleurs', inline: false },
        ],
        thumbnail: guild.iconURL({ size: 256 }),
        footer: guild.name,
      })],
    }).catch(() => null);
  },
};
