import { config } from '../config/config.js';
import {
  assertSafeUrl,
  deepFind,
  fetchJson,
  isUrl,
  postFormJson,
  truncate
} from '../lib/utils.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const MEDIA_KEYS = [
  'play',
  'video',
  'videoUrl',
  'url',
  'download',
  'downloadUrl',
  'download_url',
  'hd',
  'sd',
  'media',
  'medias',
  'mp4',
  'mp3',
  'images'
];

const isMediaUrl = (value) =>
  typeof value === 'string' &&
  isUrl(value) &&
  /\.(mp4|m4a|mp3|webm|mov|mkv|jpg|jpeg|png)(\?|$)/i.test(value);

const collectUrls = (object) => {
  const urls = [];
  const seen = new Set();
  const queue = [object];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    for (const value of Object.values(current)) {
      if (typeof value === 'string' && isUrl(value)) urls.push(value);
      else if (value && typeof value === 'object') queue.push(value);
    }
  }
  return urls;
};

const extractMediaUrl = (data) => {
  const direct = deepFind(data, MEDIA_KEYS);
  if (isUrl(direct)) return direct;
  if (Array.isArray(direct)) {
    const fromArray = direct.find((item) => isUrl(item) || isUrl(item?.url));
    if (fromArray) return isUrl(fromArray) ? fromArray : fromArray.url;
  }
  const urls = collectUrls(data);
  return urls.find(isMediaUrl) || urls[0] || null;
};

const extractTitle = (data) =>
  deepFind(data, ['title', 'desc', 'description', 'caption', 'name']) || null;

const isYoutube = (link) => /(?:youtube\.com|youtu\.be)/i.test(link);

const parseVidsSave = async (link) => {
  const { endpoint, auth, domain, origin } = config.apis.vidssave;
  const data = await postFormJson(
    endpoint,
    { auth, domain, origin, link },
    {
      timeoutMs: 45000,
      headers: {
        origin: 'https://www.vidssave.com',
        referer: 'https://www.vidssave.com/',
        version: '1.0.0',
        'user-agent': USER_AGENT
      }
    }
  );
  if (data?.status === 0 || data?.status_code === 'analyze_failed') {
    throw new Error('VidsSave rejected the link (analyze_failed)');
  }
  const mediaUrl = extractMediaUrl(data);
  if (!mediaUrl) throw new Error('VidsSave did not return a media link');
  return { downloadUrl: mediaUrl, title: extractTitle(data), service: 'VidsSave' };
};

const giftedSavemp4 = async (link, quality = '720') => {
  const { baseUrl, apiKey } = config.apis.gifted;
  const target = `${baseUrl}/api/download/savemp4?apikey=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(
    link
  )}&quality=${encodeURIComponent(quality)}`;
  const data = await fetchJson(target, { timeoutMs: 60000, headers: { 'user-agent': USER_AGENT } });
  const downloadUrl = data?.result?.download_url || data?.download_url;
  if (!downloadUrl || !isUrl(downloadUrl)) {
    throw new Error(data?.message || 'Gifted downloader did not return a media link');
  }
  return {
    downloadUrl,
    title: data?.result?.title || null,
    quality: data?.result?.quality || quality,
    service: 'Gifted'
  };
};

const azbryYtmp4 = async (link, quality = '720') => {
  const target = `${config.apis.azbry.baseUrl}/api/download/ytmp4?url=${encodeURIComponent(link)}`;
  const data = await fetchJson(target, { timeoutMs: 60000, headers: { 'user-agent': USER_AGENT } });
  const downloadUrl = data?.result?.download || data?.result?.url;
  if (!downloadUrl || !isUrl(downloadUrl)) {
    throw new Error(data?.message || 'azbry did not return a video link');
  }
  return {
    downloadUrl,
    title: data?.result?.title || null,
    quality: data?.result?.quality || quality,
    service: 'azbry'
  };
};

const youtubeCandidates = async (link, quality) => {
  const candidates = [];
  try {
    candidates.push(await giftedSavemp4(link, quality));
  } catch {}
  try {
    candidates.push(await azbryYtmp4(link, quality));
  } catch {}
  return candidates;
};

const deliverMedia = async (ctx, mediaUrl, { caption, referer } = {}) => {
  const download = await ctx.media.downloadToFile(mediaUrl, { referer, prefix: 'dl' });
  try {
    const kind = await ctx.media.detectMediaKind(download.filePath);
    if (kind.isVideo) {
      await ctx.media.sendVideo(ctx.sock, ctx.chatId, download.filePath, {
        caption: caption ? `${caption}\n\n${ctx.config.botName}` : undefined,
        quoted: ctx.msg,
        mimetype: 'video/mp4'
      });
      return 'video';
    }
    if (kind.isMp3 || kind.isAudio) {
      await ctx.media.sendAudio(ctx.sock, ctx.chatId, download.filePath, {
        mimetype: kind.isMp3 ? 'audio/mpeg' : 'audio/mp4',
        quoted: ctx.msg,
        fileName: `audio.${kind.isMp3 ? 'mp3' : download.extension}`
      });
      return 'audio';
    }
    if (kind.isJpeg || kind.isPng) {
      await ctx.media.sendImage(ctx.sock, ctx.chatId, download.filePath, { caption, quoted: ctx.msg });
      return 'image';
    }
    await ctx.media.sendDocument(ctx.sock, ctx.chatId, download.filePath, {
      fileName: `download.${download.extension}`,
      caption,
      quoted: ctx.msg,
      mimetype: download.contentType || 'application/octet-stream'
    });
    return 'document';
  } finally {
    await ctx.media.cleanupFiles(download.filePath);
  }
};

