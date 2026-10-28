'use strict';

const {
  ApplicationCommandOptionType,
  Collection,
  GuildMember,
} = require('discord.js');
const { EMOJI } = require('./constants');
const { errorEmbed } = require('./embeds');

const OPTION_STRING = ApplicationCommandOptionType.String;
const OPTION_INTEGER = ApplicationCommandOptionType.Integer;
const OPTION_BOOLEAN = ApplicationCommandOptionType.Boolean;
const OPTION_USER = ApplicationCommandOptionType.User;
const OPTION_CHANNEL = ApplicationCommandOptionType.Channel;
const OPTION_ROLE = ApplicationCommandOptionType.Role;
const OPTION_MENTIONABLE = ApplicationCommandOptionType.Mentionable;
const OPTION_NUMBER = ApplicationCommandOptionType.Number;
const OPTION_ATTACHMENT = ApplicationCommandOptionType.Attachment;

class UsageError extends Error {
  constructor(message, usage) {
    super(message);
    this.name = 'UsageError';
    this.usage = usage;
  }
}

/** Découpe une chaîne en respectant les guillemets. */
function tokenize(content) {
  const tokens = [];
  const regex = /"([^"]*)"|'([^']*)'|`([^`]*)`|(\S+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? match[4]);
  }
  return tokens;
}

function usageFor(command, subPath = [], options = null) {
  const json = command.data.toJSON();
  const parts = [json.name, ...subPath];
  const list = options ?? json.options ?? [];
  for (const option of list) {
    if (option.type === ApplicationCommandOptionType.Subcommand || option.type === ApplicationCommandOptionType.SubcommandGroup) continue;
    parts.push(option.required ? `<${option.name}>` : `[${option.name}]`);
  }
  return `\`${parts.join(' ')}\``;
}

function topLevelUsage(command) {
  const json = command.data.toJSON();
  const options = json.options || [];
  if (options.some((option) => option.type === ApplicationCommandOptionType.SubcommandGroup)) {
    return `\`${json.name} <${options.filter((o) => o.type === 2).map((o) => o.name).join('|')}>\` + sous-commande`;
  }
  if (options.some((option) => option.type === ApplicationCommandOptionType.Subcommand)) {
    return `\`${json.name} <${options.filter((o) => o.type === 1).map((o) => o.name).join('|')}>\``;
  }
  return usageFor(command);
}

function choiceValue(option, token) {
  if (!Array.isArray(option.choices)) return token;
  const lower = String(token).toLowerCase();
  const choice = option.choices.find((item) => String(item.name).toLowerCase() === lower || String(item.value).toLowerCase() === lower);
  return choice ? choice.value : undefined;
}

function parseBooleanToken(token) {
  const normalized = String(token).toLowerCase();
  if (['oui', 'yes', 'true', 'on', '1', 'activer', 'active', 'enable', 'enabled', 'actif'].includes(normalized)) return true;
  if (['non', 'no', 'false', 'off', '0', 'desactiver', 'désactiver', 'disable', 'disabled', 'inactif'].includes(normalized)) return false;
  return undefined;
}

async function resolveUserToken(client, guild, token) {
  const id = String(token).match(/\d{15,22}/)?.[0];
  if (!id) return null;
  const member = guild ? guild.members.cache.get(id) || await guild.members.fetch(id).catch(() => null) : null;
  if (member) return { user: member.user, member };
  const user = client.users.cache.get(id) || await client.users.fetch(id).catch(() => null);
  return user ? { user, member: null } : null;
}

async function resolveChannelToken(guild, token) {
  const id = String(token).match(/\d{15,22}/)?.[0];
  if (!id) return null;
  return guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
}

function resolveRoleToken(guild, token) {
  const id = String(token).match(/\d{15,22}/)?.[0];
  if (!id) return null;
  return guild.roles.cache.get(id) || null;
}

/**
 * Construit les valeurs d'une commande préfixée à partir du schéma slash.
 * @returns {Promise<{values: Map, subcommand: string|null, subcommandGroup: string|null, subPath: string[]}>}
 */
