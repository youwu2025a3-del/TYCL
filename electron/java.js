'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const AdmZip = require('adm-zip');
const { store } = require('./store');
const { paths, ensureDir } = require('./paths');
const { downloadToFile } = require('./net');

const JAVA_EXE = process.platform === 'win32' ? 'java.exe' : 'java';
const JAVA_CACHE = new Map();

function runVersion(javaPath) {
  return new Promise((resolve) => {
    execFile(javaPath, ['-version'], { windowsHide: true, timeout: 10000 }, (error, stdout, stderr) => {
      if (error) return resolve(null);
      const text = String(stderr || '') + String(stdout || '');
      const match = text.match(/version\s+"([^"]+)"/i);
      if (!match) return resolve(null);
      const version = match[1];
      const majorMatch = version.match(/^(?:1\.)?(\d+)/);
      const major = majorMatch ? Number(majorMatch[1]) : 0;
      const vendorMatch = text.match(/Runtime Environment[^\n]*\((.*?)\)/i) || text.match(/^(.+?)\s+version/im);
      resolve({ version, major, vendor: vendorMatch ? vendorMatch[1].slice(0, 80) : 'Java' });
    });
  });
}

async function inspectJava(javaPath) {
  if (!javaPath) return null;
  const isCommand = !javaPath.includes(path.sep) && !fs.existsSync(javaPath);
  if (!isCommand) {
    if (!fs.existsSync(javaPath)) return null;
    const stat = fs.statSync(javaPath);
    if (!stat.isFile()) return null;
  }
  const key = javaPath + ':' + (isCommand ? 'cmd' : fs.statSync(javaPath).mtimeMs);
  if (JAVA_CACHE.has(key)) return JAVA_CACHE.get(key);
  const info = await runVersion(javaPath);
  if (!info) return null;
  const result = { path: javaPath, ...info };
  JAVA_CACHE.set(key, result);
  return result;
}

function addCandidate(set, p) {
  if (!p) return;
  try {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) set.add(path.resolve(p));
  } catch {
    // 忽略无权限目录
  }
}

function scanJavaRoot(root, set, depth = 2) {
  if (!root || depth < 0) return;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  if (entries.some((entry) => entry.name.toLowerCase() === JAVA_EXE)) {
    addCandidate(set, path.join(root, JAVA_EXE));
    return;
  }
  const bin = path.join(root, 'bin');
  addCandidate(set, path.join(bin, JAVA_EXE));
  if (depth === 0) return;
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      scanJavaRoot(path.join(root, entry.name), set, depth - 1);
    }
  }
}

function candidatePaths() {
  const candidates = new Set();
  const settings = store.getSettings();
  addCandidate(candidates, settings.javaPath);
  if (process.env.JAVA_HOME) addCandidate(candidates, path.join(process.env.JAVA_HOME, 'bin', JAVA_EXE));
  addCandidate(candidates, path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Eclipse Adoptium', 'bin', JAVA_EXE));
  addCandidate(candidates, path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft', 'bin', JAVA_EXE));

  const roots = [
    'C:\\Program Files\\Java',
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Microsoft',
    'C:\\Program Files\\Amazon Corretto',
    'C:\\Program Files\\Zulu',
    'C:\\Program Files\\BellSoft',
    'C:\\Program Files\\Semeru',
    'C:\\Program Files\\JetBrains',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Eclipse Adoptium'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Amazon Corretto'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Zulu'),
    path.join(os.homedir(), '.jdks'),
    path.join(os.homedir(), 'scoop', 'apps'),
    paths.runtimes(),
    '/usr/lib/jvm',
    '/Library/Java/JavaVirtualMachines',
    '/opt/homebrew/opt',
    '/usr/local/opt',
  ];
  for (const root of roots) scanJavaRoot(root, candidates, 2);

  return Array.from(candidates);
}

async function detectJava({ refresh = false } = {}) {
  if (refresh) JAVA_CACHE.clear();
  const candidates = candidatePaths();
  const results = [];
  const seen = new Set();
  for (const candidate of candidates) {
    let real;
    try {
      real = fs.realpathSync(candidate);
    } catch {
      real = candidate;
    }
    if (seen.has(real)) continue;
    seen.add(real);
    const info = await inspectJava(candidate);
    if (info) results.push(info);
  }
  // PATH 中的 java 作为兜底候选
  const pathJava = process.platform === 'win32' ? 'java.exe' : 'java';
  const pathInfo = await inspectJava(pathJava);
  if (pathInfo) results.push({ ...pathInfo, path: pathJava });
  results.sort((a, b) => b.major - a.major || a.path.localeCompare(b.path));
  return results;
}

function requiredJavaMajor(mcVersion, versionJson = null) {
  if (versionJson && versionJson.javaVersion && Number(versionJson.javaVersion.majorVersion)) {
    return Number(versionJson.javaVersion.majorVersion);
  }
  const parts = String(mcVersion).split('.').map(Number);
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;
  if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}

function pickJava(list, required) {
  if (!list.length) return null;
  const exact = list.find((item) => item.major === required);
  if (exact) return exact;
  const compatible = list
    .filter((item) => item.major > required && item.major <= required + 2)
    .sort((a, b) => a.major - b.major)[0];
  return compatible || null;
}

function javaDownloadUrl(major) {
  const known = {
    17: 'https://aka.ms/download-jdk/microsoft-jdk-17-windows-x64.zip',
    21: 'https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip',
  };
  return known[major] || '';
}

function findJavaExe(root, depth = 4) {
  if (!root || depth < 0) return null;
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  const direct = entries.find((entry) => entry.isFile() && entry.name.toLowerCase() === JAVA_EXE);
  if (direct) return path.join(root, direct.name);
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findJavaExe(path.join(root, entry.name), depth - 1);
      if (found) return found;
    }
  }
  return null;
}

