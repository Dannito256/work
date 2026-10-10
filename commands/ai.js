import { config } from '../config/config.js';
import { fetchJson, truncate } from '../lib/utils.js';

const KNOWN_MODELS = ['deepseek', 'gpt4o', 'claude'];
const DEFAULT_MODEL = 'deepseek';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const splitMessage = (text, size = 3800) => {
  const value = String(text ?? '');
  const parts = [];
  for (let i = 0; i < value.length; i += size) parts.push(value.slice(i, i + size));
  return parts.length ? parts : ['(empty response)'];
};

const askAi = async (question, model) => {
  const { baseUrl, apiKey } = config.apis.gifted;
  const endpoint = `${baseUrl}/api/ai/overchat?apikey=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(
    question
  )}&model=${encodeURIComponent(model)}`;
  const data = await fetchJson(endpoint, { timeoutMs: 60000, headers: { 'user-agent': USER_AGENT } });
  const answer = typeof data?.result === 'string' ? data.result : data?.result?.answer || data?.answer;
  if (!answer) throw new Error(data?.message || 'The AI service did not return an answer');
  return { answer, available: data?.available_models || KNOWN_MODELS };
};

export default [
  {
    name: 'ai',
    aliases: ['ask', 'chat'],
    category: 'ai',
    description: 'Ask an AI model a question',
    usage: '.ai [model] <question> | .ai models',
    async run(ctx) {
      const first = (ctx.args[0] || '').toLowerCase();

      if (first === 'models') {
        let models = KNOWN_MODELS;
        try {
          const probe = await askAi('ping', DEFAULT_MODEL);
          if (Array.isArray(probe.available) && probe.available.length) models = probe.available;
        } catch {
          models = KNOWN_MODELS;
        }
        await ctx.reply(`Available AI models:\n${models.map((model) => `- ${model}`).join('\n')}`);
        return;
      }

      let model = DEFAULT_MODEL;
      let question = ctx.argString.trim();
      if (KNOWN_MODELS.includes(first)) {
        model = first;
        question = ctx.args.slice(1).join(' ').trim();
      }

      if (!question) {
        await ctx.reply(`Usage: ${ctx.prefix}ai [model] <question>\nExamples:\n${ctx.prefix}ai What is gravity?\n${ctx.prefix}ai gpt4o Write a poem`);
        return;
      }

      const status = await ctx.reply(`Thinking with ${model}...`);
      try {
        const { answer } = await askAi(question, model);
        const parts = splitMessage(answer);
        for (const [index, part] of parts.entries()) {
          await ctx.send(index === 0 ? part : `(continued)\n${part}`, {
            quoted: index === 0 ? status : undefined
          });
        }
      } catch (error) {
        await ctx.send(`AI request failed: ${truncate(error.message, 200)}`, { quoted: status });
      }
    }
  }
];
      
