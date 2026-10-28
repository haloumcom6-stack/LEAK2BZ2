'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed, errorEmbed, successEmbed, yesNo } = require('../core/embeds');
const { requirePermissions } = require('../core/guard');
const { truncate } = require('../core/utils');

const LOG_TYPES = [
  { name: 'Tous les logs', value: 'all' },
  { name: 'Modération', value: 'mod' },
  { name: 'Messages', value: 'messages' },
  { name: 'Membres', value: 'members' },
  { name: 'Vocal', value: 'voice' },
  { name: 'Serveur', value: 'server' },
  { name: 'Tickets', value: 'tickets' },
];

function buildLogsField(cfg) {
  const labels = { all: 'Tous', mod: 'Modération', messages: 'Messages', members: 'Membres', voice: 'Vocal', server: 'Serveur', tickets: 'Tickets' };
  const lines = Object.entries(labels)
    .filter(([key]) => key !== 'all')
    .map(([key, label]) => `**${label} :** ${cfg.logs[key] ? `<#${cfg.logs[key]}>` : cfg.logs.all ? `<#${cfg.logs.all}> *(global)*` : '`désactivé`'}`);
  return lines.join('\n') || 'Aucun salon configuré.';
}

const configCommand = {
  category: 'Configuration',
  cooldown: 3,
  aliases: ['config', 'parametres'],
  permissions: ['ManageGuild'],
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure le bot sur ce serveur.')
    .addSubcommand((sub) => sub.setName('view').setDescription('Affiche toute la configuration du serveur.'))
    .addSubcommand((sub) => sub
      .setName('prefix')
      .setDescription('Change le préfixe des commandes texte.')
      .addStringOption((option) => option.setName('prefixe').setDescription('Nouveau préfixe (1 à 5 caractères)').setRequired(true).setMinLength(1).setMaxLength(5)))
    .addSubcommand((sub) => sub.setName('logs').setDescription('Configure un salon de logs.')
      .addStringOption((option) => option.setName('type').setDescription('Type de logs').setRequired(true).addChoices(...LOG_TYPES))
      .addChannelOption((option) => option.setName('salon').setDescription('Salon de logs (vide = désactiver)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommandGroup((group) => group
      .setName('staff')
      .setDescription('Gère les rôles staff (accès modération sans permission Discord).')
      .addSubcommand((sub) => sub.setName('add').setDescription('Ajoute un rôle staff.')
        .addRoleOption((option) => option.setName('role').setDescription('Rôle à ajouter').setRequired(true)))
      .addSubcommand((sub) => sub.setName('remove').setDescription('Retire un rôle staff.')
        .addRoleOption((option) => option.setName('role').setDescription('Rôle à retirer').setRequired(true)))
      .addSubcommand((sub) => sub.setName('list').setDescription('Liste les rôles staff.')))
    .addSubcommandGroup((group) => group
      .setName('autorole')
      .setDescription('Gère les rôles automatiques à l’arrivée.')
      .addSubcommand((sub) => sub.setName('add').setDescription('Ajoute un rôle automatique.')
        .addRoleOption((option) => option.setName('role').setDescription('Rôle à attribuer').setRequired(true)))
      .addSubcommand((sub) => sub.setName('remove').setDescription('Retire un rôle automatique.')
        .addRoleOption((option) => option.setName('role').setDescription('Rôle à retirer').setRequired(true)))
      .addSubcommand((sub) => sub.setName('list').setDescription('Liste les rôles automatiques.'))),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageGuild'], []))) return;
    const cfg = ctx.guildConfig;
    const group = ctx.subcommandGroup;
    const sub = ctx.subcommand;

    if (sub === 'view') {
      const activeGiveaways = ctx.client.giveaways.listForGuild(ctx.guild.id).filter((gw) => !gw.ended).length;
      const embed = baseEmbed({
        color: COLORS.primary,
        title: `${EMOJI.settings} Configuration — ${ctx.guild.name}`,
        thumbnail: ctx.guild.iconURL({ size: 256 }),
        fields: [
          { name: 'Préfixe', value: `\`${cfg.prefix || ctx.client.config.defaultPrefix}\``, inline: true },
          { name: 'Rôles staff', value: cfg.staff.roles.length ? cfg.staff.roles.map((id) => `<@&${id}>`).join(', ') : '`aucun`', inline: true },
          { name: 'Giveaways actifs', value: `${activeGiveaways}`, inline: true },
          { name: 'Logs', value: buildLogsField(cfg), inline: false },
          { name: 'Automod', value: `${yesNo(cfg.automod.enabled)}\n> Anti-lien ${yesNo(cfg.automod.antilink.enabled)} • Anti-invite ${yesNo(cfg.automod.antiinvite.enabled)}\n> Anti-spam ${yesNo(cfg.automod.antispam.enabled)} • Mots interdits ${yesNo(cfg.automod.badwords.enabled)}\n> Anti-raid ${yesNo(cfg.automod.antiraid.enabled)} • Majuscules ${yesNo(cfg.automod.anticaps.enabled)}`, inline: false },
          { name: 'Bienvenue', value: cfg.welcome.enabled ? `Activé dans ${cfg.welcome.channelId ? `<#${cfg.welcome.channelId}>` : '`aucun salon`'}` : 'Désactivé', inline: true },
          { name: 'Au revoir', value: cfg.goodbye.enabled ? `Activé dans ${cfg.goodbye.channelId ? `<#${cfg.goodbye.channelId}>` : '`aucun salon`'}` : 'Désactivé', inline: true },
          { name: 'Autorôles', value: cfg.autoroles.length ? cfg.autoroles.map((id) => `<@&${id}>`).join(', ') : '`aucun`', inline: false },
          { name: 'Tickets', value: cfg.tickets.enabled ? `Activés${cfg.tickets.panelChannelId ? ` • panel <#${cfg.tickets.panelChannelId}>` : ''}${cfg.tickets.supportRoleId ? ` • staff <@&${cfg.tickets.supportRoleId}>` : ''}` : 'Désactivés', inline: false },
          { name: 'Niveaux', value: cfg.levels.enabled ? `Activés${cfg.levels.channelId ? ` • messages dans <#${cfg.levels.channelId}>` : ''}` : 'Désactivés', inline: true },
          { name: 'Rôles-réactions', value: `${cfg.reactionRoles.length} configuré(s)`, inline: true },
          { name: 'Dossiers de modération', value: `${cfg.cases.length}`, inline: true },
        ],
        footer: 'Configuration',
      });
      return ctx.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'prefix') {
      const prefix = ctx.getString('prefixe');
      if (!prefix || /\s/.test(prefix)) return ctx.replyError('Le préfixe ne doit pas contenir d’espaces.');
      cfg.prefix = prefix;
      ctx.client.db.save();
      return ctx.reply({ embeds: [successEmbed(`Le préfixe est maintenant \`${prefix}\`.\nExemple : \`${prefix}help\``)] });
    }

    if (sub === 'logs') {
      const type = ctx.getString('type');
      const channel = ctx.getChannel('salon');
      if (!Object.prototype.hasOwnProperty.call(cfg.logs, type)) return ctx.replyError('Type de logs invalide.');

      if (!channel) {
        cfg.logs[type] = null;
        if (type === 'tickets') cfg.tickets.logChannelId = null;
        ctx.client.db.save();
        return ctx.reply({ embeds: [successEmbed(`Les logs **${type}** sont désactivés.`)] });
      }
      if (!channel.isTextBased()) return ctx.replyError('Choisis un salon textuel.');

      const me = ctx.guild.members.me;
      const permissions = channel.permissionsFor(me);
      if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return ctx.replyError(`Je n’ai pas les permissions d’écrire des embeds dans ${channel}.`);
      }
      cfg.logs[type] = channel.id;
      if (type === 'tickets') cfg.tickets.logChannelId = channel.id;
      ctx.client.db.save();
      return ctx.reply({ embeds: [successEmbed(`Les logs **${type}** seront envoyés dans ${channel}.`)] });
    }

    if (group === 'staff') {
      if (sub === 'add') {
        const role = ctx.getRole('role');
        if (!role) return ctx.replyError('Rôle introuvable.');
        if (role.id === ctx.guild.roles.everyone.id) return ctx.replyError('Le rôle @everyone ne peut pas être staff.');
        if (cfg.staff.roles.includes(role.id)) return ctx.replyError('Ce rôle est déjà dans la liste staff.');
        cfg.staff.roles.push(role.id);
        ctx.client.db.save();
        return ctx.reply({ embeds: [successEmbed(`${role} peut désormais utiliser les commandes de modération.`)] });
      }
      if (sub === 'remove') {
        const role = ctx.getRole('role');
        if (!role) return ctx.replyError('Rôle introuvable.');
        const index = cfg.staff.roles.indexOf(role.id);
        if (index === -1) return ctx.replyError('Ce rôle n’est pas dans la liste staff.');
        cfg.staff.roles.splice(index, 1);
        ctx.client.db.save();
        return ctx.reply({ embeds: [successEmbed(`${role} n’est plus un rôle staff.`)] });
      }
      if (sub === 'list') {
        return ctx.reply({
          embeds: [baseEmbed({
            color: COLORS.primary,
            title: `${EMOJI.shield} Rôles staff`,
            description: cfg.staff.roles.length ? cfg.staff.roles.map((id) => `• <@&${id}> (\`${id}\`)`).join('\n') : 'Aucun rôle staff configuré.',
            footer: 'Configuration',
          })],
          ephemeral: true,
        });
      }
    }

    if (group === 'autorole') {
      const me = ctx.guild.members.me;
      if (sub === 'add') {
        const role = ctx.getRole('role');
        if (!role) return ctx.replyError('Rôle introuvable.');
        if (role.id === ctx.guild.roles.everyone.id) return ctx.replyError('Impossible d’ajouter le rôle @everyone.');
        if (role.managed) return ctx.replyError('Ce rôle est géré par une intégration.');
        if (role.position >= me.roles.highest.position) return ctx.replyError('Ce rôle est au-dessus de mon rôle le plus haut.');
        if (cfg.autoroles.includes(role.id)) return ctx.replyError('Ce rôle est déjà un autorôle.');
        if (cfg.autoroles.length >= 20) return ctx.replyError('Maximum 20 autorôles.');
        cfg.autoroles.push(role.id);
        ctx.client.db.save();
        return ctx.reply({ embeds: [successEmbed(`${role} sera attribué automatiquement aux nouveaux membres.`)] });
      }
      if (sub === 'remove') {
        const role = ctx.getRole('role');
        if (!role) return ctx.replyError('Rôle introuvable.');
        const index = cfg.autoroles.indexOf(role.id);
        if (index === -1) return ctx.replyError('Ce rôle n’est pas un autorôle.');
        cfg.autoroles.splice(index, 1);
        ctx.client.db.save();
        return ctx.reply({ embeds: [successEmbed(`${role} ne sera plus attribué automatiquement.`)] });
      }
      if (sub === 'list') {
        return ctx.reply({
          embeds: [baseEmbed({
            color: COLORS.primary,
            title: '🎭 Rôles automatiques',
            description: cfg.autoroles.length ? cfg.autoroles.map((id) => `• <@&${id}> (\`${id}\`)`).join('\n') : 'Aucun autorôle configuré.',
            footer: 'Configuration',
          })],
          ephemeral: true,
        });
      }
    }
  },
};

module.exports = [configCommand];