async function downloadJavaRuntime(major, { signal, onProgress } = {}) {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('当前平台暂不支持自动下载 Java，请手动安装 Java ' + major);
  }
  const url = javaDownloadUrl(major);
  if (!url) throw new Error(`暂不支持自动下载 Java ${major}，请手动安装后到设置中选择 java.exe`);
  const cacheDir = paths.cache();
  const zipFile = path.join(cacheDir, `microsoft-jdk-${major}-windows-x64.zip`);
  const destRoot = ensureDir(path.join(paths.runtimes(), `jdk-${major}`));
  const existing = findJavaExe(destRoot);
  if (existing) return { path: existing, major };
  if (onProgress) onProgress({ stage: '下载 Java 运行时', percent: 0, detail: `Java ${major} · 首次启动需要一次下载` });
  await downloadToFile([url], zipFile, {
    signal,
    timeout: 900000,
    skipIfExists: true,
    onProgress: ({ downloaded, total }) => {
      if (onProgress) {
        const percent = total ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
        onProgress({
          stage: '下载 Java 运行时',
          percent,
          detail: total ? `${(downloaded / 1024 / 1024).toFixed(0)} / ${(total / 1024 / 1024).toFixed(0)} MB` : '正在下载',
        });
      }
    },
  });
  if (onProgress) onProgress({ stage: '解压 Java 运行时', percent: 100, detail: '' });
  const tempDir = path.join(paths.runtimes(), `.extract-${major}-${process.pid}`);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    ensureDir(tempDir);
    const zip = new AdmZip(zipFile);
    zip.extractAllTo(tempDir, true);
    const javaExe = findJavaExe(tempDir);
    if (!javaExe) throw new Error('解压后未找到 java.exe');
    const relative = path.relative(tempDir, javaExe);
    fs.rmSync(destRoot, { recursive: true, force: true });
    fs.renameSync(tempDir, destRoot);
    const target = path.join(destRoot, relative);
    const info = await inspectJava(target);
    if (!info || info.major !== major) throw new Error('下载的 Java 运行时无法运行');
    try {
      fs.rmSync(zipFile, { force: true });
    } catch {
      // ignore
    }
    return { path: target, major, version: info.version };
  } catch (error) {
    try {
      fs.rmSync(zipFile, { force: true });
    } catch {
      // ignore
    }
    throw error;
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function resolveJava({ mcVersion, versionJson, explicitPath, autoDownload = false, anyVersion = false, onProgress } = {}) {
  const settings = store.getSettings();
  const target = explicitPath || settings.javaPath;
  if (target) {
    const info = await inspectJava(target);
    if (!info) throw new Error('指定的 Java 路径无效：' + target);
    return { ...info, required: requiredJavaMajor(mcVersion, versionJson), explicit: true };
  }
  const required = requiredJavaMajor(mcVersion, versionJson);
  let list = await detectJava();
  if (anyVersion) {
    if (list.length) return { ...list[0], required, explicit: false };
    if (autoDownload) await downloadJavaRuntime(required, { onProgress });
    list = await detectJava({ refresh: true });
    if (list.length) return { ...list[0], required, explicit: false };
  }
  let picked = pickJava(list, required);
  if (!picked && autoDownload) {
    await downloadJavaRuntime(required, { onProgress });
    list = await detectJava({ refresh: true });
    picked = pickJava(list, required);
  }
  if (!picked) {
    const error = new Error(`未找到可用的 Java ${required}，请先在设置中选择 Java 路径`);
    error.code = 'JAVA_NOT_FOUND';
    throw error;
  }
  return { ...picked, required, explicit: false };
}

module.exports = { detectJava, inspectJava, resolveJava, requiredJavaMajor, downloadJavaRuntime };
