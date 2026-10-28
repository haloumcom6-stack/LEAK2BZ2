'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { COLORS, EMOJI } = require('../core/constants');
const { baseEmbed, infoEmbed } = require('../core/embeds');
const { randomInt, pick, progressBar } = require('../core/utils');

const EIGHT_BALL = [
  'Oui, absolument.', 'Non, jamais.', 'Peut-être…', 'Je ne pense pas.', 'C’est certain !',
  'Demande-moi plus tard.', 'Sans aucun doute.', 'Très douteux.', 'Les astres disent oui.',
  'Les astres disent non.', 'Compte là-dessus et bois de l’eau.', 'Fonce, tu ne le regretteras pas.',
  'Mauvaise idée.', 'Excellente idée !', 'La réponse est dans ton cœur.',
  'Impossible de répondre pour le moment.', 'Oui, mais avec prudence.', 'Non, mais tu peux réessayer.',
];

const JOKES = [
  'Pourquoi les développeurs préfèrent-ils le noir ? Parce que la lumière attire les bugs.',
  'Un SQL entre dans un bar, s’approche de deux tables et demande : « Je peux me joindre à vous ? »',
  'Pourquoi le bot Discord ne s’est-il jamais marié ? Il avait peur de l’engagement… des permissions.',
  'Qu’est-ce qu’un développeur qui ne code pas ? Un développeur qui documente. (Ça n’existe pas.)',
  'Pourquoi les bugs sont-ils si forts ? Parce qu’ils ont des années d’expérience.',
  'Comment appelle-t-on un algorithme qui a faim ? Un algo-rythme.',
  'Pourquoi le Wi-Fi est-il toujours fatigué ? Il a trop de connexions.',
  'Un octet demande à un autre : « Tu as mal ? » L’autre répond : « Oui, j’ai un bit. »',
  'Pourquoi les modérateurs aiment-ils les jardins ? Pour faire du désherbage de messages.',
  'Qu’est-ce qui est jaune et qui attend ? Un citron dans une file d’attente.',
  'Pourquoi le serveur Discord était-il calme ? Parce que tout le monde était en mute.',
  'Quand un giveaway se termine, qui pleure ? Les participants… et le bot qui doit tirer au sort.',
];

const eightBallCommand = {
  category: 'Fun',
  cooldown: 2,
  aliases: ['8ball', 'boule'],
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Pose une question à la boule magique.')
    .addStringOption((option) => option.setName('question').setDescription('Ta question').setRequired(true).setMaxLength(300)),
  async execute(ctx) {
    await ctx.reply({
      embeds: [baseEmbed({
        color: COLORS.primary,
        title: '🎱 La boule magique',
        description: `**Question :** ${ctx.getString('question')}\n\n**Réponse :** ${pick(EIGHT_BALL)}`,
        footer: '8ball',
      })],
    });
  },
};

const diceCommand = {
  category: 'Fun',
  cooldown: 2,
  aliases: ['de', 'dé'],
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Lance un dé.')
    .addIntegerOption((option) => option.setName('faces').setDescription('Nombre de faces (2-1000)').setMinValue(2).setMaxValue(1000)),
  async execute(ctx) {
    const faces = ctx.getInteger('faces') || 6;
    await ctx.reply({
      embeds: [baseEmbed({
        color: COLORS.primary,
        title: `🎲 Dé à ${faces} faces`,
        description: `# ${randomInt(1, faces)}`,
        footer: 'Dé',
      })],
    });
  },
};

const coinflipCommand = {
  category: 'Fun',
  cooldown: 2,
  aliases: ['pileouface', 'cf'],
  data: new SlashCommandBuilder().setName('coinflip').setDescription('Lance une pièce.'),
  async execute(ctx) {
    const result = Math.random() < 0.5 ? 'Pile' : 'Face';
    await ctx.reply({
      embeds: [baseEmbed({
        color: COLORS.primary,
        title: '🪙 Pile ou face',
        description: `La pièce est tombée sur **${result}** !`,
        footer: 'Pièce',
      })],
    });
  },
};

