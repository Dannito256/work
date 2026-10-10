import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from '../config/config.js';
import logger from './logger.js';
import { assertSafeUrl, formatBytes, truncate } from './utils.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const EXTENSIONS = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

export const ensureTempDir = async () => {
  await fsp.mkdir(config.tempDir, { recursive: true });
  return config.tempDir;
};

const tempName = (extension, prefix = 'media') => {
  const id = `${Date.now()}-${crypto.randomUUID()}`;
  return prefix ? `${prefix}-${id}${extension ? `.${extension}` : ''}` : id;
};

export const extensionFor = (contentType, fallback = 'bin') => {
  const base = String(contentType || '').split(';')[0].trim().toLowerCase();
  return EXTENSIONS[base] || fallback;
};

export const cleanupFiles = async (...files) => {
  await Promise.all(
    files.flat().filter(Boolean).map(async (file) => {
      try {
        await fsp.unlink(file);
      } catch (error) {
        if (error.code !== 'ENOENT') logger.debug({ err: error, file }, 'Temp cleanup skipped');
      }
    })
  );
};

export const downloadToFile = async (url, options = {}) => {
  const {
    headers = {},
    referer,
    timeoutMs = config.media.downloadTimeoutMs,
    maxBytes = config.media.maxSizeBytes,
    prefix = 'media'
  } = options;

  const target = assertSafeUrl(url);
  await ensureTempDir();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let filePath;

  try {
    const response = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: '*/*',
        ...(referer ? { referer } : {}),
        ...headers
      }
    });

    if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}`);
    if (!response.body) throw new Error('Empty response body');

    const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim();
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength && declaredLength > maxBytes) {
      throw new Error(`File is too large (${formatBytes(declaredLength)})`);
    }

    filePath = path.join(config.tempDir, tempName(extensionFor(contentType, ''), prefix));
    let received = 0;
    const limiter = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        if (received > maxBytes) {
          callback(new Error(`File exceeds the ${formatBytes(maxBytes)} limit`));
          return;
        }
        callback(null, chunk);
      }
    });

    await pipeline(Readable.fromWeb(response.body), limiter, fs.createWriteStream(filePath));
    return { filePath, size: received, contentType, extension: extensionFor(contentType, 'bin') };
  } catch (error) {
    if (filePath) await cleanupFiles(filePath);
    if (error.name === 'AbortError') throw new Error('Download timed out');
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const readHead = async (filePath, length = 16) => {
  const handle = await fsp.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return buffer;
  } finally {
    await handle.close();
  }
};

export const detectMediaKind = async (filePath) => {
  const head = await readHead(filePath, 16);
  const ascii = head.toString('latin1');
  const isMp4 = ascii.slice(4, 8) === 'ftyp';
  const isId3 = ascii.slice(0, 3) === 'ID3';
  const isMpegAudio = head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
  const isOgg = ascii.slice(0, 4) === 'OggS';
  const isWebm = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  const isJpeg = head[0] === 0xff && head[1] === 0xd8;
  const isPng = head[0] === 0x89 && ascii.slice(1, 4) === 'PNG';

  return {
    isMp3: isId3 || isMpegAudio,
    isMp4,
    isOgg,
    isWebm,
    isJpeg,
    isPng,
    isAudio: isId3 || isMpegAudio || isOgg,
    isVideo: isMp4 || isWebm
  };
};

const resolveBuffer = async (file) => {
  if (Buffer.isBuffer(file)) return file;
  return fsp.readFile(file);
};

const assertDelivery = (result, label) => {
  if (!result || !result.key || !result.key.id) {
    throw new Error(`${label} delivery failed`);
  }
  return result;
};

export const sendAudio = async (sock, jid, file, options = {}) => {
  const buffer = await resolveBuffer(file);
  const result = await sock.sendMessage(
    jid,
    {
      audio: buffer,
      mimetype: options.mimetype || 'audio/mpeg',
      ptt: Boolean(options.ptt),
      fileName: options.fileName,
      seconds: options.seconds
    },
    { quoted: options.quoted }
  );
  return assertDelivery(result, 'Audio');
};

export const sendVideo = async (sock, jid, file, options = {}) => {
  const buffer = await resolveBuffer(file);
  const result = await sock.sendMessage(
    jid,
    {
      video: buffer,
      mimetype: options.mimetype || 'video/mp4',
      caption: options.caption,
      fileName: options.fileName,
      gifPlayback: Boolean(options.gifPlayback)
    },
    { quoted: options.quoted }
  );
  return assertDelivery(result, 'Video');
};

export const sendDocument = async (sock, jid, file, options = {}) => {
  const buffer = await resolveBuffer(file);
  const result = await sock.sendMessage(
    jid,
    {
      document: buffer,
      mimetype: options.mimetype || 'application/octet-stream',
      fileName: options.fileName || 'file',
      caption: options.caption
    },
    { quoted: options.quoted }
  );
  return assertDelivery(result, 'Document');
};

export const sendImage = async (sock, jid, file, options = {}) => {
  const buffer = await resolveBuffer(file);
  const result = await sock.sendMessage(
    jid,
    { image: buffer, caption: options.caption, mimetype: options.mimetype },
    { quoted: options.quoted }
  );
  return assertDelivery(result, 'Image');
};

export const sendAudioFromUrl = async (sock, jid, url, options = {}) => {
  const download = await downloadToFile(url, { referer: options.referer, prefix: 'audio' });
  try {
    const kind = await detectMediaKind(download.filePath);
    const isMp3 = kind.isMp3 || download.contentType.includes('mpeg') || download.contentType.includes('mp3');
    if (options.requireMp3 && !isMp3) {
      throw new Error('Remote file is not a valid MP3 audio');
    }
    const result = await sendAudio(sock, jid, download.filePath, {
      mimetype: isMp3 ? 'audio/mpeg' : options.mimetype || 'audio/mp4',
      fileName: options.fileName || `audio.${isMp3 ? 'mp3' : download.extension}`,
      quoted: options.quoted,
      ptt: options.ptt
    });
    return { result, download };
  } finally {
    await cleanupFiles(download.filePath);
  }
};

export const sendVideoFromUrl = async (sock, jid, url, options = {}) => {
  const download = await downloadToFile(url, { referer: options.referer, prefix: 'video' });
  try {
    const kind = await detectMediaKind(download.filePath);
    if (options.requireMp4 && !kind.isVideo) {
      throw new Error('Remote file is not a valid MP4 video');
    }
    const result = await sendVideo(sock, jid, download.filePath, {
      mimetype: 'video/mp4',
      caption: options.caption,
      fileName: options.fileName || 'video.mp4',
      quoted: options.quoted
    });
    return { result, download };
  } finally {
    await cleanupFiles(download.filePath);
  }
};

export const safeSend = async (action, label = 'Message') => {
  try {
    const value = await action();
    return { ok: true, value };
  } catch (error) {
    logger.error({ err: error }, `${label} failed`);
    return { ok: false, error: truncate(error.message || String(error), 300) };
  }
};

export default {
  ensureTempDir,
  extensionFor,
  cleanupFiles,
  downloadToFile,
  detectMediaKind,
  sendAudio,
  sendVideo,
  sendDocument,
  sendImage,
  sendAudioFromUrl,
  sendVideoFromUrl,
  safeSend
};