async function buildPrefixValues(client, command, tokens, message) {
  const json = command.data.toJSON();
  let options = json.options || [];
  const subPath = [];
  let subcommand = null;
  let subcommandGroup = null;

  if (options.some((option) => option.type === 1 || option.type === 2)) {
    const groupOption = options.find((option) => option.type === 2 && option.name === tokens[0]?.toLowerCase());
    if (groupOption) {
      subcommandGroup = groupOption.name;
      subPath.push(groupOption.name);
      tokens.shift();
      options = groupOption.options || [];
    }

    const subOption = options.find((option) => option.type === 1 && option.name === tokens[0]?.toLowerCase());
    if (!subOption) {
      const names = options.filter((option) => option.type === 1).map((option) => option.name);
      throw new UsageError(
        `Sous-commande manquante ou invalide. Choix possibles : ${names.map((name) => `**${name}**`).join(', ')}.`,
        topLevelUsage(command),
      );
    }
    subcommand = subOption.name;
    subPath.push(subcommand);
    tokens.shift();
    options = subOption.options || [];
  }

  const values = new Map();
  const usage = usageFor(command, subPath, options);

  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (option.type === 1 || option.type === 2) continue;
    const isLast = index === options.length - 1;
    let token;

    if (option.type === OPTION_STRING && isLast && tokens.length > 0) {
      token = tokens.splice(0, tokens.length).join(' ');
    } else {
      token = tokens.shift();
    }

    if (token === undefined || token === '') {
      if (option.required) {
        throw new UsageError(`L’option **${option.name}** est requise.`, usage);
      }
      continue;
    }

    let value;
    let resolved = null;

    switch (option.type) {
      case OPTION_STRING: {
        const selected = choiceValue(option, token);
        if (selected === undefined) {
          throw new UsageError(
            `Valeur invalide pour **${option.name}**. Choix : ${option.choices.map((choice) => `**${choice.name}**`).join(', ')}.`,
            usage,
          );
        }
        value = String(selected);
        break;
      }
      case OPTION_INTEGER: {
        value = Number.parseInt(token, 10);
        if (!Number.isInteger(value) || String(value) !== token.replace(/^\+/, '')) {
          throw new UsageError(`**${option.name}** doit être un nombre entier.`, usage);
        }
        break;
      }
      case OPTION_NUMBER: {
        value = Number.parseFloat(String(token).replace(',', '.'));
        if (!Number.isFinite(value)) {
          throw new UsageError(`**${option.name}** doit être un nombre.`, usage);
        }
        break;
      }
      case OPTION_BOOLEAN: {
        value = parseBooleanToken(token);
        if (value === undefined) {
          throw new UsageError(`**${option.name}** doit être **oui** ou **non**.`, usage);
        }
        break;
      }
      case OPTION_USER: {
        const found = await resolveUserToken(client, message.guild, token);
        if (!found) throw new UsageError(`Membre ou utilisateur introuvable : **${token}**.`, usage);
        value = found.user.id;
        resolved = found.member || found.user;
        break;
      }
      case OPTION_CHANNEL: {
        resolved = await resolveChannelToken(message.guild, token);
        if (!resolved) throw new UsageError(`Salon introuvable : **${token}**.`, usage);
        value = resolved.id;
        break;
      }
      case OPTION_ROLE: {
        resolved = resolveRoleToken(message.guild, token);
        if (!resolved) throw new UsageError(`Rôle introuvable : **${token}**.`, usage);
        value = resolved.id;
        break;
      }
      case OPTION_MENTIONABLE: {
        resolved = resolveRoleToken(message.guild, token);
        if (!resolved) {
          const found = await resolveUserToken(client, message.guild, token);
          if (!found) throw new UsageError(`Membre ou rôle introuvable : **${token}**.`, usage);
          resolved = found.member || found.user;
        }
        value = resolved.id;
        break;
      }
      case OPTION_ATTACHMENT: {
        resolved = message.attachments.first() || null;
        value = resolved?.url || null;
        break;
      }
      default:
        value = token;
        break;
    }

    values.set(option.name, { type: option.type, value, resolved });
  }

  if (tokens.length > 0) {
    throw new UsageError(`Trop d’arguments fournis.`, usage);
  }

  return { values, subcommand, subcommandGroup, subPath };
}

function resolveSlashOption(option) {
  return option.member || option.user || option.channel || option.role || option.attachment || null;
}

