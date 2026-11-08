'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { app } = require('electron');
const { store } = require('./store');
const { paths, ensureDir } = require('./paths');
const { fetchJson, downloadToFile } = require('./net');

function compareVersions(a, b) {
  const clean = (v) => String(v || '0').replace(/^v/i, '').split(/[.+-]/).map((part) => Number(part) || 0);
  const aa = clean(a);
  const bb = clean(b);
  const length = Math.max(aa.length, bb.length);
  for (let i = 0; i < length; i += 1) {
    if ((aa[i] || 0) > (bb[i] || 0)) return 1;
    if ((aa[i] || 0) < (bb[i] || 0)) return -1;
  }
  return 0;
}

function currentVersion() {
  return app.getVersion();
}

function updatesDir() {
  return ensureDir(path.join(paths.data(), 'updates'));
}

function appAsarPath() {
  return path.join(process.resourcesPath, 'app.asar');
}

function localManifestCandidates() {
  return [
    path.join(path.dirname(process.execPath), 'update.json'),
    path.join(updatesDir(), 'update.json'),
  ];
}

const MIRROR_FEEDS = [
  'https://tycl-1327923012.cos.ap-shanghai.myqcloud.com/tycl/update.json',
  'https://tycl-updates-a3y8.youwu2025a3.workers.dev/update.json',
  'https://raw.githubusercontent.com/youwu2025a3-del/TYCL/main/update.json',
  'https://cdn.jsdelivr.net/gh/youwu2025a3-del/TYCL@main/update.json',
  'https://github.com/youwu2025a3-del/TYCL/raw/main/update.json',
];

function feedCandidates(primary) {
  const list = [primary, ...MIRROR_FEEDS].filter(Boolean);
  return Array.from(new Set(list));
}

function normalizeManifest(data, source) {
  if (!data || !data.version) throw new Error('更新清单缺少 version 字段');
  const urls = [data.downloadUrl || data.url || '', ...(Array.isArray(data.downloadUrls) ? data.downloadUrls : [])]
    .filter((url) => /^https?:\/\//i.test(url));
  return {
    version: String(data.version),
    notes: (() => {
      const text = String(data.notes || data.changelog || '');
      try {
        if (/[ÃÂæå]/i.test(text)) return Buffer.from(text, 'latin1').toString('utf8');
      } catch { /* ignore */ }
      return text;
    })(),
    downloadUrl: urls[0] || '',
    downloadUrls: Array.from(new Set(urls)),
    sha256: data.sha256 || '',
    size: Number(data.size) || 0,
    publishedAt: data.publishedAt || data.date || '',
    mandatory: Boolean(data.mandatory),
    source,
  };
}

async function resolveManifest() {
  const settings = store.getSettings();
  const channel = settings.updateChannel === 'beta' ? 'beta' : 'stable';
  const feedUrl =
    channel === 'beta'
      ? settings.betaUpdateFeedUrl ||
        (settings.updateFeedUrl || '').replace(/update\.json(\?.*)?$/i, 'beta-update.json')
      : settings.updateFeedUrl;
  if (feedUrl) {
    if (/^https?:\/\//i.test(feedUrl)) {
      let lastError = null;
      for (const candidate of feedCandidates(feedUrl)) {
        try {
          const data = await fetchJson(candidate, { timeout: 20000, preferElectron: true });
          return normalizeManifest(data, candidate);
        } catch (error) {
          lastError = error;
        }
      }
      if (channel === 'beta' && settings.updateFeedUrl) {
        for (const candidate of feedCandidates(settings.updateFeedUrl)) {
          try {
            const data = await fetchJson(candidate, { timeout: 20000, preferElectron: true });
            return normalizeManifest(data, candidate);
          } catch (error) {
            lastError = error;
          }
        }
      }
      throw lastError || new Error('所有更新源都不可用');
    }
    const file = path.resolve(feedUrl);
    if (fs.existsSync(file)) {
      return normalizeManifest(JSON.parse(fs.readFileSync(file, 'utf8')), file);
    }
    throw new Error('更新源路径不存在：' + file);
  }
  for (const file of localManifestCandidates()) {
    if (fs.existsSync(file)) {
      return normalizeManifest(JSON.parse(fs.readFileSync(file, 'utf8')), file);
    }
  }
  return null;
}

function getInfo() {
  return {
    currentVersion: currentVersion(),
    packaged: app.isPackaged,
    canAutoUpdate: app.isPackaged && fs.existsSync(appAsarPath()),
    feedUrl: store.getSettings().updateFeedUrl || '',
    channel: store.getSettings().updateChannel || 'stable',
    appAsar: app.isPackaged ? appAsarPath() : '',
    updatesDir: updatesDir(),
    lastUpdateCheck: store.getSettings().lastUpdateCheck || 0,
  };
}

async function checkForUpdates() {
  const info = getInfo();
  let manifest = null;
  let error = '';
  try {
    manifest = await resolveManifest();
  } catch (err) {
    error = err.message;
  }
  store.saveSettings({ lastUpdateCheck: Date.now() });
  if (!manifest) {
    return {
      ...info,
      configured: false,
      hasUpdate: false,
      latestVersion: info.currentVersion,
      notes: '',
      error,
      checkedAt: Date.now(),
    };
  }
  const comparison = compareVersions(manifest.version, info.currentVersion);
  return {
    ...info,
    configured: true,
    hasUpdate: comparison > 0,
    latestVersion: manifest.version,
    notes: manifest.notes,
    manifest,
    error,
    checkedAt: Date.now(),
  };
}

function findAppAsarEntry(zip) {
  const entries = zip.getEntries();
  return (
    entries.find((entry) => entry.entryName.toLowerCase() === 'app.asar') ||
    entries.find((entry) => entry.entryName.toLowerCase().endsWith('/app.asar')) ||
    entries.find((entry) => entry.entryName.toLowerCase().endsWith('\\app.asar'))
  );
}

function prepareUpdate(inputPath) {
  if (!app.isPackaged) throw new Error('源码运行模式无法原地更新，请使用便携版或重新构建');
  if (!fs.existsSync(inputPath)) throw new Error('更新包不存在');
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === '.asar') {
    const target = path.join(updatesDir(), `staged-${Date.now()}.pkg`);
    fs.copyFileSync(inputPath, target);
    const size = fs.statSync(target).size;
    if (size < 4096) throw new Error('更新包不是有效的 app.asar');
    return { ok: true, packagePath: target, size };
  }
  if (ext === '.zip' || ext === '.tyclupdate') {
    const zip = new AdmZip(inputPath);
    const asarEntry = findAppAsarEntry(zip);
    if (!asarEntry) throw new Error('更新包中没有找到 app.asar');
    const target = path.join(updatesDir(), `staged-${Date.now()}.pkg`);
    const data = asarEntry.getData();
    if (!data || data.length < 4096) throw new Error('更新包不是有效的 app.asar');
    fs.writeFileSync(target, data);
    const manifestEntry =
      zip.getEntry('update.json') ||
      zip.getEntry('manifest.json');
    let manifest = {};
    if (manifestEntry) {
      try {
        manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
      } catch {
        manifest = {};
      }
    }
    return { ok: true, packagePath: target, size: data.length, version: manifest.version || '', notes: manifest.notes || '' };
  }
  throw new Error('请选择 .zip、.tyclupdate 或 .asar 更新包');
}

