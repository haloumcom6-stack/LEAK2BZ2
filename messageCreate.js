'use strict';

const { Events, PermissionFlagsBits } = require('discord.js');
const { createPrefixContext, UsageError } = require('../core/context');
const { checkCooldown } = require('../core/cooldown');
const { errorEmbed } = require('../core/embeds');
const { runAutomod } = require('../core/automod');
const { handleMessageXp } = require('../core/levels');
const { formatDuration, truncate } = require('../core/utils');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.inGuild() || message.author.bot || message.system) return;
    const client = message.client;

    try {
      const punished = await runAutomod(message, client);
      if (punished) return;

      const cfg = client.db.guild(message.guild.id);
      const prefix = cfg.prefix || client.config.defaultPrefix;
      const trimmed = message.content.trim();

      if (trimmed === `<@${client.user.id}>` || trimmed === `<@!${client.user.id}>`) {
        await message.reply({
          embeds: [errorEmbed(`Utilise \`/help\` ou \`${prefix}help\` pour découvrir mes commandes.`, '👋 Besoin d’aide ?')],
          allowedMentions: { parse: [] },
        });
        return;
      }

      if (prefix && message.content.startsWith(prefix)) {
        const withoutPrefix = message.content.slice(prefix.length).trim();
        if (!withoutPrefix) return;
        const [rawName] = withoutPrefix.split(/\s+/);
        const name = rawName.toLowerCase();
        const command = client.commands.get(name)
          || client.commands.get(client.aliases.get(name));

        if (!command) return;

        const remaining = checkCooldown(client, message.author.id, command);
        if (remaining > 0) {
          const notice = await message.reply({
            embeds: [errorEmbed(`Patiente encore **${formatDuration(remaining)}** avant de réutiliser cette commande.`, '⏳ Cooldown')],
            allowedMentions: { parse: [] },
          }).catch(() => null);
          if (notice) setTimeout(() => notice.delete().catch(() => null), 5000);
          return;
        }

        if (!message.member) {
          await message.guild.members.fetch(message.author.id).catch(() => null);
        }

        let ctx;
        try {
          ctx = await createPrefixContext(client, command, message, prefix);
        } catch (error) {
          if (error instanceof UsageError) {
            const usage = (error.usage || '').replace(/`/g, '');
            const notice = await message.reply({
              embeds: [errorEmbed(`${error.message}\n\n**Utilisation :** \`${prefix}${usage}\``)],
              allowedMentions: { parse: [] },
            }).catch(() => null);
            if (notice) setTimeout(() => notice.delete().catch(() => null), 15_000);
            return;
          }
          throw error;
        }

        try {
          await command.execute(ctx);
        } catch (error) {
          console.error(`[PREFIXE] ${prefix}${name} :`, error);
          await message.reply({
            embeds: [errorEmbed(`Une erreur est survenue.\n\`\`\`${truncate(error.message || String(error), 700)}\`\`\``)],
            allowedMentions: { parse: [] },
          }).catch(() => null);
        }
        return;
      }

      if (message.content || message.attachments.size > 0) {
        await handleMessageXp(message, client);
      }
    } catch (error) {
      console.error('[MESSAGE]', error);
    }
  },
};
