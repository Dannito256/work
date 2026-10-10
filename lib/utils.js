import { config } from '../config/config.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const digits = (value) => String(value ?? '').replace(/\D/g, '');

export const normalizeJid = (jid) => {
  if (!jid || typeof jid !== 'string') return '';
  const [user, server] = jid.split('@');
  if (!server) return jid;
  return `${user.split(':')[0]}@${server}`;
};

export const jidToNumber = (jid) => {
  const normalized = normalizeJid(jid);
  if (!normalized) return '';
  return digits(normalized.split('@')[0]);
};

export const numberToJid = (number, server = 's.whatsapp.net') => {
  const clean = digits(number);
  return clean ? `${clean}@${server}` : '';
};

export const getSenderJid = (msg, sock) => {
  const key = msg?.key ?? {};
  if (key.fromMe && sock?.user?.id) return normalizeJid(sock.user.id);
  const candidates = [
    key.participantAlt,
    key.participant,
    key.remoteJidAlt,
    key.remoteJid
  ].filter(Boolean);
  for (const jid of candidates) {
    const normalized = normalizeJid(jid);
    if (normalized.endsWith('@s.whatsapp.net')) return normalized;
  }
  const first = normalizeJid(candidates[0] || '');
  if (first) return first;
  return normalizeJid(sock?.user?.id || '');
};

export const getSenderNumber = (msg, sock) => jidToNumber(getSenderJid(msg, sock));

export const isOwner = (jidOrNumber) => {
  if (!config.ownerNumber) return false;
  return digits(jidOrNumber) === config.ownerNumber;
};

export const formatDuration = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(Number(ms) / 1000));
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

export const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(2)} ${units[index]}`;
};

export const formatClock = (date = new Date(), timeZone) => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 19);
  }
};

export const formatDate = (date = new Date(), timeZone) => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: 'long',
      day: '2-digit',
      weekday: 'long'
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
};

export const truncate = (text, max = 1024) => {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
};

export const chunk = (array, size) => {
  const result = [];
  for (let i = 0; i < array.length; i += size) result.push(array.slice(i, i + size));
  return result;
};

export const randomItem = (array) => (Array.isArray(array) && array.length ? array[Math.floor(Math.random() * array.length)] : undefined);

export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const titleCase = (value) => String(value ?? '').replace(/\b\w/g, (c) => c.toUpperCase());

export const isUrl = (value) => {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const extractUrls = (text) => {
  const matches = String(text ?? '').match(/https?:\/\/[^\s<>"']+/gi);
  return matches ? matches.map((url) => url.replace(/[),.]+$/, '')) : [];
};

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/,
  /\.local$/i
];

export const isPrivateHost = (hostname) => {
  const host = String(hostname ?? '').toLowerCase();
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host));
};

export const assertSafeUrl = (value) => {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed');
  }
  if (isPrivateHost(url.hostname)) {
    throw new Error('Refusing to fetch a private or local address');
  }
  return url;
};

export const pickByKeys = (object, keys) => {
  if (!object || typeof object !== 'object') return undefined;
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null && object[key] !== '') return object[key];
  }
  return undefined;
};

export const deepFind = (object, keys) => {
  const wanted = new Set(keys);
  const seen = new Set();
  const queue = [object];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    for (const [key, value] of Object.entries(current)) {
      if (wanted.has(key) && value !== undefined && value !== null && value !== '') return value;
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return undefined;
};

export const parseCommand = (text, prefix = config.prefix) => {
  const value = String(text ?? '').trim();
  if (!value || !value.startsWith(prefix)) return null;
  const withoutPrefix = value.slice(prefix.length);
  const [rawCommand, ...rest] = withoutPrefix.split(/\s+/);
  if (!rawCommand) return null;
  return {
    command: rawCommand.toLowerCase(),
    args: rest,
    argString: rest.join(' '),
    full: withoutPrefix
  };
};

export const getMessageText = (msg) => {
  const message = msg?.message;
  if (!message) return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    message.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  ).toString();
};

export const getContentType = (message) => {
  if (!message) return undefined;
  const keys = Object.keys(message);
  return keys.find((key) => key !== 'senderKeyDistributionMessage' && key !== 'messageContextInfo');
};

export const unwrapMessage = (message) => {
  if (!message) return message;
  return (
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message ||
    message.documentWithCaptionMessage?.message ||
    message
  );
};

export const isMentioningEveryone = (text) => /@everyone|@all\b/i.test(String(text ?? ''));

export const parseTimeToMs = (input) => {
  const match = String(input ?? '').trim().match(/^(\d+)(s|m|h|d)?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = (match[2] || 'm').toLowerCase();
  const factors = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * factors[unit];
};

export const safeJsonParse = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const buildMentions = (jids) => jids.filter(Boolean).map(normalizeJid);

export const fetchWithTimeout = async (url, options = {}) => {
  const { timeoutMs = 30000, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...rest, signal: controller.signal });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Request timed out');
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const fetchJson = async (url, options = {}) => {
  const response = await fetchWithTimeout(url, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${truncate(text, 160)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Server returned an invalid JSON response');
  }
};

export const postFormJson = async (url, params, options = {}) => {
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(options.headers || {})
    },
    body: new URLSearchParams(params).toString(),
    timeoutMs: options.timeoutMs
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${truncate(text, 160)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Server returned an invalid JSON response');
  }
};

export const formatList = (items, { bullet = '-', limit = 50 } = {}) =>
  items.slice(0, limit).map((item) => `${bullet} ${item}`).join('\n');

export default {
  sleep,
  digits,
  normalizeJid,
  jidToNumber,
  numberToJid,
  getSenderJid,
  getSenderNumber,
  isOwner,
  formatDuration,
  formatBytes,
  formatClock,
  formatDate,
  truncate,
  chunk,
  randomItem,
  escapeRegex,
  titleCase,
  isUrl,
  extractUrls,
  isPrivateHost,
  assertSafeUrl,
  pickByKeys,
  deepFind,
  parseCommand,
  getMessageText,
  getContentType,
  unwrapMessage,
  isMentioningEveryone,
  parseTimeToMs,
  safeJsonParse,
  buildMentions,
  formatList
};
