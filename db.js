'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Liste de gros mots / insultes courantes (français + anglais).
 * Le filtre compare des mots entiers après normalisation (accents, leet speak).
 */
const DEFAULT_BADWORDS = [
  'connard', 'connasse', 'salope', 'pute', 'putain', 'merde', 'enculé', 'encule',
  'fdp', 'ntm', 'bâtard', 'batard', 'idiot', 'imbécile', 'imbecile', 'abruti',
  'tapette', 'boloss', 'tg', 'ferme ta gueule', 'nique ta mère', 'nique ta mere',
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'whore', 'slut',
];

const DEFAULT_PHISHING_WORDS = [
  'free nitro', 'nitro gratuit', 'nitro offert', 'gagne un nitro', 'discord gift',
  'steam gift', 'csgo skins', 'free skins', 'airdrop', 'claim your prize',
  'claim your gift', 'vérifie ton compte', 'verifie ton compte', 'ton compte va être supprimé',
  'ton compte va etre supprime', 'clique ici pour gagner', 'clique pour gagner',
  'cadeau discord', 'gift discord', 'nitro 1 mois gratuit', 'onlyfans leak',
];

const DEFAULT_ALLOWED_DOMAINS = [
  'youtube.com', 'youtu.be', 'twitch.tv', 'twitter.com', 'x.com', 'instagram.com',
  'tiktok.com', 'spotify.com', 'open.spotify.com', 'github.com', 'gitlab.com',
  'tenor.com', 'giphy.com', 'imgur.com', 'reddit.com', 'google.com', 'wikipedia.org',
  'discord.com', 'discord.gg', 'discordapp.com', 'discordapp.net', 'cdn.discordapp.com',
  'media.discordapp.net', 'steamcommunity.com', 'roblox.com', 'epicgames.com',
];

function defaultGuild() {
  return {
    prefix: null,
    locale: 'fr',
    createdAt: Date.now(),
    logs: {
      all: null,
      mod: null,
      messages: null,
      members: null,
      voice: null,
      server: null,
      tickets: null,
    },
    staff: {
      roles: [],
    },
    welcome: {
      enabled: false,
      channelId: null,
      message: 'Bienvenue {user} sur **{server}** ! Nous sommes désormais **{count}** membres. 🎉',
      embed: true,
      dm: false,
    },
    goodbye: {
      enabled: false,
      channelId: null,
      message: '**{username}** a quitté **{server}**. Nous sommes désormais **{count}** membres.',
      embed: true,
    },
    autoroles: [],
    automod: {
      enabled: true,
      exemptRoles: [],
      exemptChannels: [],
      antilink: {
        enabled: true,
        action: 'delete',
        duration: 300,
        allowedDomains: [...DEFAULT_ALLOWED_DOMAINS],
        blockPhishing: true,
      },
      antiinvite: {
        enabled: true,
        action: 'delete',
        duration: 300,
      },
      antispam: {
        enabled: true,
        threshold: 6,
        window: 7,
        action: 'timeout',
        duration: 600,
      },
      anticaps: {
        enabled: true,
        minLength: 14,
        percent: 75,
        action: 'delete',
        duration: 300,
      },
      antimention: {
        enabled: true,
        max: 6,
        action: 'delete',
        duration: 300,
      },
      antiemoji: {
        enabled: false,
        max: 15,
        action: 'delete',
        duration: 300,
      },
      badwords: {
        enabled: true,
        words: [...DEFAULT_BADWORDS],
        action: 'delete',
        duration: 300,
      },
      antiraid: {
        enabled: true,
        threshold: 8,
        window: 20,
        minAccountAge: 7,
        action: 'kick',
        lockdown: false,
        activeUntil: 0,
      },
      phishingWords: [...DEFAULT_PHISHING_WORDS],
      ignoredBots: true,
    },
    tickets: {
      enabled: false,
      panelChannelId: null,
      categoryId: null,
      logChannelId: null,
      supportRoleId: null,
      panelTitle: '🎫 Support — Ouvrir un ticket',
      panelMessage: 'Besoin d’aide ? Clique sur le bouton ci-dessous pour ouvrir un ticket privé avec l’équipe de modération.',
      welcomeMessage: 'Merci d’avoir ouvert un ticket ! Un membre du staff va te répondre dès que possible.\nDécris ton problème avec un maximum de détails.',
      counter: 0,
      open: {},
      channels: {},
    },
    levels: {
      enabled: true,
      channelId: null,
      message: '🎉 Bravo {user}, tu passes au **niveau {level}** !',
      xpMin: 15,
      xpMax: 25,
      cooldown: 60,
      rewards: {},
      users: {},
    },
    reactionRoles: [],
    cases: [],
    caseCounter: 0,
    tempbans: [],
    antinuke: {
      enabled: true,
      threshold: 3,
      window: 15,
      actions: [],
    },
    raid: {
      joins: [],
      activeUntil: 0,
    },
  };
}

function defaultData() {
  return {
    version: 1,
    guilds: {},
    giveaways: {},
    polls: {},
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Remplit récursivement les clés manquantes sans écraser les valeurs existantes.
 * Permet de faire évoluer la structure du bot sans casser les anciennes bases.
 */
function fillDefaults(target, defaults) {
  for (const [key, value] of Object.entries(defaults)) {
    if (target[key] === undefined) {
      target[key] = structuredClone(value);
      continue;
    }
    if (isPlainObject(value) && isPlainObject(target[key])) {
      fillDefaults(target[key], value);
    }
  }
  return target;
}

class Database {
  constructor(file) {
    this.file = file;
    this.tmpFile = `${file}.tmp`;
    this.saveTimer = null;
    this.data = defaultData();
    this.load();
  }

  load() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = fillDefaults(parsed, defaultData());
        for (const [id, guild] of Object.entries(this.data.guilds)) {
          this.data.guilds[id] = fillDefaults(guild, defaultGuild());
        }
      }
    } catch (error) {
      console.error('[DB] Impossible de charger la base, sauvegarde de secours créée.');
      console.error(error);
      try {
        if (fs.existsSync(this.file)) {
          fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}.bak`);
        }
      } catch {
        /* ignore */
      }
      this.data = defaultData();
    }
  }

  guild(id) {
    const key = String(id);
    if (!this.data.guilds[key]) {
      this.data.guilds[key] = defaultGuild();
      this.save();
    } else {
      fillDefaults(this.data.guilds[key], defaultGuild());
    }
    return this.data.guilds[key];
  }

  get giveawayList() {
    return this.data.giveaways;
  }

  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 350);
    if (typeof this.saveTimer.unref === 'function') this.saveTimer.unref();
  }

  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.tmpFile, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(this.tmpFile, this.file);
    } catch (error) {
      console.error('[DB] Échec de la sauvegarde :', error);
    }
  }
}

module.exports = { Database, defaultGuild, defaultData, fillDefaults, DEFAULT_BADWORDS };
