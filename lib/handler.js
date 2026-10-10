import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../config/config.js';
import logger from './logger.js';
import store from './store.js';
import * as media from './media.js';
import * as utils from './utils.js';

const CONTEXTABLE_TYPES = [
  'extendedTextMessage',
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'documentMessage',
  'stickerMessage'
];

export class Handler {
  constructor() {
    this.commands = new Map();
    this.commandList = [];
    this.events = [];
    this.rateBuckets = new Map();
    this.spamBuckets = new Map();
  }

  async load() {
    await Promise.all([
      this.loadCommands(path.join(config.rootDir, 'commands')),
      this.loadEvents(path.join(config.rootDir, 'events'))
    ]);
    logger.info(`Loaded ${this.commandList.length} commands and ${this.events.length} event modules`);
    return this;
  }

  async loadCommands(directory) {
    let files = [];
    try {
      files = (await fsp.readdir(directory)).filter((file) => file.endsWith('.js'));
    } catch (error) {
      logger.warn({ err: error }, 'No commands directory found');
      return;
    }
    for (const file of files.sort()) {
      try {
        const module = await import(pathToFileURL(path.join(directory, file)).href);
        const exported = module.default ?? module.commands ?? [];
        const commands = Array.isArray(exported) ? exported : [exported];
        for (const command of commands) {
          if (!command?.name || typeof command.run !== 'function') continue;
          const record = { ...command, category: command.category || 'general' };
          this.commandList.push(record);
          for (const name of [record.name, ...(record.aliases || [])]) {
            this.commands.set(String(name).toLowerCase(), record);
          }
        }
      } catch (error) {
        logger.error({ err: error, file }, 'Failed to load command module');
      }
    }
  }

  async loadEvents(directory) {
    let files = [];
    try {
      files = (await fsp.readdir(directory)).filter((file) => file.endsWith('.js'));
    } catch {
      return;
    }
    for (const file of files.sort()) {
      try {
        const module = await import(pathToFileURL(path.join(directory, file)).href);
        const event = module.default;
        if (event && typeof event.handle === 'function') this.events.push(event);
      } catch (error) {
        logger.error({ err: error, file }, 'Failed to load event module');
      }
    }
  }

  getMenu() {
    const categories = new Map();
    for (const command of this.commandList) {
      if (command.hidden) continue;
      if (!categories.has(command.category)) categories.set(command.category, []);
      categories.get(command.category).push(command);
    }
    return categories;
  }

  get extra() {
    return { config, store, media, utils, logger, commands: this.commandList };
  }

  isRateLimited(key) {
    const now = Date.now();
    const bucket = (this.rateBuckets.get(key) || []).filter((time) => now - time < config.rateLimit.windowMs);
    if (bucket.length >= config.rateLimit.max) {
      this.rateBuckets.set(key, bucket);
      return true;
    }
    bucket.push(now);
    this.rateBuckets.set(key, bucket);
    return false;
  }

  checkSpam(key, max = 6, windowMs = 6000) {
    const now = Date.now();
    const bucket = (this.spamBuckets.get(key) || []).filter((time) => now - time < windowMs);
    bucket.push(now);
    this.spamBuckets.set(key, bucket);
    return bucket.length > max;
  }

  async onMessagesUpsert(payload, sock) {
    if (payload?.type !== 'notify') return;
    for (const msg of payload.messages || []) {
      try {
        await this.handleMessage(msg, sock);
      } catch (error) {
        logger.error({ err: error }, 'Error while handling message');
      }
    }
  }

  async handleMessage(msg, sock) {
    const chatId = msg?.key?.remoteJid;
    if (!chatId) return;
    if (chatId === 'status@broadcast') return;
    if (chatId.endsWith('@newsletter')) return;
    if (!msg.message) return;
    if (msg.message.protocolMessage) return;

    const normalized = utils.unwrapMessage(msg.message);
    if (!normalized) return;

    const isGroup = chatId.endsWith('@g.us');
    const text = utils.getMessageText({ message: normalized });
    const commandInfo = utils.parseCommand(text, config.prefix);

    const context = await this.buildContext(msg, sock, { text, commandInfo });
    if (!context) return;

    if (isGroup) {
      const moderationHandled = await this.runModeration(context);
      if (moderationHandled === 'stop') return;
    }

    if (!commandInfo) return;

    const command = this.commands.get(commandInfo.command);
    if (!command) return;

    if (!context.isOwner && this.isRateLimited(`${chatId}:${context.senderJid}`)) {
      logger.debug({ sender: context.senderJid }, 'Rate limited');
      return;
    }

    if (command.groupOnly && !isGroup) {
      await context.reply('This command can only be used inside a group.');
      return;
    }
    if (command.ownerOnly && !context.isOwner) {
      await context.reply('This command is restricted to the bot owner.');
      return;
    }
    if (command.adminOnly && !context.isGroupAdmin) {
      await context.reply('This command is restricted to group admins.');
      return;
    }

    try {
      await command.run(context);
    } catch (error) {
      logger.error({ err: error, command: command.name }, 'Command execution failed');
      await context
        .reply(`Something went wrong while running ${config.prefix}${command.name}: ${utils.truncate(error.message || String(error), 200)}`)
        .catch(() => {});
    }
  }

