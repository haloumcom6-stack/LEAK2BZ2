'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed, successEmbed, yesNo } = require('../core/embeds');
const { requirePermissions } = require('../core/guard');
const { defaultGuild } = require('../core/db');
const { parseDuration, formatDuration, truncate } = require('../core/utils');

const ACTION_CHOICES = [
  { name: 'Supprimer le message', value: 'delete' },
  { name: 'Avertir', value: 'warn' },
  { name: 'Timeout', value: 'timeout' },
  { name: 'Expulser', value: 'kick' },
];

const ACTION_LABELS = { delete: 'Suppression', warn: 'Avertissement', timeout: 'Timeout', kick: 'Expulsion' };

function actionLabel(action) {
  return ACTION_LABELS[action] || action;
}

function applyAction(settings, action, durationInput) {
  if (action) settings.action = action;
  if (durationInput) {
    const ms = parseDuration(durationInput);
    if (!ms) return 'Durée invalide. Exemples : `10m`, `1h`, `2j`.';
    if (ms < 10_000) return 'La durée minimale est de 10 secondes.';
    if (ms > 28 * 24 * 60 * 60 * 1000) return 'La durée maximale est de 28 jours.';
    settings.duration = Math.round(ms / 1000);
  }
  return null;
}

function parseDomains(input) {
  if (!input) return null;
  const domains = input.split(/[,\n;]+/).map((domain) => domain.trim()).filter(Boolean);
  if (domains.length === 0) return null;
  const cleaned = [];
  for (const raw of domains) {
    const domain = raw.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase().replace(/^www\./, '');
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(domain)) return { error: `Domaine invalide : **${truncate(raw, 60)}**` };
    cleaned.push(domain);
  }
  return { domains: [...new Set(cleaned)] };
}

function splitWords(input) {
  return [...new Set(String(input).split(/[,\n;]+/).map((word) => word.trim()).filter(Boolean))];
}

function statusEmbed(cfg) {
  const a = cfg.automod;
  const lines = [
    `${yesNo(a.enabled)} **Automod global**`,
    '',
    `**Anti-lien :** ${yesNo(a.antilink.enabled)} • Action : ${actionLabel(a.antilink.action)}${a.antilink.action === 'timeout' ? ` (${formatDuration(a.antilink.duration * 1000)})` : ''}`,
    `> Domaines autorisés : ${a.antilink.allowedDomains.length} • Anti-phishing : ${yesNo(a.antilink.blockPhishing)}`,
    `**Anti-invite :** ${yesNo(a.antiinvite.enabled)} • Action : ${actionLabel(a.antiinvite.action)}`,
    `**Anti-spam :** ${yesNo(a.antispam.enabled)} • ${a.antispam.threshold} msg / ${a.antispam.window}s • ${actionLabel(a.antispam.action)}`,
    `**Anti-majuscules :** ${yesNo(a.anticaps.enabled)} • ${a.anticaps.percent}% sur ${a.anticaps.minLength} lettres`,
    `**Anti-mentions :** ${yesNo(a.antimention.enabled)} • max ${a.antimention.max}`,
    `**Anti-emojis :** ${yesNo(a.antiemoji.enabled)} • max ${a.antiemoji.max}`,
    `**Mots interdits :** ${yesNo(a.badwords.enabled)} • ${a.badwords.words.length} mot(s)`,
    `**Anti-raid :** ${yesNo(a.antiraid.enabled)} • ${a.antiraid.threshold} joins / ${a.antiraid.window}s • comptes < ${a.antiraid.minAccountAge}j • ${a.antiraid.lockdown ? 'verrouillage activé' : 'verrouillage désactivé'}`,
    '',
    `**Rôles exemptés :** ${a.exemptRoles.length ? a.exemptRoles.map((id) => `<@&${id}>`).join(', ') : '`aucun`'}`,
    `**Salons exemptés :** ${a.exemptChannels.length ? a.exemptChannels.map((id) => `<#${id}>`).join(', ') : '`aucun`'}`,
  ];
  return baseEmbed({
    color: a.enabled ? COLORS.success : COLORS.error,
    title: `${EMOJI.shield} État de l’automod`,
    description: lines.join('\n'),
    footer: 'Automod',
  });
}