function collectSlashValues(interaction) {
  const values = new Map();
  let subcommand = null;
  let subcommandGroup = null;
  const subPath = [];

  const addOptions = (options) => {
    for (const option of options || []) {
      if (option.type === 1 || option.type === 2) continue;
      values.set(option.name, {
        type: option.type,
        value: option.value,
        resolved: resolveSlashOption(option),
      });
    }
  };

  for (const option of interaction.options.data) {
    if (option.type === 1) {
      subcommand = option.name;
      subPath.push(option.name);
      addOptions(option.options);
    } else if (option.type === 2) {
      subcommandGroup = option.name;
      subPath.push(option.name);
      for (const sub of option.options || []) {
        if (sub.type === 1) {
          subcommand = sub.name;
          subPath.push(sub.name);
          addOptions(sub.options);
        }
      }
    } else {
      values.set(option.name, {
        type: option.type,
        value: option.value,
        resolved: resolveSlashOption(option),
      });
    }
  }

  return { values, subcommand, subcommandGroup, subPath };
}

class Context {
  /**
   * @param {import('discord.js').Client} client
   * @param {object} command
   * @param {object} source
   */
  constructor(client, command, source) {
    this.client = client;
    this.command = command;
    this.type = source.type;
    this.interaction = source.interaction || null;
    this.message = source.message || null;
    this.prefix = source.prefix || null;
    this.guild = source.guild || null;
    this.channel = source.channel || null;
    this.user = source.user;
    this.member = source.member || null;
    this.values = source.values;
    this.subcommand = source.subcommand || null;
    this.subcommandGroup = source.subcommandGroup || null;
    this.subPath = source.subPath || [];
    this.replied = false;
    this.deferred = false;
    this.lastMessage = null;
  }

  get isSlash() {
    return this.type === 'slash';
  }

  get isPrefix() {
    return this.type === 'prefix';
  }

  get commandName() {
    return this.command.data.toJSON().name;
  }

  get guildId() {
    return this.guild?.id || null;
  }

  get channelId() {
    return this.channel?.id || null;
  }

  get guildConfig() {
    return this.guild ? this.client.db.guild(this.guild.id) : null;
  }

  get sub() {
    return this.subcommand;
  }

  _entry(name) {
    return this.values.get(name) || null;
  }

  getString(name) {
    const entry = this._entry(name);
    if (!entry || entry.type !== OPTION_STRING) return null;
    return entry.value ?? null;
  }

  getInteger(name) {
    const entry = this._entry(name);
    if (!entry || entry.type !== OPTION_INTEGER) return entry?.type === OPTION_NUMBER ? Math.trunc(entry.value) : null;
    return entry.value ?? null;
  }

  getNumber(name) {
    const entry = this._entry(name);
    if (!entry || (entry.type !== OPTION_NUMBER && entry.type !== OPTION_INTEGER)) return null;
    return entry.value ?? null;
  }

  getBoolean(name) {
    const entry = this._entry(name);
    return entry?.type === OPTION_BOOLEAN ? Boolean(entry.value) : null;
  }

  getUser(name) {
    const entry = this._entry(name);
    if (!entry) return null;
    if (entry.type !== OPTION_USER && entry.type !== OPTION_MENTIONABLE) return null;
    const resolved = entry.resolved;
    if (!resolved) return null;
    if (resolved.user) return resolved.user;
    if (resolved.username) return resolved;
    if (this.guild && resolved.id) return this.guild.members.cache.get(resolved.id)?.user || null;
    return null;
  }

  getMember(name) {
    const entry = this._entry(name);
    if (!entry) return null;
    if (entry.type !== OPTION_USER && entry.type !== OPTION_MENTIONABLE) return null;
    const resolved = entry.resolved;
    if (!resolved) return null;
    if (resolved instanceof GuildMember || resolved.roles) return resolved;
    if (this.guild && resolved.id) {
      return this.guild.members.cache.get(resolved.id)
        || (resolved.user ? this.guild.members.cache.get(resolved.user.id) : null)
        || null;
    }
    return null;
  }

  async fetchMember(name) {
    const member = this.getMember(name);
    if (member) return member;
    const user = this.getUser(name);
    return user ? this.guild.members.fetch(user.id).catch(() => null) : null;
  }

  getChannel(name) {
    const entry = this._entry(name);
    if (!entry || (entry.type !== OPTION_CHANNEL && entry.type !== OPTION_MENTIONABLE)) return null;
    return entry.resolved?.id ? entry.resolved : null;
  }