  async runModeration(context) {
    const { msg, sock, chatId, senderJid, text, isGroupAdmin, isOwner, isBotAdmin } = context;
    if (isGroupAdmin || isOwner) return false;

    const settings = store.group(chatId);

    if ((settings.antilink || settings.mute) && text) {
      const hasLink = utils.extractUrls(text).length > 0;
      const shouldDelete = (settings.antilink && hasLink) || settings.mute;
      if (shouldDelete) {
        if (isBotAdmin) {
          await sock.sendMessage(chatId, { delete: msg.key }).catch(() => {});
        }
        if (settings.antilink && hasLink) {
          const count = store.addWarn(chatId, senderJid);
          const limit = store.warnLimit(chatId);
          await context
            .reply(`Links are not allowed here. Warning ${count}/${limit}.`, { mentions: [senderJid] })
            .catch(() => {});
          if (count >= limit && isBotAdmin) {
            await sock.groupParticipantsUpdate(chatId, [senderJid], 'remove').catch(() => {});
            store.resetWarn(chatId, senderJid);
          }
        }
        if (settings.mute && !(settings.antilink && hasLink)) {
          await context.reply('This group is muted. Only admins can send messages.', { mentions: [senderJid] }).catch(() => {});
        }
        return 'stop';
      }
    }

    if (settings.antispam) {
      const spamKey = `${chatId}:${senderJid}`;
      if (this.checkSpam(spamKey)) {
        this.spamBuckets.set(spamKey, []);
        if (isBotAdmin) {
          await sock.sendMessage(chatId, { delete: msg.key }).catch(() => {});
        }
        const count = store.addWarn(chatId, senderJid);
        const limit = store.warnLimit(chatId);
        await context.reply(`Stop spamming. Warning ${count}/${limit}.`, { mentions: [senderJid] }).catch(() => {});
        if (count >= limit && isBotAdmin) {
          await sock.groupParticipantsUpdate(chatId, [senderJid], 'remove').catch(() => {});
          store.resetWarn(chatId, senderJid);
        }
        return 'stop';
      }
    }

    return false;
  }

  extractContextInfo(msg) {
    const content = utils.unwrapMessage(msg.message) || {};
    for (const type of CONTEXTABLE_TYPES) {
      const info = content[type]?.contextInfo;
      if (info) return info;
    }
    return content.extendedTextMessage?.contextInfo || null;
  }

  async buildContext(msg, sock, extras) {
    const chatId = msg.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');
    const senderJid = utils.getSenderJid(msg, sock);
    const senderNumber = utils.jidToNumber(senderJid);
    const pushName = msg.pushName || '';
    const botJid = utils.normalizeJid(sock.user?.id || '');
    const botNumber = utils.jidToNumber(botJid);
    const isOwner = utils.isOwner(senderNumber) || utils.isOwner(senderJid);

    let groupMetadata = null;
    let isGroupAdmin = isOwner;
    let isBotAdmin = false;

    if (isGroup) {
      try {
        groupMetadata = await sock.groupMetadata(chatId);
      } catch (error) {
        logger.debug({ err: error, chatId }, 'Could not fetch group metadata');
      }
      const participants = groupMetadata?.participants || [];
      const isAdminEntry = (entry) => entry?.admin === 'admin' || entry?.admin === 'superadmin';
      const match = (jid) => participants.find((p) => utils.normalizeJid(p.id) === utils.normalizeJid(jid));
      const senderEntry = match(senderJid) || participants.find((p) => utils.jidToNumber(p.id) === senderNumber);
      const botEntry = match(botJid) || participants.find((p) => utils.jidToNumber(p.id) === botNumber);
      if (!isOwner) isGroupAdmin = isAdminEntry(senderEntry);
      isBotAdmin = isAdminEntry(botEntry);
    }

    const contextInfo = this.extractContextInfo(msg);
    let quoted = null;
    if (contextInfo?.stanzaId) {
      const participant = utils.normalizeJid(contextInfo.participant || '');
      quoted = {
        key: {
          remoteJid: chatId,
          fromMe: Boolean(participant && participant === botJid),
          id: contextInfo.stanzaId,
          ...(isGroup && participant ? { participant } : {})
        },
        message: contextInfo.quotedMessage
      };
    }

    const send = async (content, options = {}) => {
      const quotedOption = 'quoted' in options ? options.quoted : msg;
      const payload = typeof content === 'string' ? { text: content } : { ...content };
      if (options.mentions) payload.mentions = options.mentions;
      return sock.sendMessage(chatId, payload, { quoted: quotedOption });
    };

    return {
      sock,
      msg,
      chatId,
      isGroup,
      groupMetadata,
      senderJid,
      senderNumber,
      pushName,
      botJid,
      botNumber,
      isOwner,
      isGroupAdmin,
      isBotAdmin,
      quoted,
      contextInfo,
      reply: send,
      send,
      react: (emoji) => sock.sendMessage(chatId, { react: { text: emoji, key: msg.key } }),
      delete: (key = msg.key) => sock.sendMessage(chatId, { delete: key }),
      text: extras.text ?? '',
      commandInfo: extras.commandInfo ?? null,
      args: extras.commandInfo?.args ?? [],
      argString: extras.commandInfo?.argString ?? '',
      command: extras.commandInfo?.command ?? '',
      prefix: config.prefix,
      config,
      store,
      media,
      utils,
      logger,
      commands: this.commandList,
      menu: () => this.getMenu()
    };
  }

  async onGroupParticipantsUpdate(payload, sock) {
    for (const event of this.events) {
      try {
        await event.handle(payload, sock, this.extra);
      } catch (error) {
        logger.error({ err: error, event: event.name }, 'Event handler failed');
      }
    }
  }

  onGroupsUpdate() {}
}

export default Handler;
      
