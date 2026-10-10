import { config } from '../config/config.js';
import { jidToNumber, numberToJid, normalizeJid } from '../lib/utils.js';

const parseToggle = (value) => {
  if (value === undefined) return undefined;
  const normalized = String(value).toLowerCase();
  if (['on', 'enable', 'enabled', 'yes', 'true', '1'].includes(normalized)) return true;
  if (['off', 'disable', 'disabled', 'no', 'false', '0'].includes(normalized)) return false;
  return null;
};

const resolveTarget = (ctx) => {
  const mentioned = ctx.contextInfo?.mentionedJid || [];
  if (mentioned.length) return normalizeJid(mentioned[0]);
  if (ctx.quoted?.key?.participant) return normalizeJid(ctx.quoted.key.participant);
  const number = (ctx.args[0] || '').replace(/[^\d]/g, '');
  return number ? numberToJid(number) : null;
};

const toggleCommand = (name, key, label) => ({
  name,
  category: 'moderation',
  description: `Turn ${label} ${name === 'welcome' || name === 'goodbye' ? '' : 'for this group '}on or off`,
  usage: `.${name} on|off`,
  groupOnly: true,
  adminOnly: true,
  async run(ctx) {
    const requested = parseToggle(ctx.args[0]);
    if (requested === null) {
      await ctx.reply(`Usage: ${config.prefix}${name} on|off`);
      return;
    }
    const value = requested === undefined ? !ctx.store.group(ctx.chatId)[key] : requested;
    ctx.store.setFlag(ctx.chatId, key, value);
    await ctx.reply(`${label} is now ${value ? 'enabled' : 'disabled'}.`);
  }
});

const requireBotAdmin = async (ctx) => {
  if (!ctx.isBotAdmin) {
    await ctx.reply('I need to be an admin in this group to do that.');
    return false;
  }
  return true;
};

export default [
  toggleCommand('antilink', 'antilink', 'Anti-link'),
  toggleCommand('antispam', 'antispam', 'Anti-spam'),
  toggleCommand('welcome', 'welcome', 'Welcome messages'),
  toggleCommand('goodbye', 'goodbye', 'Goodbye messages'),
  toggleCommand('mute', 'mute', 'Mute (admins-only chat)'),
  {
    name: 'unmute',
    category: 'moderation',
    description: 'Allow everyone to chat again',
    usage: '.unmute',
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      ctx.store.setFlag(ctx.chatId, 'mute', false);
      await ctx.reply('Mute disabled. Everyone can chat again.');
    }
  },
  {
    name: 'lock',
    category: 'moderation',
    description: 'Lock the group so only admins can send messages',
    usage: '.lock',
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      if (!(await requireBotAdmin(ctx))) return;
      try {
        await ctx.sock.groupSettingUpdate(ctx.chatId, 'announcement');
        ctx.store.setFlag(ctx.chatId, 'locked', true);
        await ctx.reply('Group locked. Only admins can send messages.');
      } catch (error) {
        await ctx.reply(`Failed to lock group: ${error.message}`);
      }
    }
  },
  {
    name: 'unlock',
    category: 'moderation',
    description: 'Unlock the group so everyone can send messages',
    usage: '.unlock',
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      if (!(await requireBotAdmin(ctx))) return;
      try {
        await ctx.sock.groupSettingUpdate(ctx.chatId, 'not_announcement');
        ctx.store.setFlag(ctx.chatId, 'locked', false);
        await ctx.reply('Group unlocked. Everyone can send messages.');
      } catch (error) {
        await ctx.reply(`Failed to unlock group: ${error.message}`);
      }
    }
  },
  {
    name: 'delete',
    aliases: ['del'],
    category: 'moderation',
    description: 'Delete a message (reply to it)',
    usage: '.delete (reply to a message)',
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      const target = ctx.quoted?.key || ctx.msg.key;
      try {
        await ctx.sock.sendMessage(ctx.chatId, { delete: target });
      } catch (error) {
        await ctx.reply(`Could not delete the message: ${error.message}`);
      }
    }
  },
  {
    name: 'warn',
    category: 'moderation',
    description: 'Warn a member',
    usage: '.warn @user [reason]',
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      const target = resolveTarget(ctx);
      if (!target) {
        await ctx.reply(`Mention a user or reply to their message. Usage: ${config.prefix}warn @user [reason]`);
        return;
      }
      const count = ctx.store.addWarn(ctx.chatId, target);
      const limit = ctx.store.warnLimit(ctx.chatId);
      await ctx.send(`@${jidToNumber(target)} has been warned (${count}/${limit}).`, { mentions: [target] });
      if (count >= limit) {
        ctx.store.resetWarn(ctx.chatId, target);
        if (ctx.isBotAdmin) {
          await ctx.sock.groupParticipantsUpdate(ctx.chatId, [target], 'remove').catch(() => {});
          await ctx.send(`@${jidToNumber(target)} reached the warning limit and was removed.`, { mentions: [target] });
        } else {
          await ctx.reply('The warning limit was reached but I am not an admin, so I could not remove the member.');
        }
      }
    }
  },
  {
    name: 'warnings',
    aliases: ['warns'],
    category: 'moderation',
    description: 'Show warning records for this group',
    usage: '.warnings [@user]',
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      const target = resolveTarget(ctx);
      if (target) {
        await ctx
          .reply(`@${jidToNumber(target)} has ${ctx.store.warnCount(ctx.chatId, target)} warning(s).`, { mentions: [target] })
          .catch(() => {});
        return;
      }
      const warnings = ctx.store.warnings(ctx.chatId);
      const entries = Object.entries(warnings).filter(([, count]) => count > 0);
      if (!entries.length) {
        await ctx.reply('There are no warnings recorded in this group.');
        return;
      }
      const lines = entries.map(([jid, count]) => `+${jidToNumber(jid)}: ${count}`);
      await ctx.reply(`*Warnings:*\n${lines.join('\n')}`);
    }
  },
  {
    name: 'resetwarn',
    aliases: ['delwarn'],
    category: 'moderation',
    description: 'Reset warnings for a member',
    usage: '.resetwarn @user',
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      const target = resolveTarget(ctx);
      if (!target) {
        await ctx.reply(`Mention a user or reply to their message. Usage: ${config.prefix}resetwarn @user`);
        return;
      }
      ctx.store.resetWarn(ctx.chatId, target);
      await ctx.send(`Warnings reset for @${jidToNumber(target)}.`, { mentions: [target] });
    }
  },
  {
    name: 'clearwarn',
    aliases: ['clearwarnings'],
    category: 'moderation',
    description: 'Clear every warning in this group',
    usage: '.clearwarn',
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      ctx.store.resetWarn(ctx.chatId, null);
      await ctx.reply('All warnings in this group have been cleared.');
    }
  }
];
          
