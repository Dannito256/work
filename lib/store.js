import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/config.js';
import logger from './logger.js';

const DEFAULT_GROUP = {
  welcome: false,
  welcomeText: null,
  goodbye: false,
  goodbyeText: null,
  antilink: false,
  antispam: false,
  mute: false,
  locked: false,
  warnLimit: 3,
  warnings: {}
};

const DEFAULT_DATA = {
  meta: {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  groups: {}
};

class Store {
  constructor(file = config.databaseFile) {
    this.file = file;
    this.data = structuredClone(DEFAULT_DATA);
    this._saveTimer = null;
    this._writing = Promise.resolve();
    this._dirty = false;
  }

  async init() {
    await fsp.mkdir(path.dirname(this.file), { recursive: true });
    try {
      const raw = await fsp.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = {
        ...structuredClone(DEFAULT_DATA),
        ...parsed,
        meta: { ...DEFAULT_DATA.meta, ...(parsed.meta || {}) },
        groups: parsed.groups && typeof parsed.groups === 'object' ? parsed.groups : {}
      };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn({ err: error }, 'Could not read database, starting a fresh one');
      }
      this.data = structuredClone(DEFAULT_DATA);
      await this.flush();
    }
    return this;
  }

  group(jid) {
    if (!this.data.groups[jid]) this.data.groups[jid] = structuredClone(DEFAULT_GROUP);
    const current = this.data.groups[jid];
    return {
      ...structuredClone(DEFAULT_GROUP),
      ...current,
      warnings: { ...(current.warnings || {}) }
    };
  }

  update(jid, patch) {
    const existing = this.data.groups[jid] || structuredClone(DEFAULT_GROUP);
    this.data.groups[jid] = { ...existing, ...patch };
    this.markDirty();
    return this.group(jid);
  }

  setFlag(jid, key, value) {
    const existing = this.data.groups[jid] || structuredClone(DEFAULT_GROUP);
    const next = value === undefined ? !existing[key] : Boolean(value);
    existing[key] = next;
    this.data.groups[jid] = existing;
    this.markDirty();
    return next;
  }

  warnings(jid) {
    return { ...(this.data.groups[jid]?.warnings || {}) };
  }

  warnCount(jid, userJid) {
    return Number(this.data.groups[jid]?.warnings?.[userJid] || 0);
  }

  addWarn(jid, userJid) {
    const existing = this.data.groups[jid] || structuredClone(DEFAULT_GROUP);
    existing.warnings = existing.warnings || {};
    existing.warnings[userJid] = Number(existing.warnings[userJid] || 0) + 1;
    this.data.groups[jid] = existing;
    this.markDirty();
    return existing.warnings[userJid];
  }

  resetWarn(jid, userJid) {
    const existing = this.data.groups[jid];
    if (!existing || !existing.warnings) return 0;
    if (userJid) delete existing.warnings[userJid];
    else existing.warnings = {};
    this.markDirty();
    return 0;
  }

  warnLimit(jid) {
    const limit = Number(this.data.groups[jid]?.warnLimit);
    return Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_GROUP.warnLimit;
  }

  setWarnLimit(jid, limit) {
    const existing = this.data.groups[jid] || structuredClone(DEFAULT_GROUP);
    existing.warnLimit = limit;
    this.data.groups[jid] = existing;
    this.markDirty();
    return limit;
  }

  markDirty() {
    this.data.meta.updatedAt = new Date().toISOString();
    this._dirty = true;
    this.scheduleSave();
  }

  scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.flush().catch((error) => logger.error({ err: error }, 'Failed to persist database'));
    }, 250);
  }

  flush() {
    if (!this._dirty) return this._writing;
    this._dirty = false;
    const snapshot = JSON.stringify(this.data, null, 2);
    const tmpFile = `${this.file}.tmp`;
    this._writing = this._writing
      .then(async () => {
        await fsp.mkdir(path.dirname(this.file), { recursive: true });
        await fsp.writeFile(tmpFile, snapshot, 'utf8');
        await fsp.rename(tmpFile, this.file);
      })
      .catch((error) => logger.error({ err: error }, 'Database write failed'));
    return this._writing;
  }

  flushSync() {
    if (!this._dirty && fs.existsSync(this.file)) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmpFile = `${this.file}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmpFile, this.file);
      this._dirty = false;
    } catch (error) {
      logger.error({ err: error }, 'Synchronous database flush failed');
    }
  }
}

export const store = new Store();
export { Store };
export default store;
                                                  