const deliverFirst = async (ctx, candidates) => {
  let lastError;
  for (const candidate of candidates) {
    try {
      const kind = await deliverMedia(ctx, candidate.downloadUrl, { caption: candidate.title || undefined });
      return { kind, service: candidate.service, title: candidate.title };
    } catch (error) {
      lastError = error;
      ctx.logger.warn({ err: error, service: candidate.service }, 'Media candidate failed');
    }
  }
  throw lastError || new Error('No downloadable media was found');
};

const runAllDownload = async (ctx) => {
  const link = ctx.args.find((arg) => isUrl(arg)) || '';
  if (!link) {
    await ctx.reply(`Usage: ${ctx.prefix}${ctx.command} <url>`);
    return;
  }
  try {
    assertSafeUrl(link);
  } catch (error) {
    await ctx.reply(`Invalid URL: ${error.message}`);
    return;
  }

  const status = await ctx.reply('Fetching media, please wait...');
  const candidates = [];

  try {
    candidates.push(await parseVidsSave(link));
  } catch (error) {
    ctx.logger.warn({ err: error, link }, 'VidsSave failed, trying fallbacks');
  }

  if (isYoutube(link)) {
    candidates.push(...(await youtubeCandidates(link, '720')));
  }

  if (!candidates.length) {
    await ctx.send(
      'Could not find a downloadable media file for that link. It may be private, unsupported, or the service credentials may have expired.',
      { quoted: status }
    );
    return;
  }

  try {
    const outcome = await deliverFirst(ctx, candidates);
    await ctx.send(
      `Sent as ${outcome.kind} via ${outcome.service}${outcome.title ? `: ${truncate(outcome.title, 120)}` : ''}.`,
      { quoted: status }
    );
  } catch (error) {
    await ctx.send(`Downloading the media failed: ${truncate(error.message, 200)}`, { quoted: status });
  }
};

export default [
  {
    name: 'alldl',
    aliases: ['download'],
    category: 'downloader',
    description: 'Download media from TikTok, Instagram, YouTube, Facebook and more',
    usage: '.alldl <url>',
    async run(ctx) {
      await runAllDownload(ctx);
    }
  },
  {
    name: 'vidssave',
    category: 'downloader',
    description: 'Download media using the VidsSave service',
    usage: '.vidssave <url>',
    async run(ctx) {
      await runAllDownload(ctx);
    }
  },
  {
    name: 'video',
    aliases: ['ytmp4', 'ytvideo'],
    category: 'downloader',
    description: 'Download a YouTube video as MP4',
    usage: '.video <youtube-url> [quality]',
    async run(ctx) {
      const link = ctx.args.find((arg) => isUrl(arg)) || '';
      if (!link) {
        await ctx.reply(`Usage: ${ctx.prefix}video <youtube-url> [quality]`);
        return;
      }
      try {
        assertSafeUrl(link);
      } catch (error) {
        await ctx.reply(`Invalid URL: ${error.message}`);
        return;
      }
      const qualityArg = ctx.args.find((arg) => /^\d{3,4}p?$/i.test(arg));
      const quality = (qualityArg || '720').replace(/[^\d]/g, '') || '720';

      const status = await ctx.reply(`Preparing your ${quality}p video, please wait...`);
      const candidates = await youtubeCandidates(link, quality);
      if (!candidates.length) {
        await ctx.send('The video service did not return a download link.', { quoted: status });
        return;
      }

      let sent = false;
      let lastError;
      for (const candidate of candidates) {
        try {
          await ctx.media.sendVideoFromUrl(ctx.sock, ctx.chatId, candidate.downloadUrl, {
            requireMp4: true,
            caption: candidate.title ? `${candidate.title} (${candidate.quality})` : undefined,
            quoted: ctx.msg
          });
          sent = true;
          await ctx.send(`Video sent via ${candidate.service}.`, { quoted: status });
          break;
        } catch (error) {
          lastError = error;
          ctx.logger.warn({ err: error, service: candidate.service }, 'Video candidate failed');
        }
      }

      if (!sent) {
        await ctx.send(`Failed to download the video: ${truncate(lastError?.message || 'unknown error', 200)}`, {
          quoted: status
        });
      }
    }
  }
];
  
