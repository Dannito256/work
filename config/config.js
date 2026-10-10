import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const bool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const digits = (value) => String(value ?? '').replace(/\D/g, '');

const resolvePath = (value, fallback) => path.resolve(rootDir, String(value ?? '').trim() || fallback);

export const config = {
  rootDir,
  botName: process.env.BOT_NAME?.trim() || 'Baileys Bot',
  prefix: (process.env.PREFIX?.trim() || '.').slice(0, 3),
  ownerNumber: digits(process.env.OWNER_NUMBER),
  ownerName: process.env.OWNER_NAME?.trim() || 'Owner',
  phoneNumber: digits(process.env.PHONE_NUMBER),
  usePairingCode: bool(process.env.USE_PAIRING_CODE, true),

  sessionDir: resolvePath(process.env.SESSION_DIR, 'auth'),
  databaseFile: resolvePath(process.env.DATABASE_FILE, 'database/settings.json'),
  tempDir: resolvePath(process.env.TEMP_DIR, 'tmp'),

  logLevel: process.env.LOG_LEVEL?.trim() || 'info',
  logPretty: bool(process.env.LOG_PRETTY, false),

  connection: {
    connectTimeoutMs: int(process.env.CONNECT_TIMEOUT_MS, 60000),
    defaultQueryTimeoutMs: int(process.env.DEFAULT_QUERY_TIMEOUT_MS, 60000),
    keepAliveIntervalMs: int(process.env.KEEP_ALIVE_INTERVAL_MS, 30000)
  },

  media: {
    maxSizeBytes: int(process.env.MAX_MEDIA_MB, 64) * 1024 * 1024,
    downloadTimeoutMs: int(process.env.DOWNLOAD_TIMEOUT_MS, 120000)
  },

  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 10000),
    max: int(process.env.RATE_LIMIT_MAX, 8)
  },

  apis: {
    gifted: {
      baseUrl: (process.env.GIFTED_BASE_URL?.trim() || 'https://api.gifted.co.ke').replace(/\/$/, ''),
      apiKey: process.env.GIFTED_API_KEY?.trim() || 'gifted'
    },
    azbry: {
      baseUrl: (process.env.AZBRY_BASE_URL?.trim() || 'https://api.azbry.com').replace(/\/$/, '')
    },
    vidssave: {
      endpoint: process.env.VIDSSAVE_ENDPOINT?.trim() || 'https://api.vidssave.com/api/contentsite_api/media/parse',
      auth: process.env.VIDSSAVE_AUTH?.trim() || '20250901majwlqo',
      domain: process.env.VIDSSAVE_DOMAIN?.trim() || 'api-ak.vidssave.com',
      origin: process.env.VIDSSAVE_ORIGIN?.trim() || 'source'
    }
  }
};

export const paths = {
  session: config.sessionDir,
  database: config.databaseFile,
  temp: config.tempDir
};

export default config;
                            
