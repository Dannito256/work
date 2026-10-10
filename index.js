import { existsSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { config } from './config/config.js';
import logger from './lib/logger.js';
import store from './lib/store.js';
import Connection from './lib/connection.js';
import Handler from './lib/handler.js';
import { numberToJid } from './lib/utils.js';

const BANNER = `
  ${config.botName}
  Baileys 7.0.0-rc14 | pairing-code authentication
`;

const askForPhoneNumber = async () => {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(
      'Enter the WhatsApp number to pair (country code + number, digits only, e.g. 254712345678): '
    );
    return answer.replace(/\D/g, '');
  } finally {
    rl.close();
  }
};

const notifyOwner = async (sock) => {
  if (!config.ownerNumber) return;
  try {
    await sock.sendMessage(numberToJid(config.ownerNumber), {
      text: `${config.botName} is now online and ready.`
    });
  } catch (error) {
    logger.debug({ err: error }, 'Could not notify the owner');
  }
};

const main = async () => {
  console.log(BANNER);
  await store.init();

  const handler = new Handler();
  await handler.load();

  const hasSession = existsSync(path.join(config.sessionDir, 'creds.json'));
  let phoneNumber = config.phoneNumber;
  if (!hasSession && config.usePairingCode && !phoneNumber) {
    phoneNumber = await askForPhoneNumber();
  }
  if (!hasSession && !config.usePairingCode) {
    logger.warn('QR-code mode is not supported by this bot. Set USE_PAIRING_CODE=true.');
  }

  const connection = new Connection({ phoneNumber });

  await connection.init({
    onPairingCode: (code) => {
      console.log('\n============================================');
      console.log('  PAIRING CODE:', code);
      console.log('  Open WhatsApp > Linked Devices > Link a device');
      console.log('  > Link with phone number instead, then enter this code.');
      console.log('============================================\n');
    },
    onReady: (sock) => {
      console.log(`Connected to WhatsApp as ${sock.user?.id || 'unknown'}`);
      void notifyOwner(sock);
    },
    onLoggedOut: () => {
      logger.error('Logged out. Delete the auth folder and restart to pair again.');
    },
    onMessagesUpsert: (payload, sock) => handler.onMessagesUpsert(payload, sock),
    onGroupParticipantsUpdate: (payload, sock) => handler.onGroupParticipantsUpdate(payload, sock),
    onGroupsUpdate: (payload, sock) => handler.onGroupsUpdate(payload, sock)
  });

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await connection.shutdown();
      store.flushSync();
    } catch (error) {
      logger.error({ err: error }, 'Error during shutdown');
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled promise rejection'));
  process.on('uncaughtException', (error) => {
    logger.error({ err: error }, 'Uncaught exception');
    store.flushSync();
  });
};

main().catch((error) => {
  logger.error({ err: error }, 'Fatal startup error');
  process.exit(1);
});
