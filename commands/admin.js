import { config } from '../config/config.js';
import { jidToNumber, numberToJid, normalizeJid, isOwner } from '../lib/utils.js';

const resolveTargets = (ctx) => {
  const mentioned = ctx.contextInfo?.mentionedJid || [];
  if (mentioned.length) return mentioned.map(normalizeJid);
  if (ctx.quoted?.key?.participant) return [normalizeJid(ctx.quoted.key.participant)];
  const numbers = ctx.args.map((arg) => arg.replace(/[^\d]/g, '')).filter(Boolean);
  return numbers.map((number) => numberToJid(number));
};

const requireBotAdmin = async (ctx) => {
  if (!ctx.isBotAdmin) {
    await ctx.reply('I need to be an admin in this group to do that.');
    return false;
  }
  return true;
};

const performParticipantAction = (action) => ({
  category: 'admin',
  groupOnly: true,
  adminOnly: true,
  usage: `.${action} @user`,
  async run(ctx) {
    if (!(await requireBotAdmin(ctx))) return;
    const targets = resolveTargets(ctx);
    if (!targets.length) {
      await ctx.reply(`Mention a user, reply to their message, or provide a number. Usage: ${config.prefix}${action} @user`);
      return;
    }
    const filtered = targets.filter((jid) => !isOwner(jid));
    if (!filtered.length) {
      await ctx.reply('I cannot perform that action on the bot owner.');
      return;
    }
    try {
      await ctx.sock.groupParticipantsUpdate(ctx.chatId, filtered, action === 'kick' ? 'remove' : action);
      const verb = { promote: 'Promoted', demote: 'Demoted', kick: 'Removed' }[action];
      await ctx.send(`${verb}: ${filtered.map((jid) => `+${jidToNumber(jid)}`).join(', ')}`, { mentions: filtered });
    } catch (error) {
      await ctx.reply(`Failed to ${action}: ${error.message}`);
    }
  }
});

export default [
  { name: 'promote', ...performParticipantAction('promote'), description: 'Give admin rights to a member' },
  { name: 'demote', ...performParticipantAction('demote'), description: 'Remove admin rights from a member' },
  { name: 'kick', ...performParticipantAction('kick'), description: 'Remove a member from the group' },
  {
    name: 'add',
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    description: 'Add a user to the group',
    usage: '.add <number>',
    async run(ctx) {
      if (!(await requireBotAdmin(ctx))) return;
      const number = (ctx.args[0] || '').replace(/[^\d]/g, '');
      if (!number) {
        await ctx.reply(`Usage: ${config.prefix}add <number with country code>`);
        return;
      }
      const jid = numberToJid(number);
      try {
        await ctx.sock.groupParticipantsUpdate(ctx.chatId, [jid], 'add');
        await ctx.reply(`Added +${number}`);
      } catch (error) {
        await ctx.reply(`Failed to add +${number}: ${error.message}`);
      }
    }
  },
  {
    name: 'setname',
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    description: 'Change the group name',
    usage: '.setname <new name>',
    async run(ctx) {
      if (!(await requireBotAdmin(ctx))) return;
      const name = ctx.argString.trim();
      if (!name) {
        await ctx.reply(`Usage: ${config.prefix}setname <new name>`);
        return;
      }
      try {
        await ctx.sock.groupUpdateSubject(ctx.chatId, name.slice(0, 100));
        await ctx.reply(`Group name updated to: ${name}`);
      } catch (error) {
        await ctx.reply(`Failed to update name: ${error.message}`);
      }
    }
  },
  {
    name: 'setdesc',
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    description: 'Change the group description',
    usage: '.setdesc <new description>',
    async run(ctx) {
      if (!(await requireBotAdmin(ctx))) return;
      const description = ctx.argString.trim();
      try {
        await ctx.sock.groupUpdateDescription(ctx.chatId, description);
        await ctx.reply('Group description updated.');
      } catch (error) {
        await ctx.reply(`Failed to update description: ${error.message}`);
      }
    }
  },
  {
    name: 'link',
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    description: 'Get the group invite link',
    usage: '.link',
    async run(ctx) {
      if (!(await requireBotAdmin(ctx))) return;
      try {
        const code = await ctx.sock.groupInviteCode(ctx.chatId);
        await ctx.reply(code ? `https://chat.whatsapp.com/${code}` : 'Could not fetch the invite link.');
      } catch (error) {
        await ctx.reply(`Failed to fetch link: ${error.message}`);
      }
    }
  },
  {
    name: 'revoke',
    category: 'admin',
    groupOnly: true,
    adminOnly: true,
    description: 'Revoke and reset the group invite link',
    usage: '.revoke',
    async run(ctx) {
      if (!(await requireBotAdmin(ctx))) return;
      try {
        const code = await ctx.sock.groupRevokeInvite(ctx.chatId);
        await ctx.reply(code ? `New invite link: https://chat.whatsapp.com/${code}` : 'Invite link revoked.');
      } catch (error) {
        await ctx.reply(`Failed to revoke link: ${error.message}`);
      }
    }
  }
];
    
