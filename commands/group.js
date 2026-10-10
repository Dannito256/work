import { config } from '../config/config.js';
import { jidToNumber, normalizeJid, truncate } from '../lib/utils.js';

const adminOf = (participant) => participant.admin === 'admin' || participant.admin === 'superadmin';

export default [
  {
    name: 'groupinfo',
    aliases: ['ginfo'],
    category: 'group',
    description: 'Show information about the current group',
    usage: '.groupinfo',
    groupOnly: true,
    async run(ctx) {
      const meta = ctx.groupMetadata;
      if (!meta) {
        await ctx.reply('Could not read the group metadata.');
        return;
      }
      const admins = (meta.participants || []).filter(adminOf);
      const created = meta.creation ? new Date(Number(meta.creation) * 1000).toUTCString() : 'unknown';
      const lines = [
        `*Group:* ${meta.subject || 'unknown'}`,
        `*JID:* ${meta.id}`,
        `*Owner:* ${meta.owner ? jidToNumber(meta.owner) : 'unknown'}`,
        `*Created:* ${created}`,
        `*Members:* ${(meta.participants || []).length}`,
        `*Admins:* ${admins.length}`,
        `*Announce:* ${meta.announce ? 'yes' : 'no'}`,
        `*Locked:* ${meta.restrict ? 'yes' : 'no'}`,
        `*Description:* ${truncate(meta.desc || 'none', 300)}`
      ];
      await ctx.reply(lines.join('\n'));
    }
  },
  {
    name: 'admins',
    category: 'group',
    description: 'List the group admins',
    usage: '.admins',
    groupOnly: true,
    async run(ctx) {
      const participants = ctx.groupMetadata?.participants || [];
      const admins = participants.filter(adminOf);
      if (!admins.length) {
        await ctx.reply('No admins were found.');
        return;
      }
      const mentions = admins.map((admin) => normalizeJid(admin.id));
      const lines = admins.map((admin, index) => {
        const label = admin.admin === 'superadmin' ? 'owner' : 'admin';
        return `${index + 1}. @${jidToNumber(admin.id)} (${label})`;
      });
      await ctx.reply(`*Group admins (${admins.length}):*\n${lines.join('\n')}`, { mentions });
    }
  },
  {
    name: 'members',
    category: 'group',
    description: 'List the group members',
    usage: '.members',
    groupOnly: true,
    async run(ctx) {
      const participants = ctx.groupMetadata?.participants || [];
      if (!participants.length) {
        await ctx.reply('No members were found.');
        return;
      }
      const lines = participants.map((member, index) => {
        const label = adminOf(member) ? ' (admin)' : '';
        return `${index + 1}. +${jidToNumber(member.id)}${label}`;
      });
      await ctx.send(`*Members (${participants.length}):*\n${lines.join('\n')}`);
    }
  },
  {
    name: 'tagall',
    aliases: ['everyone'],
    category: 'group',
    description: 'Mention every member of the group',
    usage: '.tagall [message]',
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      const participants = ctx.groupMetadata?.participants || [];
      if (!participants.length) {
        await ctx.reply('No members to tag.');
        return;
      }
      const mentions = participants.map((member) => normalizeJid(member.id));
      const tags = participants.map((member) => `@${jidToNumber(member.id)}`);
      const note = ctx.argString.trim() || 'Attention everyone!';
      await ctx.send(`${note}\n\n${tags.join(' ')}`, { mentions });
    }
  },
  {
    name: 'hidetag',
    category: 'group',
    description: 'Mention everyone without showing the tags',
    usage: '.hidetag [message]',
    groupOnly: true,
    adminOnly: true,
    async run(ctx) {
      const participants = ctx.groupMetadata?.participants || [];
      if (!participants.length) {
        await ctx.reply('No members to tag.');
        return;
      }
      const mentions = participants.map((member) => normalizeJid(member.id));
      const note = ctx.argString.trim() || `Attention from ${config.botName}`;
      await ctx.send(note, { mentions });
    }
  }
];
      
