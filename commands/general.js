import os from 'node:os';
import { config } from '../config/config.js';

const QUOTES = [
  'The best way to predict the future is to invent it. - Alan Kay',
  'Simplicity is the soul of efficiency. - Austin Freeman',
  'Talk is cheap. Show me the code. - Linus Torvalds',
  'Programs must be written for people to read. - Harold Abelson',
  'Premature optimization is the root of all evil. - Donald Knuth',
  'Code is like humor. When you have to explain it, it is bad. - Cory House',
  'First, solve the problem. Then, write the code. - John Johnson',
  'Any fool can write code that a computer can understand. - Martin Fowler',
  'Make it work, make it right, make it fast. - Kent Beck',
  'Experience is the name everyone gives to their mistakes. - Oscar Wilde'
];

const runtimeText = () => {
  const totalSeconds = Math.floor(process.uptime());
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
};

const buildMenu = (menu) => {
  const title = `*${config.botName} - Command Menu*`;
  const lines = [title, ''];
  for (const [category, commands] of menu) {
    lines.push(`*${category.toUpperCase()}*`);
    for (const command of commands) {
      lines.push(`  ${config.prefix}${command.name} - ${command.description}`);
    }
    lines.push('');
  }
  lines.push(`Prefix: ${config.prefix} | Total: ${menu.size} categories`);
  return lines.join('\n');
};

export default [
  {
    name: 'menu',
    aliases: ['commands'],
    category: 'general',
    description: 'Show every available command',
    usage: '.menu',
    async run(ctx) {
      await ctx.reply(buildMenu(ctx.menu()));
    }
  },
  {
    name: 'help',
    category: 'general',
    description: 'Show help for a specific command',
    usage: '.help <command>',
    async run(ctx) {
      const query = (ctx.args[0] || '').toLowerCase();
      if (!query) {
        await ctx.reply(`Use ${config.prefix}menu to see all commands, or ${config.prefix}help <command>.`);
        return;
      }
      const command = ctx.commands.find(
        (item) => item.name === query || (item.aliases || []).includes(query)
      );
      if (!command) {
        await ctx.reply(`No command named "${query}" was found.`);
        return;
      }
      const lines = [
        `*${config.prefix}${command.name}*`,
        command.description,
        `Usage: ${command.usage || `${config.prefix}${command.name}`}`,
        `Category: ${command.category}`,
        `Aliases: ${(command.aliases || []).join(', ') || 'none'}`
      ];
      await ctx.reply(lines.join('\n'));
    }
  },
  {
    name: 'ping',
    category: 'general',
    description: 'Check the bot response speed',
    usage: '.ping',
    async run(ctx) {
      const started = Date.now();
      const sent = await ctx.reply('Pinging...');
      const latency = Date.now() - started;
      await ctx.send(`Pong! Latency: ${latency}ms`, { quoted: sent });
    }
  },
  {
    name: 'alive',
    category: 'general',
    description: 'Check whether the bot is online',
    usage: '.alive',
    async run(ctx) {
      await ctx.reply(`${config.botName} is alive and online.\nUptime: ${runtimeText()}`);
    }
  },
  {
    name: 'runtime',
    category: 'general',
    description: 'Show how long the bot has been running',
    usage: '.runtime',
    async run(ctx) {
      await ctx.reply(`Runtime: ${runtimeText()}`);
    }
  },
  {
    name: 'owner',
    category: 'general',
    description: 'Show the bot owner contact',
    usage: '.owner',
    async run(ctx) {
      const contact = config.ownerNumber ? `+${config.ownerNumber}` : 'not configured';
      await ctx.reply(`*Owner:* ${config.ownerName}\n*Contact:* ${contact}`);
    }
  },
  {
    name: 'info',
    category: 'general',
    description: 'Show technical information about the bot',
    usage: '.info',
    async run(ctx) {
      const lines = [
        `*${config.botName}*`,
        `Prefix: ${config.prefix}`,
        `Commands: ${ctx.commands.length}`,
        `Node.js: ${process.version}`,
        `Platform: ${os.platform()} ${os.arch()}`,
        `Memory: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`,
        `Uptime: ${runtimeText()}`,
        `Library: Baileys 7.0.0-rc14`
      ];
      await ctx.reply(lines.join('\n'));
    }
  },
  {
    name: 'jid',
    category: 'general',
    description: 'Show the current chat and sender JIDs',
    usage: '.jid',
    async run(ctx) {
      const lines = [
        `Chat JID: ${ctx.chatId}`,
        `Sender JID: ${ctx.senderJid}`,
        `Sender number: ${ctx.senderNumber || 'unknown'}`,
        `Group: ${ctx.isGroup ? 'yes' : 'no'}`
      ];
      await ctx.reply(lines.join('\n'));
    }
  },
  {
    name: 'time',
    category: 'general',
    description: 'Show the current server date and time',
    usage: '.time',
    async run(ctx) {
      const now = new Date();
      const local = now.toLocaleString('en-GB', { hour12: false });
      await ctx.reply(`Server time: ${local}\nUTC: ${now.toISOString()}`);
    }
  },
  {
    name: 'quote',
    category: 'general',
    description: 'Send a random motivational quote',
    usage: '.quote',
    async run(ctx) {
      const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
      await ctx.reply(quote);
    }
  },
  {
    name: 'echo',
    category: 'general',
    description: 'Repeat the text you send',
    usage: '.echo <text>',
    async run(ctx) {
      const text = ctx.argString.trim();
      if (!text) {
        await ctx.reply(`Usage: ${config.prefix}echo <text>`);
        return;
      }
      await ctx.reply(text);
    }
  }
];
      
