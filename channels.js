'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed, successEmbed, errorEmbed } = require('../core/embeds');
const { requirePermissions, assertHierarchy } = require('../core/guard');
const { confirmAction } = require('../core/confirm');
const { sendLog } = require('../core/logs');
const { truncate } = require('../core/utils');

async function resolveTextChannel(ctx, name = 'salon') {
  const channel = ctx.getChannel(name) || ctx.channel;
  if (!channel || !channel.isTextBased() || channel.isThread()) {
    await ctx.replyError('Cette commande doit être utilisée dans un salon textuel (pas un fil).');
    return null;
  }
  return channel;
}

const slowmodeCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['cooldown'],
  permissions: ['ManageChannels'],
  botPermissions: ['ManageChannels'],
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Définit le mode lent d’un salon.')
    .addIntegerOption((option) => option.setName('secondes').setDescription('Délai en secondes (0-21600)').setRequired(true).setMinValue(0).setMaxValue(21600))
    .addChannelOption((option) => option.setName('salon').setDescription('Salon concerné (par défaut : le salon actuel)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageChannels'], ['ManageChannels']))) return;
    const channel = await resolveTextChannel(ctx);
    if (!channel) return;
    const seconds = ctx.getInteger('secondes');
    const ok = await channel.setRateLimitPerUser(seconds, `${ctx.user.tag || ctx.user.username}`).then(() => true).catch(() => false);
    if (!ok) return ctx.replyError('Impossible de modifier le mode lent de ce salon.');
    await ctx.reply({
      embeds: [successEmbed(seconds === 0
        ? `Le mode lent de ${channel} a été désactivé.`
        : `Le mode lent de ${channel} est maintenant de **${seconds} seconde(s)**.`)],
    });
  },
};

const lockCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['verrouiller'],
  permissions: ['ManageChannels'],
  botPermissions: ['ManageChannels'],
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Verrouille un salon (personne ne peut plus écrire).')
    .addChannelOption((option) => option.setName('salon').setDescription('Salon à verrouiller').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((option) => option.setName('raison').setDescription('Raison')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageChannels'], ['ManageChannels']))) return;
    const channel = await resolveTextChannel(ctx);
    if (!channel) return;
    const reason = ctx.getString('raison')?.trim() || 'Aucune raison fournie';
    const ok = await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
      SendMessages: false,
      AddReactions: false,
    }, { reason: `Lock par ${ctx.user.tag || ctx.user.username} : ${reason}` }).then(() => true).catch(() => false);
    if (!ok) return ctx.replyError('Impossible de verrouiller ce salon.');

    const embed = baseEmbed({
      color: COLORS.warning,
      title: `${EMOJI.lock} Salon verrouillé`,
      description: `${channel} a été verrouillé par ${ctx.user}.\n**Raison :** ${reason}`,
      footer: 'Modération',
    });
    await channel.send({ embeds: [embed] }).catch(() => null);
    await sendLog(ctx.guild, 'server', embed);
    await ctx.reply({ embeds: [successEmbed(`${channel} est maintenant verrouillé.`)] });
  },
};

const unlockCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['deverrouiller'],
  permissions: ['ManageChannels'],
  botPermissions: ['ManageChannels'],
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Déverrouille un salon.')
    .addChannelOption((option) => option.setName('salon').setDescription('Salon à déverrouiller').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((option) => option.setName('raison').setDescription('Raison')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageChannels'], ['ManageChannels']))) return;
    const channel = await resolveTextChannel(ctx);
    if (!channel) return;
    const reason = ctx.getString('raison')?.trim() || 'Aucune raison fournie';
    const ok = await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
      SendMessages: null,
      AddReactions: null,
    }, { reason: `Unlock par ${ctx.user.tag || ctx.user.username} : ${reason}` }).then(() => true).catch(() => false);
    if (!ok) return ctx.replyError('Impossible de déverrouiller ce salon.');

    const embed = baseEmbed({
      color: COLORS.success,
      title: `${EMOJI.unlock} Salon déverrouillé`,
      description: `${channel} a été déverrouillé par ${ctx.user}.\n**Raison :** ${reason}`,
      footer: 'Modération',
    });
    await channel.send({ embeds: [embed] }).catch(() => null);
    await sendLog(ctx.guild, 'server', embed);
    await ctx.reply({ embeds: [successEmbed(`${channel} est maintenant déverrouillé.`)] });
  },
};

const hideCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['cacher'],
  permissions: ['ManageChannels'],
  botPermissions: ['ManageChannels'],
  data: new SlashCommandBuilder()
    .setName('hide')
    .setDescription('Cache un salon pour les membres.')
    .addChannelOption((option) => option.setName('salon').setDescription('Salon à cacher').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((option) => option.setName('raison').setDescription('Raison')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageChannels'], ['ManageChannels']))) return;
    const channel = await resolveTextChannel(ctx);
    if (!channel) return;
    const ok = await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
      ViewChannel: false,
    }, { reason: `Hide par ${ctx.user.tag || ctx.user.username}` }).then(() => true).catch(() => false);
    if (!ok) return ctx.replyError('Impossible de cacher ce salon.');
    await ctx.reply({ embeds: [successEmbed(`${channel} est maintenant visible uniquement par le staff.`)] });
  },
};

const unhideCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['montrer'],
  permissions: ['ManageChannels'],
  botPermissions: ['ManageChannels'],
  data: new SlashCommandBuilder()
    .setName('unhide')
    .setDescription('Rend un salon visible à nouveau.')
    .addChannelOption((option) => option.setName('salon').setDescription('Salon à afficher').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((option) => option.setName('raison').setDescription('Raison')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageChannels'], ['ManageChannels']))) return;
    const channel = await resolveTextChannel(ctx);
    if (!channel) return;
    const ok = await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
      ViewChannel: null,
    }, { reason: `Unhide par ${ctx.user.tag || ctx.user.username}` }).then(() => true).catch(() => false);
    if (!ok) return ctx.replyError('Impossible de rendre ce salon visible.');
    await ctx.reply({ embeds: [successEmbed(`${channel} est de nouveau visible.`)] });
  },
};

const nukeCommand = {
  category: 'Moderation',
  cooldown: 10,
  aliases: ['recreate'],
  permissions: ['ManageChannels'],
  botPermissions: ['ManageChannels'],
  data: new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Recrée complètement un salon (supprime tous les messages).')
    .addChannelOption((option) => option.setName('salon').setDescription('Salon à recréer').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((option) => option.setName('raison').setDescription('Raison')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageChannels'], ['ManageChannels']))) return;
    const channel = await resolveTextChannel(ctx);
    if (!channel) return;

    const confirmed = await confirmAction(ctx, {
      title: 'Nuke du salon',
      description: `Le salon ${channel} va être **supprimé et recréé**. Tous ses messages seront perdus.\n\nCette action est irréversible.`,
      confirmLabel: 'Nuke le salon',
    });
    if (!confirmed) return;

    const reason = ctx.getString('raison')?.trim() || `Nuke par ${ctx.user.tag || ctx.user.username}`;
    try {
      const position = channel.position;
      const clone = await channel.clone({ reason });
      await clone.setPosition(position).catch(() => null);
      await clone.send({
        embeds: [baseEmbed({
          color: COLORS.moderation,
          title: '💥 Salon recréé',
          description: `Ce salon a été recréé par ${ctx.user}.\n**Raison :** ${reason}`,
          footer: 'Modération',
        })],
      }).catch(() => null);
      await channel.delete(reason);
    } catch (error) {
      await ctx.replyError(`Impossible de recréer ce salon : ${truncate(error.message, 200)}`);
    }
  },
};

const vcMuteCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['vcmute'],
  permissions: ['MuteMembers'],
  botPermissions: ['MuteMembers'],
  data: new SlashCommandBuilder()
    .setName('vc-mute')
    .setDescription('Rend muet un membre en vocal.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre à rendre muet').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Raison')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['MuteMembers'], ['MuteMembers']))) return;
    const member = await ctx.fetchMember('membre');
    if (!member?.voice?.channel) return ctx.replyError('Ce membre n’est pas connecté à un salon vocal.');
    if (!(await assertHierarchy(ctx, member, { action: 'rendre muet' }))) return;
    const reason = ctx.getString('raison')?.trim() || 'Aucune raison fournie';
    const ok = await member.voice.setMute(true, `${reason} — ${ctx.user.tag || ctx.user.username}`).then(() => true).catch(() => false);
    if (!ok) return ctx.replyError('Impossible de rendre muet ce membre.');
    await ctx.reply({ embeds: [successEmbed(`${member} a été rendu muet en vocal.`)] });
  },
};

const vcUnmuteCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['vcunmute'],
  permissions: ['MuteMembers'],
  botPermissions: ['MuteMembers'],
  data: new SlashCommandBuilder()
    .setName('vc-unmute')
    .setDescription('Rend la parole à un membre en vocal.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre à démuter').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Raison')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['MuteMembers'], ['MuteMembers']))) return;
    const member = await ctx.fetchMember('membre');
    if (!member?.voice?.channel) return ctx.replyError('Ce membre n’est pas connecté à un salon vocal.');
    const reason = ctx.getString('raison')?.trim() || 'Aucune raison fournie';
    const ok = await member.voice.setMute(false, `${reason} — ${ctx.user.tag || ctx.user.username}`).then(() => true).catch(() => false);
    if (!ok) return ctx.replyError('Impossible de démuter ce membre.');
    await ctx.reply({ embeds: [successEmbed(`${member} peut de nouveau parler en vocal.`)] });
  },
};

const vcKickCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['vckick', 'vcdisconnect'],
  permissions: ['MoveMembers'],
  botPermissions: ['MoveMembers'],
  data: new SlashCommandBuilder()
    .setName('vc-kick')
    .setDescription('Déconnecte un membre d’un salon vocal.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre à déconnecter').setRequired(true))
    .addStringOption((option) => option.setName('raison').setDescription('Raison')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['MoveMembers'], ['MoveMembers']))) return;
    const member = await ctx.fetchMember('membre');
    if (!member?.voice?.channel) return ctx.replyError('Ce membre n’est pas connecté à un salon vocal.');
    if (!(await assertHierarchy(ctx, member, { action: 'déconnecter' }))) return;
    const reason = ctx.getString('raison')?.trim() || 'Aucune raison fournie';
    const ok = await member.voice.disconnect(`${reason} — ${ctx.user.tag || ctx.user.username}`).then(() => true).catch(() => false);
    if (!ok) return ctx.replyError('Impossible de déconnecter ce membre.');
    await ctx.reply({ embeds: [successEmbed(`${member} a été déconnecté du vocal.`)] });
  },
};

const vcMoveCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['vcmove'],
  permissions: ['MoveMembers'],
  botPermissions: ['MoveMembers'],
  data: new SlashCommandBuilder()
    .setName('vc-move')
    .setDescription('Déplace un membre dans un autre salon vocal.')
    .addUserOption((option) => option.setName('membre').setDescription('Membre à déplacer').setRequired(true))
    .addChannelOption((option) => option.setName('salon').setDescription('Salon vocal de destination').setRequired(true).addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
    .addStringOption((option) => option.setName('raison').setDescription('Raison')),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['MoveMembers'], ['MoveMembers']))) return;
    const member = await ctx.fetchMember('membre');
    if (!member?.voice?.channel) return ctx.replyError('Ce membre n’est pas connecté à un salon vocal.');
    const channel = ctx.getChannel('salon');
    if (!channel) return ctx.replyError('Salon vocal introuvable.');
    if (!(await assertHierarchy(ctx, member, { action: 'déplacer' }))) return;
    const reason = ctx.getString('raison')?.trim() || 'Aucune raison fournie';
    const ok = await member.voice.setChannel(channel, `${reason} — ${ctx.user.tag || ctx.user.username}`).then(() => true).catch(() => false);
    if (!ok) return ctx.replyError('Impossible de déplacer ce membre.');
    await ctx.reply({ embeds: [successEmbed(`${member} a été déplacé dans ${channel}.`)] });
  },
};

const roleCommand = {
  category: 'Moderation',
  cooldown: 2,
  aliases: ['roles'],
  permissions: ['ManageRoles'],
  botPermissions: ['ManageRoles'],
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Ajoute ou retire un rôle à un membre.')
    .addSubcommand((sub) => sub
      .setName('add')
      .setDescription('Ajoute un rôle à un membre.')
      .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('Rôle à ajouter').setRequired(true))
      .addStringOption((option) => option.setName('raison').setDescription('Raison')))
    .addSubcommand((sub) => sub
      .setName('remove')
      .setDescription('Retire un rôle à un membre.')
      .addUserOption((option) => option.setName('membre').setDescription('Membre concerné').setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('Rôle à retirer').setRequired(true))
      .addStringOption((option) => option.setName('raison').setDescription('Raison'))),
  async execute(ctx) {
    if (!(await requirePermissions(ctx, ['ManageRoles'], ['ManageRoles']))) return;
    const member = await ctx.fetchMember('membre');
    const role = ctx.getRole('role');
    if (!member) return ctx.replyError('Membre introuvable sur ce serveur.');
    if (!role) return ctx.replyError('Rôle introuvable.');
    if (role.id === ctx.guild.roles.everyone.id) return ctx.replyError('Impossible de gérer le rôle @everyone.');
    if (role.managed) return ctx.replyError('Ce rôle est géré par une intégration et ne peut pas être attribué manuellement.');
    if (!(await assertHierarchy(ctx, member, { action: 'modifier les rôles de' }))) return;

    const me = ctx.guild.members.me;
    if (role.position >= me.roles.highest.position) {
      return ctx.replyError('Ce rôle est au-dessus de mon rôle le plus haut, je ne peux pas le gérer.');
    }
    if (ctx.user.id !== ctx.guild.ownerId && role.position >= ctx.member.roles.highest.position) {
      return ctx.replyError('Tu ne peux pas gérer un rôle égal ou supérieur à ton rôle le plus haut.');
    }

    const reason = ctx.getString('raison')?.trim() || `Commande rôle par ${ctx.user.tag || ctx.user.username}`;
    const isAdd = ctx.sub === 'add';
    const ok = isAdd
      ? await member.roles.add(role, reason).then(() => true).catch(() => false)
      : await member.roles.remove(role, reason).then(() => true).catch(() => false);
    if (!ok) return ctx.replyError(`Impossible de ${isAdd ? 'ajouter' : 'retirer'} ce rôle.`);

    await ctx.reply({
      embeds: [successEmbed(`Le rôle ${role} a été ${isAdd ? 'ajouté à' : 'retiré de'} ${member}.`)],
    });
  },
};

module.exports = [
  slowmodeCommand,
  lockCommand,
  unlockCommand,
  hideCommand,
  unhideCommand,
  nukeCommand,
  vcMuteCommand,
  vcUnmuteCommand,
  vcKickCommand,
  vcMoveCommand,
  roleCommand,
];
