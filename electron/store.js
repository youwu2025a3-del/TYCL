'use strict';

const fs = require('fs');
const path = require('path');
const { paths, ensureDir } = require('./paths');

const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  theme: 'light',
  accent: 'mint',
  player: {
    name: 'Steve',
    model: 'classic',
    skin: 'builtin:yunshan',
  },
  gameDir: '',
  javaPath: '',
  memoryMb: 4096,
  downloadSource: 'bmclapi',
  showSnapshots: false,
  closeToTray: false,
  firstRun: true,
  accountMode: 'offline',
  microsoftClientId: '00000000402b5328',
  updateFeedUrl: 'https://tycl-1327923012.cos.ap-shanghai.myqcloud.com/tycl/update.json',
  betaUpdateFeedUrl: '',
  curseForgeApiKey: '',
  curseForgeProxyUrl: 'https://tycl-curseforge.youwu2025a3.workers.dev',
  updateChannel: 'stable',
  autoCheckUpdates: true,
  lastUpdateCheck: 0,
};

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  const temp = file + '.tmp-' + process.pid;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeSettings(input, previous = {}) {
  const base = { ...DEFAULT_SETTINGS, ...previous, ...(input || {}) };
  const player = { ...DEFAULT_SETTINGS.player, ...(previous.player || {}), ...((input && input.player) || {}) };
  const name = String(player.name || 'Steve').trim().replace(/[^A-Za-z0-9_]/g, '').slice(0, 16) || 'Steve';
  return {
    ...base,
    theme: ['light', 'dark', 'system'].includes(base.theme) ? base.theme : 'light',
    accent: ['mint', 'sky', 'violet', 'amber', 'rose'].includes(base.accent) ? base.accent : 'mint',
    player: {
      ...player,
      name: name.length < 3 ? 'Steve' : name,
      model: player.model === 'slim' ? 'slim' : 'classic',
      skin: typeof player.skin === 'string' && player.skin ? player.skin : 'builtin:yunshan',
    },
    gameDir: typeof base.gameDir === 'string' && base.gameDir ? base.gameDir : paths.defaultGameDir(),
    javaPath: typeof base.javaPath === 'string' ? base.javaPath : '',
    memoryMb: Math.round(clampNumber(base.memoryMb, 1024, 65536, 4096) / 512) * 512,
    downloadSource: base.downloadSource === 'official' ? 'official' : 'bmclapi',
    showSnapshots: Boolean(base.showSnapshots),
    closeToTray: Boolean(base.closeToTray),
    firstRun: Boolean(base.firstRun),
    accountMode: base.accountMode === 'microsoft' ? 'microsoft' : 'offline',
    microsoftClientId: String(base.microsoftClientId || '00000000402b5328').trim() || '00000000402b5328',
    updateFeedUrl: (() => {
      const value = typeof base.updateFeedUrl === 'string' ? base.updateFeedUrl.trim() : '';
      return !value || /^https:\/\/tycl-updates-a3y8\.youwu2025a3\.workers\.dev\/update\.json$/i.test(value)
        ? DEFAULT_SETTINGS.updateFeedUrl
        : value;
    })(),
    betaUpdateFeedUrl: typeof base.betaUpdateFeedUrl === 'string' ? base.betaUpdateFeedUrl.trim() : '',
    curseForgeApiKey: typeof base.curseForgeApiKey === 'string' ? base.curseForgeApiKey.trim() : '',
    curseForgeProxyUrl: typeof base.curseForgeProxyUrl === 'string' ? base.curseForgeProxyUrl.trim().replace(/\/$/, '') : 'https://tycl-curseforge.youwu2025a3.workers.dev',
    updateChannel: base.updateChannel === 'beta' ? 'beta' : 'stable',
    autoCheckUpdates: base.autoCheckUpdates !== false,
    lastUpdateCheck: Number(base.lastUpdateCheck) || 0,
  };
}

class Store {
  constructor() {
    this.settings = null;
    this.instances = null;
  }

  getSettings() {
    if (!this.settings) {
      const raw = readJson(paths.settingsFile(), {});
      this.settings = normalizeSettings(raw);
      if (this.settings.firstRun) {
        this.settings.firstRun = false;
        this.saveSettings(this.settings);
      }
    }
    return this.settings;
  }

  saveSettings(patch = {}) {
    const merged = normalizeSettings(patch, this.getSettings());
    this.settings = merged;
    writeJsonAtomic(paths.settingsFile(), merged);
    return merged;
  }

  instancesFile() {
    return path.join(paths.instancesRoot(this.getSettings().gameDir), 'instances.json');
  }

  getInstances() {
    const file = this.instancesFile();
    if (!this.instances || this.instancesFileCache !== file) {
      ensureDir(path.dirname(file));
      const raw = readJson(file, { instances: [] });
      this.instances = Array.isArray(raw) ? { instances: raw } : raw;
      if (!Array.isArray(this.instances.instances)) this.instances.instances = [];
      this.instancesFileCache = file;
    }
    return this.instances;
  }

  saveInstances(data) {
    this.instances = data;
    this.instancesFileCache = this.instancesFile();
    writeJsonAtomic(this.instancesFileCache, data);
    return data;
  }
}

const store = new Store();

module.exports = { store, DEFAULT_SETTINGS, readJson, writeJsonAtomic, normalizeSettings };