  getRole(name) {
    const entry = this._entry(name);
    if (!entry || (entry.type !== OPTION_ROLE && entry.type !== OPTION_MENTIONABLE)) return null;
    return entry.resolved?.id && !entry.resolved.user ? entry.resolved : null;
  }

  getAttachment(name) {
    const entry = this._entry(name);
    if (!entry || entry.type !== OPTION_ATTACHMENT) return null;
    return entry.resolved || null;
  }

  getMentionable(name) {
    return this._entry(name)?.resolved || null;
  }

  _normalizePayload(payload) {
    if (typeof payload === 'string') return { content: payload };
    return { ...payload };
  }

  /**
   * Répond à l'interaction / au message.
   * @param {string|object} payload
   * @param {{ ephemeral?: boolean }} [options]
   */
  async reply(payload, options = {}) {
    const body = this._normalizePayload(payload);
    const ephemeral = Boolean(options.ephemeral);
    if (this.isSlash) {
      if (this.interaction.deferred) {
        this.replied = true;
        const message = await this.interaction.editReply(body);
        this.lastMessage = message;
        return message;
      }
      if (this.interaction.replied) {
        return this.interaction.followUp({ ...body, ephemeral });
      }
      this.replied = true;
      const message = await this.interaction.reply({ ...body, ephemeral });
      this.lastMessage = message;
      return message;
    }
    delete body.ephemeral;
    const message = await this.channel.send(body);
    this.replied = true;
    this.lastMessage = message;
    return message;
  }

  async defer(options = {}) {
    const ephemeral = options.ephemeral !== false;
    if (this.isSlash) {
      if (!this.interaction.deferred && !this.interaction.replied) {
        await this.interaction.deferReply({ ephemeral });
        this.deferred = true;
      }
      return;
    }
    this.deferred = true;
    await this.channel.sendTyping().catch(() => null);
  }

  // Alias compatibles avec l'API des interactions (utilisés par les modules tickets).
  async deferReply(options = {}) {
    return this.defer(options);
  }

  async editReply(payload) {
    return this.edit(payload);
  }

  async edit(payload) {
    const body = this._normalizePayload(payload);
    if (this.isSlash) {
      const message = await this.interaction.editReply(body);
      this.lastMessage = message;
      return message;
    }
    if (this.lastMessage) return this.lastMessage.edit(body);
    return this.reply(body);
  }

  async followUp(payload, options = {}) {
    const body = this._normalizePayload(payload);
    if (this.isSlash) return this.interaction.followUp({ ...body, ephemeral: Boolean(options.ephemeral) });
    delete body.ephemeral;
    return this.channel.send(body);
  }

  async replyError(message, title = `${EMOJI.error} Erreur`) {
    return this.reply({ embeds: [errorEmbed(message, title)], ephemeral: true });
  }

  async replySuccess(message, title = `${EMOJI.success} Succès`) {
    const { successEmbed } = require('./embeds');
    return this.reply({ embeds: [successEmbed(message, title)], ephemeral: true });
  }
}

function createSlashContext(client, command, interaction) {
  const data = collectSlashValues(interaction);
  return new Context(client, command, {
    type: 'slash',
    interaction,
    guild: interaction.guild,
    channel: interaction.channel,
    user: interaction.user,
    member: interaction.member instanceof GuildMember
      ? interaction.member
      : interaction.guild?.members?.cache?.get(interaction.user.id) || null,
    ...data,
  });
}

async function createPrefixContext(client, command, message, prefix) {
  const content = message.content.slice(prefix.length).trim();
  const tokens = tokenize(content);
  tokens.shift(); // nom de la commande
  const data = await buildPrefixValues(client, command, tokens, message);
  return new Context(client, command, {
    type: 'prefix',
    message,
    prefix,
    guild: message.guild,
    channel: message.channel,
    user: message.author,
    member: message.member,
    ...data,
  });
}

module.exports = {
  Context,
  UsageError,
  createSlashContext,
  createPrefixContext,
  tokenize,
  topLevelUsage,
  usageFor,
  OPTION_STRING,
  OPTION_INTEGER,
  OPTION_NUMBER,
  OPTION_BOOLEAN,
  OPTION_USER,
  OPTION_CHANNEL,
  OPTION_ROLE,
  OPTION_MENTIONABLE,
  OPTION_ATTACHMENT,
};
