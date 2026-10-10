import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState
} from 'baileys';
import { config } from '../config/config.js';
import logger from './logger.js';
import store from './store.js';
import { sleep } from './utils.js';

const NO_RECONNECT_CODES = new Set([
  DisconnectReason.loggedOut,
  DisconnectReason.forbidden,
  DisconnectReason.badSession
]);

export class Connection {
  constructor(options = {}) {
    this.phoneNumber = options.phoneNumber || config.phoneNumber;
    this.handlers = {};
    this.sock = null;
    this.retries = 0;
    this.manualLogout = false;
    this.pairingRequested = false;
    this.starting = false;
    this.ready = false;
  }

  async init(handlers = {}) {
    this.handlers = handlers;
    await this.connect();
    return this;
  }

  async connect() {
    if (this.starting) return;
    this.starting = true;
    try {
      const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
      let version;
      try {
        ({ version } = await fetchLatestBaileysVersion());
      } catch (error) {
        logger.warn({ err: error }, 'Could not fetch latest WhatsApp version, using library default');
      }

      const baileysLogger = logger.child({ module: 'baileys' });

      const sock = makeWASocket({
        ...(version ? { version } : {}),
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, baileysLogger)
        },
        logger: baileysLogger,
        browser: Browsers.ubuntu(config.botName.slice(0, 24) || 'Chrome'),
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: config.connection.connectTimeoutMs,
        defaultQueryTimeoutMs: config.connection.defaultQueryTimeoutMs,
        keepAliveIntervalMs: config.connection.keepAliveIntervalMs,
        getMessage: async () => undefined
      });

      this.sock = sock;
      this.pairingRequested = false;

      sock.ev.on('creds.update', saveCreds);
      sock.ev.on('connection.update', (update) => this.handleConnectionUpdate(update));
      sock.ev.on('messages.upsert', (payload) => {
        this.handlers.onMessagesUpsert?.(payload, sock);
      });
      sock.ev.on('group-participants.update', (payload) => {
        this.handlers.onGroupParticipantsUpdate?.(payload, sock);
      });
      sock.ev.on('groups.update', (payload) => {
        this.handlers.onGroupsUpdate?.(payload, sock);
      });
      sock.ev.on('messages.update', () => {});

      if (config.usePairingCode && !sock.authState.creds.registered) {
        logger.info('Pairing-code mode enabled. Waiting for the connection to be ready...');
      } else if (sock.authState.creds.registered) {
        logger.info('Existing session found, reusing saved credentials');
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to create the socket, retrying shortly');
      this.scheduleReconnect();
    } finally {
      this.starting = false;
    }
  }

  handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !this.pairingRequested && !this.sock?.authState?.creds?.registered) {
      void this.requestPairingCode();
    }

    if (connection === 'connecting') {
      logger.debug('Connecting to WhatsApp...');
    }

    if (connection === 'open') {
      this.retries = 0;
      this.ready = true;
      logger.info(`Connected as ${this.sock.user?.id || 'unknown'}`);
      this.handlers.onReady?.(this.sock);
    }

    if (connection === 'close') {
      this.ready = false;
      const statusCode =
        lastDisconnect?.error?.output?.statusCode ||
        lastDisconnect?.error?.data?.statusCode;
      const reason = DisconnectReason[statusCode] || statusCode || 'unknown';
      logger.warn(`Connection closed (reason: ${reason})`);
      this.handleDisconnect(statusCode);
    }
  }

  async requestPairingCode() {
    if (!this.phoneNumber) {
      logger.warn('No phone number configured, cannot request a pairing code');
      return;
    }
    this.pairingRequested = true;
    try {
      await sleep(1000);
      const code = await this.sock.requestPairingCode(this.phoneNumber);
      logger.info(`Your pairing code is: ${code}`);
      this.handlers.onPairingCode?.(code);
    } catch (error) {
      logger.error({ err: error }, 'Failed to request pairing code, will retry on the next cycle');
      this.pairingRequested = false;
    }
  }

  handleDisconnect(statusCode) {
    if (this.manualLogout) return;
    if (NO_RECONNECT_CODES.has(statusCode)) {
      logger.error('Session is no longer valid. Please remove the auth folder and pair again.');
      this.handlers.onLoggedOut?.(statusCode);
      return;
    }
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.manualLogout || this.reconnectTimer) return;
    this.retries += 1;
    const delay = Math.min(this.retries * 3000, 30000);
    logger.info(`Reconnecting in ${delay / 1000}s (attempt ${this.retries})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => logger.error({ err: error }, 'Reconnect failed'));
    }, delay);
  }

  async logout() {
    this.manualLogout = true;
    try {
      await this.sock?.logout('Logging out');
    } catch (error) {
      logger.error({ err: error }, 'Logout request failed');
    }
  }

  async shutdown() {
    this.manualLogout = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      await this.sock?.end(undefined);
    } catch (error) {
      logger.debug({ err: error }, 'Socket end during shutdown failed');
    }
    await store.flush();
  }
}

export default Connection;
          
