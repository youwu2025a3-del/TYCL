'use strict';

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function appRoot() {
  if (process.env.TYCL_DATA_DIR) return path.resolve(process.env.TYCL_DATA_DIR);
  return path.join(app.getPath('appData'), 'TYCL');
}

const paths = {
  root: () => appRoot(),
  data: () => ensureDir(path.join(appRoot(), 'data')),
  logs: () => ensureDir(path.join(appRoot(), 'logs')),
  skins: () => ensureDir(path.join(appRoot(), 'skins')),
  cache: () => ensureDir(path.join(appRoot(), 'cache')),
  backups: () => ensureDir(path.join(appRoot(), 'backups')),
  runtimes: () => ensureDir(path.join(appRoot(), 'runtimes')),
  defaultGameDir: () => path.join(appRoot(), 'minecraft'),
  instancesRoot: (gameDir) => path.join(gameDir, 'tycl-instances'),
  settingsFile: () => path.join(appRoot(), 'settings.json'),
  instancesFile: () => path.join(appRoot(), 'instances.json'),
  assetDir: (name) => path.join(__dirname, '..', 'src', 'assets', name),
};

function safeResolveWithin(base, relative) {
  const normalizedBase = path.resolve(base);
  const target = path.resolve(normalizedBase, relative);
  if (target !== normalizedBase && !target.startsWith(normalizedBase + path.sep)) {
    throw new Error('路径越界：' + relative);
  }
  return target;
}

module.exports = { ensureDir, paths, safeResolveWithin };