const automodCommand = {
  category: 'Configuration',
  cooldown: 3,
  aliases: ['automod'],
  permissions: ['ManageGuild'],
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure la modération automatique.')
    .addSubcommand((sub) => sub.setName('status').setDescription('Affiche l’état de l’automod.'))
    .addSubcommand((sub) => sub.setName('global').setDescription('Active ou désactive tout l’automod.')
      .addBooleanOption((option) => option.setName('activer').setDescription('Activer l’automod ?').setRequired(true)))
    .addSubcommand((sub) => sub.setName('antilink').setDescription('Configure l’anti-lien.')
      .addBooleanOption((option) => option.setName('activer').setDescription('Activer ?').setRequired(true))
      .addStringOption((option) => option.setName('action').setDescription('Sanction').addChoices(...ACTION_CHOICES))
      .addStringOption((option) => option.setName('duree').setDescription('Durée du timeout (ex: 10m, 1h)'))
      .addStringOption((option) => option.setName('domaines').setDescription('Liste complète de domaines autorisés, séparés par des virgules'))
      .addBooleanOption((option) => option.setName('phishing').setDescription('Bloquer les liens de phishing ?')))
    .addSubcommand((sub) => sub.setName('antiinvite').setDescription('Configure l’anti-invitation Discord.')
      .addBooleanOption((option) => option.setName('activer').setDescription('Activer ?').setRequired(true))
      .addStringOption((option) => option.setName('action').setDescription('Sanction').addChoices(...ACTION_CHOICES))
      .addStringOption((option) => option.setName('duree').setDescription('Durée du timeout')))
    .addSubcommand((sub) => sub.setName('antispam').setDescription('Configure l’anti-spam.')
      .addBooleanOption((option) => option.setName('activer').setDescription('Activer ?').setRequired(true))
      .addIntegerOption((option) => option.setName('messages').setDescription('Nombre de messages max (3-30)').setMinValue(3).setMaxValue(30))
      .addIntegerOption((option) => option.setName('secondes').setDescription('Fenêtre en secondes (2-60)').setMinValue(2).setMaxValue(60))
      .addStringOption((option) => option.setName('action').setDescription('Sanction').addChoices(...ACTION_CHOICES))
      .addStringOption((option) => option.setName('duree').setDescription('Durée du timeout')))
    .addSubcommand((sub) => sub.setName('anticaps').setDescription('Configure l’anti-majuscules.')
      .addBooleanOption((option) => option.setName('activer').setDescription('Activer ?').setRequired(true))
      .addIntegerOption((option) => option.setName('pourcentage').setDescription('Pourcentage de majuscules (50-100)').setMinValue(50).setMaxValue(100))
      .addIntegerOption((option) => option.setName('longueur_min').setDescription('Longueur minimale du message (5-100)').setMinValue(5).setMaxValue(100))
      .addStringOption((option) => option.setName('action').setDescription('Sanction').addChoices(...ACTION_CHOICES))
      .addStringOption((option) => option.setName('duree').setDescription('Durée du timeout')))
    .addSubcommand((sub) => sub.setName('antimention').setDescription('Configure l’anti-mentions massives.')
      .addBooleanOption((option) => option.setName('activer').setDescription('Activer ?').setRequired(true))
      .addIntegerOption((option) => option.setName('maximum').setDescription('Mentions max (1-50)').setMinValue(1).setMaxValue(50))
      .addStringOption((option) => option.setName('action').setDescription('Sanction').addChoices(...ACTION_CHOICES))
      .addStringOption((option) => option.setName('duree').setDescription('Durée du timeout')))
    .addSubcommand((sub) => sub.setName('antiemoji').setDescription('Configure l’anti-emojis massifs.')
      .addBooleanOption((option) => option.setName('activer').setDescription('Activer ?').setRequired(true))
      .addIntegerOption((option) => option.setName('maximum').setDescription('Emojis max (1-50)').setMinValue(1).setMaxValue(50))
      .addStringOption((option) => option.setName('action').setDescription('Sanction').addChoices(...ACTION_CHOICES))
      .addStringOption((option) => option.setName('duree').setDescription('Durée du timeout')))
    .addSubcommand((sub) => sub.setName('badwords').setDescription('Active le filtre et remplace la liste de mots.')
      .addBooleanOption((option) => option.setName('activer').setDescription('Activer ?').setRequired(true))
      .addStringOption((option) => option.setName('mots').setDescription('Mots séparés par des virgules (vide = conserver la liste)').setMaxLength(2000)))
    .addSubcommand((sub) => sub.setName('badword-add').setDescription('Ajoute des mots à la liste interdite.')
      .addStringOption((option) => option.setName('mots').setDescription('Mots séparés par des virgules').setRequired(true).setMaxLength(2000)))
    .addSubcommand((sub) => sub.setName('badword-remove').setDescription('Retire des mots de la liste interdite.')
      .addStringOption((option) => option.setName('mots').setDescription('Mots séparés par des virgules').setRequired(true).setMaxLength(2000)))
    .addSubcommand((sub) => sub.setName('antiraid').setDescription('Configure l’anti-raid.')
      .addBooleanOption((option) => option.setName('activer').setDescription('Activer ?').setRequired(true))
      .addIntegerOption((option) => option.setName('seuil').setDescription('Nombre de joins pour déclencher (3-50)').setMinValue(3).setMaxValue(50))
      .addIntegerOption((option) => option.setName('secondes').setDescription('Fenêtre en secondes (5-120)').setMinValue(5).setMaxValue(120))
      .addIntegerOption((option) => option.setName('age_compte').setDescription('Âge minimum du compte en jours (0-90)').setMinValue(0).setMaxValue(90))
      .addBooleanOption((option) => option.setName('verrouillage').setDescription('Passer le serveur en vérification élevée lors d’un raid')))
    .addSubcommand((sub) => sub.setName('exempt').setDescription('Exempte un rôle ou un salon de l’automod.')
      .addStringOption((option) => option.setName('cible').setDescription('Mention ou ID du rôle / salon').setRequired(true))
      .addStringOption((option) => option.setName('action').setDescription('Ajouter ou retirer').setRequired(true).addChoices({ name: 'Ajouter', value: 'add' }, { name: 'Retirer', value: 'remove' })))
    .addSubcommand((sub) => sub.setName('reset').setDescription('Réinitialise un module de l’automod.')
      .addStringOption((option) => option.setName('module').setDescription('Module à réinitialiser').setRequired(true).addChoices(
        { name: 'Tout', value: 'all' },
        { name: 'Anti-lien', value: 'antilink' },
        { name: 'Anti-invite', value: 'antiinvite' },
        { name: 'Anti-spam', value: 'antispam' },
        { name: 'Anti-majuscules', value: 'anticaps' },
        { name: 'Anti-mentions', value: 'antimention' },
        { name: 'Anti-emojis', value: 'antiemoji' },
        { name: 'Mots interdits', value: 'badwords' },
        { name: 'Anti-raid', value: 'antiraid' },
      ))),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageGuild'], []))) return;
    const cfg = ctx.guildConfig;
    const a = cfg.automod;
    const sub = ctx.subcommand;
    const save = () => ctx.client.db.save();

    if (sub === 'status') {
      return ctx.reply({ embeds: [statusEmbed(cfg)], ephemeral: true });
    }

    if (sub === 'global') {
      a.enabled = ctx.getBoolean('activer');
      save();
      return ctx.reply({ embeds: [successEmbed(`L’automod est maintenant **${a.enabled ? 'activé' : 'désactivé'}**.`)] });
    }

    if (sub === 'antilink') {
      a.antilink.enabled = ctx.getBoolean('activer');
      const actionError = applyAction(a.antilink, ctx.getString('action'), ctx.getString('duree'));
      if (actionError) return ctx.replyError(actionError);
      const domainsInput = ctx.getString('domaines');
      if (domainsInput) {
        const parsed = parseDomains(domainsInput);
        if (parsed?.error) return ctx.replyError(parsed.error);
        if (parsed?.domains) a.antilink.allowedDomains = parsed.domains;
      }
      const phishing = ctx.getBoolean('phishing');
      if (phishing !== null) a.antilink.blockPhishing = phishing;
      save();
      return ctx.reply({ embeds: [successEmbed(`**Anti-lien :** ${yesNo(a.antilink.enabled)}\n**Action :** ${actionLabel(a.antilink.action)}\n**Domaines autorisés :** ${a.antilink.allowedDomains.length}\n**Anti-phishing :** ${yesNo(a.antilink.blockPhishing)}`)] });
    }

    if (sub === 'antiinvite') {
      a.antiinvite.enabled = ctx.getBoolean('activer');
      const actionError = applyAction(a.antiinvite, ctx.getString('action'), ctx.getString('duree'));
      if (actionError) return ctx.replyError(actionError);
      save();
      return ctx.reply({ embeds: [successEmbed(`**Anti-invite :** ${yesNo(a.antiinvite.enabled)}\n**Action :** ${actionLabel(a.antiinvite.action)}`)] });
    }

    if (sub === 'antispam') {
      a.antispam.enabled = ctx.getBoolean('activer');
      const threshold = ctx.getInteger('messages');
      const window = ctx.getInteger('secondes');
      if (threshold) a.antispam.threshold = threshold;
      if (window) a.antispam.window = window;
      const actionError = applyAction(a.antispam, ctx.getString('action'), ctx.getString('duree'));
      if (actionError) return ctx.replyError(actionError);
      save();
      return ctx.reply({ embeds: [successEmbed(`**Anti-spam :** ${yesNo(a.antispam.enabled)}\n**Seuil :** ${a.antispam.threshold} messages / ${a.antispam.window}s\n**Action :** ${actionLabel(a.antispam.action)}`)] });
    }

    if (sub === 'anticaps') {
      a.anticaps.enabled = ctx.getBoolean('activer');
      const percent = ctx.getInteger('pourcentage');
      const minLength = ctx.getInteger('longueur_min');
      if (percent) a.anticaps.percent = percent;
      if (minLength) a.anticaps.minLength = minLength;
      const actionError = applyAction(a.anticaps, ctx.getString('action'), ctx.getString('duree'));
      if (actionError) return ctx.replyError(actionError);
      save();
      return ctx.reply({ embeds: [successEmbed(`**Anti-majuscules :** ${yesNo(a.anticaps.enabled)}\n**Seuil :** ${a.anticaps.percent}% sur ${a.anticaps.minLength} lettres\n**Action :** ${actionLabel(a.anticaps.action)}`)] });
    }

    if (sub === 'antimention') {
      a.antimention.enabled = ctx.getBoolean('activer');
      const max = ctx.getInteger('maximum');
      if (max) a.antimention.max = max;
      const actionError = applyAction(a.antimention, ctx.getString('action'), ctx.getString('duree'));
      if (actionError) return ctx.replyError(actionError);
      save();
      return ctx.reply({ embeds: [successEmbed(`**Anti-mentions :** ${yesNo(a.antimention.enabled)}\n**Maximum :** ${a.antimention.max}\n**Action :** ${actionLabel(a.antimention.action)}`)] });
    }

    if (sub === 'antiemoji') {
      a.antiemoji.enabled = ctx.getBoolean('activer');
      const max = ctx.getInteger('maximum');
      if (max) a.antiemoji.max = max;
      const actionError = applyAction(a.antiemoji, ctx.getString('action'), ctx.getString('duree'));
      if (actionError) return ctx.replyError(actionError);
      save();
      return ctx.reply({ embeds: [successEmbed(`**Anti-emojis :** ${yesNo(a.antiemoji.enabled)}\n**Maximum :** ${a.antiemoji.max}\n**Action :** ${actionLabel(a.antiemoji.action)}`)] });
    }

    if (sub === 'badwords') {
      a.badwords.enabled = ctx.getBoolean('activer');
      const input = ctx.getString('mots');
      if (input?.trim()) {
        const words = splitWords(input);
        if (words.length > 500) return ctx.replyError('Maximum 500 mots dans la liste.');
        a.badwords.words = words;
      }
      save();
      return ctx.reply({ embeds: [successEmbed(`**Filtre de mots :** ${yesNo(a.badwords.enabled)}\n**Mots dans la liste :** ${a.badwords.words.length}`)] });
    }

    if (sub === 'badword-add' || sub === 'badword-remove') {
      const words = splitWords(ctx.getString('mots'));
      if (!words.length) return ctx.replyError('Aucun mot valide fourni.');
      if (sub === 'badword-add') {
        const existing = new Set(a.badwords.words.map((word) => word.toLowerCase()));
        const added = words.filter((word) => !existing.has(word.toLowerCase()));
        a.badwords.words.push(...added);
        save();
        return ctx.reply({ embeds: [successEmbed(`${added.length} mot(s) ajouté(s). Total : **${a.badwords.words.length}**.`)] });
      }
      const removeSet = new Set(words.map((word) => word.toLowerCase()));
      const before = a.badwords.words.length;
      a.badwords.words = a.badwords.words.filter((word) => !removeSet.has(word.toLowerCase()));
      save();
      return ctx.reply({ embeds: [successEmbed(`${before - a.badwords.words.length} mot(s) retiré(s). Total : **${a.badwords.words.length}**.`)] });
    }

    if (sub === 'antiraid') {
      a.antiraid.enabled = ctx.getBoolean('activer');
      const threshold = ctx.getInteger('seuil');
      const window = ctx.getInteger('secondes');
      const age = ctx.getInteger('age_compte');
      const lockdown = ctx.getBoolean('verrouillage');
      if (threshold) a.antiraid.threshold = threshold;
      if (window) a.antiraid.window = window;
      if (age !== null) a.antiraid.minAccountAge = age;
      if (lockdown !== null) a.antiraid.lockdown = lockdown;
      save();
      return ctx.reply({ embeds: [successEmbed(`**Anti-raid :** ${yesNo(a.antiraid.enabled)}\n**Déclenchement :** ${a.antiraid.threshold} joins en ${a.antiraid.window}s\n**Comptes récents :** moins de ${a.antiraid.minAccountAge} jour(s) expulsés\n**Verrouillage :** ${yesNo(a.antiraid.lockdown)}`)] });
    }

    if (sub === 'exempt') {
      const raw = ctx.getString('cible');
      const id = raw.match(/\d{15,22}/)?.[0];
      if (!id) return ctx.replyError('Mention ou identifiant invalide.');
      const action = ctx.getString('action');
      const isAdd = action === 'add';
      const role = ctx.guild.roles.cache.get(id);
      const channel = ctx.guild.channels.cache.get(id);

      if (role) {
        const list = a.exemptRoles;
        const index = list.indexOf(role.id);
        if (isAdd) {
          if (index !== -1) return ctx.replyError('Ce rôle est déjà exempté.');
          list.push(role.id);
        } else {
          if (index === -1) return ctx.replyError('Ce rôle n’est pas exempté.');
          list.splice(index, 1);
        }
        save();
        return ctx.reply({ embeds: [successEmbed(`${role} ${isAdd ? 'est maintenant exempté' : 'n’est plus exempté'} de l’automod.`)] });
      }

      if (channel) {
        const list = a.exemptChannels;
        const index = list.indexOf(channel.id);
        if (isAdd) {
          if (index !== -1) return ctx.replyError('Ce salon est déjà exempté.');
          list.push(channel.id);
        } else {
          if (index === -1) return ctx.replyError('Ce salon n’est pas exempté.');
          list.splice(index, 1);
        }
        save();
        return ctx.reply({ embeds: [successEmbed(`${channel} ${isAdd ? 'est maintenant exempté' : 'n’est plus exempté'} de l’automod.`)] });
      }

      return ctx.replyError('Rôle ou salon introuvable.');
    }

    if (sub === 'reset') {
      const module = ctx.getString('module');
      const defaults = defaultGuild().automod;
      if (module === 'all') {
        cfg.automod = defaults;
      } else if (Object.prototype.hasOwnProperty.call(defaults, module)) {
        cfg.automod[module] = defaults[module];
      } else {
        return ctx.replyError('Module inconnu.');
      }
      save();
      return ctx.reply({ embeds: [successEmbed(`Le module **${module === 'all' ? 'automod complet' : module}** a été réinitialisé.`)] });
    }
  },
};

module.exports = [automodCommand];
