import { config } from '../config/config.js';
import { fetchJson, isUrl, truncate } from '../lib/utils.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const safeFileName = (title, fallback = 'audio') => {
  const cleaned = String(title || fallback)
    .replace(/[^\w\-. ]+/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return `${cleaned || fallback}.mp3`;
};

export default [
  {
    name: 'play',
    aliases: ['song', 'music'],
    category: 'music',
    description: 'Search and send a song as an MP3 audio file',
    usage: '.play <song name>',
    async run(ctx) {
      const query = ctx.argString.trim();
      if (!query) {
        await ctx.reply(`Usage: ${ctx.prefix}play <song name>`);
        return;
      }
      const status = await ctx.reply(`Searching for "${truncate(query, 80)}", please wait...`);

      try {
        const endpoint = `${config.apis.azbry.baseUrl}/api/download/ytplay2?q=${encodeURIComponent(query)}`;
        const data = await fetchJson(endpoint, { timeoutMs: 60000, headers: { 'user-agent': USER_AGENT } });
        const result = data?.result || data?.data || {};
        const audioUrl = result.download || result.url || result.audio || data?.download;
        if (!audioUrl || !isUrl(audioUrl)) {
          throw new Error('The music service did not return a downloadable audio link');
        }
        const title = result.title || result.name || query;

        await ctx.media.sendAudioFromUrl(ctx.sock, ctx.chatId, audioUrl, {
          requireMp3: true,
          fileName: safeFileName(title),
          mimetype: 'audio/mpeg',
          quoted: ctx.msg
        });

        await ctx.send(`Now playing: ${truncate(title, 120)}`, { quoted: status });
      } catch (error) {
        await ctx.send(`Could not play that song: ${truncate(error.message, 200)}`, { quoted: status });
      }
    }
  }
];