async function downloadUpdate(options = {}) {
  const urls = Array.from(new Set([
    options.url,
    ...(Array.isArray(options.urls) ? options.urls : []),
    ...(Array.isArray(options.downloadUrls) ? options.downloadUrls : []),
  ].filter((url) => /^https?:\/\//i.test(url || ''))));
  if (!urls.length) throw new Error('更新下载地址无效');
  let lastError = null;
  for (const url of urls) {
    const file = path.join(updatesDir(), `download-${Date.now()}${path.extname(new URL(url).pathname) || '.zip'}`);
    try {
      await downloadToFile([url], file, { timeout: 180000, skipIfExists: false, preferElectronFetch: true });
      if (options.sha256) {
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        if (hash.toLowerCase() !== String(options.sha256).toLowerCase()) {
          fs.rmSync(file, { force: true });
          throw new Error('更新包 SHA-256 校验失败');
        }
      }
      return prepareUpdate(file);
    } catch (error) {
      lastError = error;
      try { fs.rmSync(file, { force: true }); } catch { /* ignore */ }
    }
  }
  throw lastError || new Error('所有更新下载地址都失败');
}

function scheduleInstall(options = {}) {
  if (!app.isPackaged) throw new Error('源码运行模式无法原地更新');
  const packagePath = options.packagePath;
  if (!packagePath || !fs.existsSync(packagePath)) throw new Error('更新包已不存在');
  const target = appAsarPath();
  if (!fs.existsSync(target)) throw new Error('找不到 app.asar，无法自动更新');
  try {
    fs.accessSync(path.dirname(target), fs.constants.W_OK);
  } catch {
    throw new Error('应用目录不可写，请将 TYCL 放到可写目录，或以管理员身份运行');
  }
  ensureDir(updatesDir());
  const helperPath = path.join(updatesDir(), 'tycl-updater.js');
  const logPath = path.join(updatesDir(), 'update.log');
  const pid = process.pid;
  const helperSource = fs.readFileSync(path.join(__dirname, 'updater-helper.js'), 'utf8');
  fs.writeFileSync(helperPath, helperSource, 'utf8');
  const child = spawn(process.execPath, [helperPath, String(pid), target, packagePath, process.execPath, logPath, app.getPath('userData')], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: updatesDir(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ELECTRON_NO_ASAR: '1' },
  });
  child.unref();
  return { ok: true, target, log: logPath };
}

module.exports = {
  compareVersions,
  getInfo,
  checkForUpdates,
  prepareUpdate,
  downloadUpdate,
  scheduleInstall,
  appAsarPath,
};