const rpsCommand = {
  category: 'Fun',
  cooldown: 2,
  aliases: ['pfc'],
  data: new SlashCommandBuilder()
    .setName('rps')
    .setDescription('Joue à pierre-feuille-ciseaux.')
    .addStringOption((option) => option.setName('choix').setDescription('Ton choix').setRequired(true).addChoices(
      { name: 'Pierre', value: 'pierre' },
      { name: 'Feuille', value: 'feuille' },
      { name: 'Ciseaux', value: 'ciseaux' },
    )),
  async execute(ctx) {
    const choices = ['pierre', 'feuille', 'ciseaux'];
    const emojis = { pierre: '🪨', feuille: '📄', ciseaux: '✂️' };
    const userChoice = ctx.getString('choix');
    const botChoice = pick(choices);
    let result;
    if (userChoice === botChoice) result = '🤝 Égalité !';
    else if ((userChoice === 'pierre' && botChoice === 'ciseaux')
      || (userChoice === 'feuille' && botChoice === 'pierre')
      || (userChoice === 'ciseaux' && botChoice === 'feuille')) result = '🎉 Tu as gagné !';
    else result = '🤖 J’ai gagné !';

    await ctx.reply({
      embeds: [baseEmbed({
        color: COLORS.primary,
        title: '🎮 Pierre-Feuille-Ciseaux',
        description: `**Toi :** ${emojis[userChoice]} ${userChoice}\n**Moi :** ${emojis[botChoice]} ${botChoice}\n\n**${result}**`,
        footer: 'Mini-jeu',
      })],
    });
  },
};

const chooseCommand = {
  category: 'Fun',
  cooldown: 2,
  aliases: ['choisir'],
  data: new SlashCommandBuilder()
    .setName('choose')
    .setDescription('Choisis une option au hasard.')
    .addStringOption((option) => option.setName('options').setDescription('Options séparées par des virgules').setRequired(true).setMaxLength(1000)),
  async execute(ctx) {
    const options = ctx.getString('options').split(/[,;]+/).map((option) => option.trim()).filter(Boolean);
    if (options.length < 2) return ctx.reply({ embeds: [infoEmbed('Donne au moins deux options séparées par une virgule.')] });
    await ctx.reply({
      embeds: [baseEmbed({
        color: COLORS.primary,
        title: '🎯 J’ai choisi…',
        description: `# ${pick(options)}`,
        footer: `${options.length} options`,
      })],
    });
  },
};

const shipCommand = {
  category: 'Fun',
  cooldown: 3,
  aliases: ['amour'],
  data: new SlashCommandBuilder()
    .setName('ship')
    .setDescription('Calcule la compatibilité entre deux membres.')
    .addUserOption((option) => option.setName('membre1').setDescription('Premier membre').setRequired(true))
    .addUserOption((option) => option.setName('membre2').setDescription('Second membre (par défaut : toi)')),
  async execute(ctx) {
    const first = ctx.getUser('membre1');
    const second = ctx.getUser('membre2') || ctx.user;
    if (!first) return ctx.reply({ embeds: [infoEmbed('Membre introuvable.')] });

    const seed = `${[first.id, second.id].sort().join('-')}`;
    let hash = 0;
    for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 101;
    const percent = hash;
    const comment = percent >= 90 ? '💞 Âmes sœurs !'
      : percent >= 70 ? '❤️ Très compatible !'
        : percent >= 50 ? '💛 Ça peut marcher…'
          : percent >= 25 ? '🤔 Il va falloir travailler.'
            : '💔 Amitié seulement !';

    await ctx.reply({
      embeds: [baseEmbed({
        color: COLORS.giveaway,
        title: '💘 Test de compatibilité',
        description: `${first} + ${second}\n\n${progressBar(percent, 100, 20, '❤️', '🖤')} **${percent}%**\n\n${comment}`,
        footer: 'Ship',
      })],
    });
  },
};

const jokeCommand = {
  category: 'Fun',
  cooldown: 2,
  aliases: ['blague'],
  data: new SlashCommandBuilder().setName('joke').setDescription('Raconte une blague.'),
  async execute(ctx) {
    await ctx.reply({ embeds: [baseEmbed({ color: COLORS.primary, title: '😂 Blague', description: pick(JOKES), footer: 'Humour' })] });
  },
};

module.exports = [
  eightBallCommand,
  diceCommand,
  coinflipCommand,
  rpsCommand,
  chooseCommand,
  shipCommand,
  jokeCommand,
];
