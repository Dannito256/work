import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import { config } from '../config/config.js';

const require = createRequire(import.meta.url);
const execAsync = promisify(exec);
const axios = require('axios');

const cooldowns = new Map();

const AsyncFunction = Object.getPrototypeOf(async function () {})
.constructor;

function checkCooldown(ctx, command, seconds) {
const key = "${ctx.chatId}:${ctx.senderJid}:${command}";
const now = Date.now();
const expires = cooldowns.get(key) || 0;

if (now < expires) {
return Math.ceil((expires - now) / 1000);
}

cooldowns.set(key, now + seconds * 1000);
return 0;
}

async function requireOwner(ctx) {
if (ctx.isOwner) return true;

await ctx.reply('This command is restricted to the bot owner.');
return false;
}

async function sendOutput(ctx, output, filename = 'output') {
output = String(output ?? '(empty output)');

if (output.length > 4000) {
const buffer = Buffer.from(output, 'utf8');

await ctx.sock.sendMessage(
  ctx.chatId,
  {
    document: buffer,
    mimetype: 'text/plain',
    fileName: `${filename}.txt`
  },
  { quoted: ctx.msg }
);

return;

}

await ctx.send("\"``\n${output}\n````);
}

function inspectResult(result) {
if (result === undefined || result === null) {
return 'Executed successfully (no return value)';
}

if (typeof result === 'string') return result;

if (typeof result === 'object') {
return util.inspect(result, {
depth: 4,
colors: false,
maxArrayLength: 100
});
}

return String(result);
}

export default [
{
name: 'eval',
aliases: ['e', 'run'],
category: 'owner',
description: 'Execute JavaScript code',
usage: '.eval <JavaScript code>',
ownerOnly: true,
cooldown: 3,

async run(ctx) {
  if (!(await requireOwner(ctx))) return;

  const remaining = checkCooldown(ctx, 'eval', 3);
  if (remaining) {
    return ctx.reply(`Please wait ${remaining}s before using eval again.`);
  }

  const { argString: q } = ctx;

  if (!q?.trim()) {
    return ctx.reply(
      `Please provide JavaScript code.\nExample: ${ctx.prefix}eval process.version`
    );
  }

  try {
    await ctx.react('⏳').catch(() => {});

    const evalContext = {
      pushName: ctx.pushName || '',
      sender: ctx.senderJid,
      owner: ctx.isOwner,
      isSuperUser: ctx.isOwner,
      isAdmin: ctx.isGroupAdmin,
      isGroup: ctx.isGroup,
      isChannel: ctx.chatId.endsWith('@newsletter'),
      isPrivate: !ctx.isGroup,
      userId: ctx.senderJid,
      chatId: ctx.chatId,
      q,
      args: ctx.args,
      messageReply: ctx.quoted,
      botName: config.botName || 'WhatsApp Bot',
      prefix: ctx.prefix,
      ownerName: config.ownerName || 'Owner',
      timezone: config.timezone || 'UTC',
      sourceUrl: '',
      reply: ctx.reply,
      sendMessage: ctx.send,
      react: ctx.react,
      Gifted: ctx.sock,
      sock: ctx.sock,
      conText: ctx,
      ctx,
      msg: ctx.msg,
      require,
      process,
      axios,
      fs,
      path,
      config,
      util,
      execAsync
    };

    let code = q.trim();

    const isExpression =
      !code.includes(';') &&
      !/\breturn\b/.test(code) &&
      !code.includes('{');

    if (isExpression) {
      code = `return (${code});`;
    }

    const fn = new AsyncFunction(
      ...Object.keys(evalContext),
      code
    );

    const result = await fn(...Object.values(evalContext));
    const output = inspectResult(result);

    await sendOutput(ctx, output, 'eval');
    await ctx.react('✅').catch(() => {});
  } catch (error) {
    await ctx.react('❌').catch(() => {});
    await sendOutput(
      ctx,
      `Error: ${error.stack || error.message || String(error)}`,
      'eval_error'
    );
  }
}

},

{
name: 'shell',
aliases: ['exec', 'terminal', 'sh'],
category: 'owner',
description: 'Execute Termux shell commands',
usage: '.shell <command>',
ownerOnly: true,
cooldown: 5,

async run(ctx) {
  if (!(await requireOwner(ctx))) return;

  const remaining = checkCooldown(ctx, 'shell', 5);
  if (remaining) {
    return ctx.reply(`Please wait ${remaining}s before using shell again.`);
  }

  const command = ctx.argString?.trim();

  if (!command) {
    return ctx.reply(
      `Please provide a shell command.\nExample: ${ctx.prefix}shell pwd`
    );
  }

  try {
    await ctx.react('⏳').catch(() => {});

    const { stdout, stderr } = await execAsync(command, {
      cwd: config.rootDir,
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8'
    });

    let output = '';

    if (stdout) output += stdout;
    if (stderr) {
      output += `${output ? '\n\n' : ''}stderr:\n${stderr}`;
    }

    if (!output.trim()) {
      output = 'Command executed successfully (no output).';
    }

    await sendOutput(ctx, output, 'shell');
    await ctx.react('✅').catch(() => {});
  } catch (error) {
    let message = error.message || String(error);

    if (error.killed) {
      message = 'Command was terminated because it timed out.';
    } else if (error.code === 'ENOENT') {
      message = 'Shell or executable not found.';
    }

    const details = [
      error.stdout ? `stdout:\n${error.stdout}` : '',
      error.stderr ? `stderr:\n${error.stderr}` : '',
      `Error: ${message}`
    ].filter(Boolean).join('\n\n');

    await ctx.react('❌').catch(() => {});
    await sendOutput(ctx, details, 'shell_error');
  }
}

}
];
