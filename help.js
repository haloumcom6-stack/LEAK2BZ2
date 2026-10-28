'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { BOT_NAME, CATEGORY_META, COLORS, EMOJI } = require('./constants');
const { baseEmbed } = require('./embeds');
const { formatDuration, formatNumber, humanUptime, truncate } = require('./utils');
const { topLevelUsage } = require('./context');

function categoriesFor(client) {
  return Object.entries(CATEGORY_META)
    .map(([key, meta]) => ({
      key,
      ...meta,
      count: client.commands.filter((command) => command.category === key).length,
    }))
    .filter((category) => category.count > 0);
}

function inviteUrl(client) {
  if (!client.config.clientId) return null;
  return `https://discord.com/oauth2/authorize?client_id=${client.config.clientId}&permissions=8&scope=bot%20applications.commands`;
}

function buildComponents(client, currentKey = null) {
  const categories = categoriesFor(client);
  const select = new StringSelectMenuBuilder()
    .setCustomId('help:category')
    .setPlaceholder('📂 Choisis une catégorie')
    .addOptions(categories.map((category) => {
      const option = {
        label: category.label,
        description: truncate(category.description, 100),
        value: category.key,
        emoji: category.emoji,
      };
      if (category.key === currentKey) option.default = true;
      return option;
    }));

  const rows = [new ActionRowBuilder().addComponents(select)];
  const buttons = new ActionRowBuilder();
  if (currentKey) {
    buttons.addComponents(new ButtonBuilder()
      .setCustomId('help:home')
      .setLabel('Accueil')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary));
  }
  const invite = inviteUrl(client);
  if (invite) {
    buttons.addComponents(new ButtonBuilder()
      .setLabel('Inviter le bot')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Link)
      .setURL(invite));
  }
  if (buttons.components.length > 0) rows.push(buttons);
  return rows;
}

function renderHome(client, prefix = client.config.defaultPrefix) {
  const categories = categoriesFor(client);
  const totalMembers = client.guilds.cache.reduce((total, guild) => total + (guild.memberCount || 0), 0);
  const description = [
    `**${BOT_NAME}** est ton bot de gestion complet : modération, anti-raid, giveaways, tickets, niveaux, logs et bien plus.`,
    '',
    `**Préfixe :** \`${prefix}\` (configurable avec \`/config prefix\`)`,
    `**Commandes :** ${client.commands.size} • **Serveurs :** ${client.guilds.cache.size} • **Membres :** ${formatNumber(totalMembers)}`,
    `**Uptime :** ${humanUptime(client.uptime || 0)}`,
    '',
    ...categories.map((category) => `${category.emoji} **${category.label}** — ${category.count} commande(s)\n> ${category.description}`),
    '',
    `${EMOJI.info} Sélectionne une catégorie dans le menu ci-dessous ou utilise \`/help <commande>\`.`,
  ].join('\n');

  return {
    embeds: [baseEmbed({
      color: COLORS.primary,
      title: `${EMOJI.sparkles} Aide — ${BOT_NAME}`,
      description,
      thumbnail: client.user.displayAvatarURL({ size: 256 }),
      footer: 'Aide',
    })],
    components: buildComponents(client),
  };
}

function renderCategory(client, key, prefix = client.config.defaultPrefix) {
  const meta = CATEGORY_META[key];
  if (!meta) return renderHome(client, prefix);
  const commands = client.commands
    .filter((command) => command.category === key)
    .sort((a, b) => a.data.toJSON().name.localeCompare(b.data.toJSON().name));

  const lines = commands.map((command) => {
    const json = command.data.toJSON();
    return `\`/${json.name}\` — ${truncate(json.description, 110)}`;
  });
  if (lines.length > 30) {
    lines.length = 30;
    lines.push(`… et ${commands.length - 30} autre(s), utilise \`/help <commande>\`.`);
  }

  return {
    embeds: [baseEmbed({
      color: COLORS.primary,
      title: `${meta.emoji} ${meta.label} — ${commands.length} commande(s)`,
      description: `${meta.description}\n\n${lines.join('\n')}`,
      thumbnail: client.user.displayAvatarURL({ size: 128 }),
      footer: 'Aide • Les commandes ont aussi une version préfixe',
    })],
    components: buildComponents(client, key),
  };
}

const OPTION_TYPES = {
  1: 'sous-commande',
  2: 'groupe',
  3: 'texte',
  4: 'nombre entier',
  5: 'oui/non',
  6: 'membre',
  7: 'salon',
  8: 'rôle',
  9: 'membre/rôle',
  10: 'nombre',
  11: 'fichier',
};

function renderCommandDetail(client, command, prefix = client.config.defaultPrefix) {
  const json = command.data.toJSON();
  const meta = CATEGORY_META[command.category];
  const options = json.options || [];
  const subcommands = options.filter((option) => option.type === 1 || option.type === 2);
  let optionsText = '';
  if (subcommands.length) {
    optionsText = subcommands.map((option) => {
      if (option.type === 2) {
        return `**${option.name}** (groupe)\n${(option.options || []).map((sub) => `> \`${sub.name}\` — ${sub.description}`).join('\n')}`;
      }
      return `**${option.name}** — ${option.description}`;
    }).join('\n');
  } else if (options.length) {
    optionsText = options.map((option) =>
      `**${option.name}**${option.required ? ' *' : ''} — ${option.description}${option.choices ? `\n> Choix : ${option.choices.map((choice) => choice.name).join(', ')}` : ''}`,
    ).join('\n');
  }

  const fields = [
    { name: 'Catégorie', value: meta ? `${meta.emoji} ${meta.label}` : command.category, inline: true },
    { name: 'Utilisation slash', value: topLevelUsage(command), inline: true },
    { name: 'Préfixe', value: `\`${prefix}${json.name}\``, inline: true },
  ];
  if (optionsText) fields.push({ name: 'Options / sous-commandes', value: truncate(optionsText, 1024), inline: false });
  if (command.aliases?.length) fields.push({ name: 'Alias préfixe', value: command.aliases.map((alias) => `\`${alias}\``).join(', '), inline: false });
  if (command.cooldown) fields.push({ name: 'Cooldown', value: `${command.cooldown}s`, inline: true });

  return {
    embeds: [baseEmbed({
      color: COLORS.primary,
      title: `📖 /${json.name}`,
      description: json.description || 'Aucune description.',
      fields,
      footer: 'Aide',
    })],
    components: buildComponents(client, command.category),
  };
}

function findCommand(client, name) {
  const query = name.toLowerCase().replace(/^\//, '');
  return client.commands.find((command) => {
    const json = command.data.toJSON();
    return json.name === query || (command.aliases || []).includes(query);
  }) || null;
}

module.exports = {
  renderHome,
  renderCategory,
  renderCommandDetail,
  findCommand,
  categoriesFor,
};
