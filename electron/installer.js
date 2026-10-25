'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { ensureDir, safeResolveWithin } = require('./paths');
const { store } = require('./store');
const { getVersionJson, getLoaders, getLoaderProfile, getForgeInstallerUrl, downloadCandidates } = require('./versions');
const { downloadToFile, mapLimit } = require('./net');
const { resolveJava, requiredJavaMajor } = require('./java');
const { createInstance, updateInstance } = require('./instances');

const MAVEN_FALLBACK = 'https://libraries.minecraft.net/';

const OS_NAME = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
const OS_ARCH = process.arch === 'x64' ? 'x86_64' : process.arch === 'arm64' ? 'arm64' : process.arch;

function ruleMatches(rule) {
  if (rule.os) {
    if (rule.os.name && rule.os.name !== OS_NAME) return false;
    if (rule.os.arch && rule.os.arch !== OS_ARCH && !(rule.os.arch === 'x86' && OS_ARCH === 'x86_64')) return false;
    if (rule.os.version) {
      try {
        if (!new RegExp(rule.os.version).test(process.getSystemVersion ? process.getSystemVersion() : '')) return false;
      } catch {
        // 忽略无效的系统版本正则
      }
    }
  }
  if (rule.features) {
    for (const [key, allowed] of Object.entries(rule.features)) {
      const features = { has_custom_resolution: false, is_demo_user: false, has_quick_plays_support: false, is_quick_play_singleplayer: false };
      if (Boolean(features[key]) !== Boolean(allowed)) return false;
    }
  }
  return true;
}

function rulesAllow(rules) {
  if (!Array.isArray(rules) || rules.length === 0) return true;
  let allowed = false;
  for (const rule of rules) {
    if (ruleMatches(rule)) {
      if (rule.action === 'allow') allowed = true;
      else if (rule.action === 'disallow') allowed = false;
    }
  }
  return allowed;
}

function nativeMatchesPlatform(name) {
  const match = /:natives-([^:]+)$/.exec(String(name));
  if (!match) return true;
  const classifier = match[1];
  if (OS_NAME === 'windows') {
    if (OS_ARCH === 'arm64') return classifier === 'windows-arm64';
    return classifier === 'windows';
  }
  if (OS_NAME === 'osx') {
    if (OS_ARCH === 'arm64') return classifier === 'macos-arm64';
    return classifier === 'macos';
  }
  if (OS_NAME === 'linux') {
    if (OS_ARCH === 'arm64') return classifier === 'linux-arm64';
    return classifier === 'linux';
  }
  return true;
}

function sanitizeLibraries(libraries) {
  return (libraries || []).filter((library) => rulesAllow(library.rules) && nativeMatchesPlatform(library.name));
}

function mavenCoordinate(name) {
  const [coords, ext] = String(name).split('@');
  const parts = coords.split(':');
  if (parts.length < 3) throw new Error('无效的 Maven 坐标：' + name);
  const [group, artifact, version, classifier] = parts;
  const extension = ext || 'jar';
  return {
    group,
    artifact,
    version,
    classifier,
    extension,
    path: [
      group.replace(/\./g, '/'),
      artifact,
      version,
      `${artifact}-${version}${classifier ? '-' + classifier : ''}.${extension}`,
    ].join('/'),
  };
}

function libraryDownload(library) {
  if (!rulesAllow(library.rules)) return null;
  const artifact = library.downloads && library.downloads.artifact;
  let relativePath;
  let url;
  let sha1;
  let size;
  if (artifact && artifact.path) {
    relativePath = artifact.path;
    url = artifact.url;
    sha1 = artifact.sha1;
    size = artifact.size;
  } else {
    const coord = mavenCoordinate(library.name);
    relativePath = coord.path;
    const base = library.url || MAVEN_FALLBACK;
    url = new URL(relativePath, base.endsWith('/') ? base : base + '/').toString();
    sha1 = library.sha1 || null;
    size = library.size || null;
  }
  return { relativePath, url, sha1, size, name: library.name };
}

function nativeDownloads(library) {
  if (!rulesAllow(library.rules) || !library.natives) return [];
  const nativeKey = library.natives[OS_NAME];
  if (!nativeKey) return [];
  const classifier = nativeKey.replace('${arch}', process.arch === 'x64' ? '64' : '32');
  const downloads = library.downloads || {};
  const artifact = downloads.classifiers && downloads.classifiers[classifier];
  if (artifact && artifact.path) {
    return [{ relativePath: artifact.path, url: artifact.url, sha1: artifact.sha1, size: artifact.size, extract: library.extract }];
  }
  const coord = mavenCoordinate(library.name);
  const pathWithClassifier = coord.path.replace(/\.jar$/, `-${classifier}.jar`);
  const base = library.url || MAVEN_FALLBACK;
  return [
    {
      relativePath: pathWithClassifier,
      url: new URL(pathWithClassifier, base.endsWith('/') ? base : base + '/').toString(),
      sha1: null,
      size: null,
      extract: library.extract,
    },
  ];
}

function extractNatives(nativeJars, destination) {
  ensureDir(destination);
  for (const item of nativeJars) {
    if (!fs.existsSync(item.file)) continue;
    try {
      const zip = new AdmZip(item.file);
      const excludes = (item.extract && item.extract.exclude) || ['META-INF/'];
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        if (excludes.some((prefix) => entry.entryName.startsWith(prefix))) continue;
        const target = safeResolveWithin(destination, entry.entryName);
        ensureDir(path.dirname(target));
        fs.writeFileSync(target, entry.getData());
      }
    } catch {
      // 某些原生库并非 zip，不影响核心安装，交给启动时处理
    }
  }
}

async function downloadLibraries(task, versionJson, libraries, start, end, stageName = '游戏依赖') {
  const all = [];
  const natives = [];
  for (const library of libraries) {
    const item = libraryDownload(library);
    if (item) all.push(item);
    for (const native of nativeDownloads(library)) natives.push(native);
  }
  const downloads = [...all, ...natives];
  const unique = Array.from(new Map(downloads.map((item) => [item.relativePath, item])).values());
  let done = 0;
  let downloadedBytes = 0;
  const startedAt = Date.now();
  const root = store.getSettings().gameDir;
  task.report({ percent: start, stage: stageName, detail: `0 / ${unique.length}` });
  await mapLimit(unique, 12, async (item) => {
    if (task.signal.aborted) throw Object.assign(new Error('已取消'), { cancelled: true });
    const destination = path.join(root, 'libraries', item.relativePath);
    const candidates = downloadCandidates(item.url, 'library');
    await downloadToFile(candidates, destination, {
      sha1: item.sha1 || undefined,
      size: item.size || undefined,
      signal: task.signal,
      skipIfExists: true,
    });
    try { downloadedBytes += fs.statSync(destination).size; } catch {}
    done += 1;
    const speed = downloadedBytes / Math.max(1, Date.now() - startedAt) / 1024;
    task.report({
      percent: start + ((end - start) * done) / Math.max(1, unique.length),
      stage: stageName,
      detail: `${done} / ${unique.length}${speed > 0.05 ? ` · ${speed.toFixed(1)} MB/s` : ''}`,
    });
  });
  const nativeJars = natives
    .filter((item) => fs.existsSync(path.join(root, 'libraries', item.relativePath)))
    .map((item) => ({ file: path.join(root, 'libraries', item.relativePath), extract: item.extract }));
  extractNatives(nativeJars, path.join(root, 'versions', versionJson.id, 'natives'));
  return { libraries: unique.length, natives: nativeJars.length };
}

async function downloadAssets(task, versionJson, start, end) {
  const root = store.getSettings().gameDir;
  const assetIndexInfo = versionJson.assetIndex;
  if (!assetIndexInfo || !assetIndexInfo.url) return { assets: 0 };
  const indexPath = path.join(root, 'assets', 'indexes', `${assetIndexInfo.id}.json`);
  await downloadToFile(
    downloadCandidates(assetIndexInfo.url, 'assetIndex', { assetId: assetIndexInfo.id }),
    indexPath,
    { sha1: assetIndexInfo.sha1, size: assetIndexInfo.size, signal: task.signal },
  );
  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch {
    throw new Error('资源索引解析失败');
  }
  const objects = Object.values(index.objects || {});
  let done = 0;
  let downloadedBytes = 0;
  const startedAt = Date.now();
  task.report({ percent: start, stage: '游戏资源', detail: `0 / ${objects.length}` });
  await mapLimit(objects, 20, async (object) => {
    if (task.signal.aborted) throw Object.assign(new Error('已取消'), { cancelled: true });
    const hash = object.hash;
    const destination = path.join(root, 'assets', 'objects', hash.slice(0, 2), hash);
    if (fs.existsSync(destination) && fs.statSync(destination).size === object.size) {
      done += 1;
      downloadedBytes += object.size || 0;
      const speed = downloadedBytes / Math.max(1, Date.now() - startedAt) / 1024;
      task.report({
        percent: start + ((end - start) * done) / Math.max(1, objects.length),
        stage: '游戏资源',
        detail: `${done} / ${objects.length}${speed > 0.05 ? ` · ${speed.toFixed(1)} MB/s` : ''}`,
      });
      return;
    }
    const url = `https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`;
    await downloadToFile(downloadCandidates(url, 'asset'), destination, {
      sha1: hash,
      size: object.size,
      signal: task.signal,
      skipIfExists: false,
    });
    done += 1;
    downloadedBytes += object.size || 0;
    const speed = downloadedBytes / Math.max(1, Date.now() - startedAt) / 1024;
    task.report({
      percent: start + ((end - start) * done) / Math.max(1, objects.length),
      stage: '游戏资源',
      detail: `${done} / ${objects.length}${speed > 0.05 ? ` · ${speed.toFixed(1)} MB/s` : ''}`,
    });
  });
  return { assets: objects.length };
}

function ensureLauncherProfiles(root) {
  const file = path.join(root, 'launcher_profiles.json');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      JSON.stringify({ profiles: {}, settings: { crashed: '', lastUsed: '', lastMigration: 0 }, version: 3 }, null, 2),
      'utf8',
    );
  }
}

async function ensureBaseVersion(task, mcVersion, start = 2, end = 70) {
  const root = store.getSettings().gameDir;
  ensureDir(root);
  ensureDir(path.join(root, 'versions'));
  ensureDir(path.join(root, 'libraries'));
  ensureDir(path.join(root, 'assets', 'objects'));
  ensureDir(path.join(root, 'assets', 'indexes'));
  ensureLauncherProfiles(root);
  task.report({ percent: start, stage: '解析版本', detail: mcVersion });
  const versionJson = await getVersionJson(mcVersion);
  const versionDir = ensureDir(path.join(root, 'versions', mcVersion));
  const client = versionJson.downloads && versionJson.downloads.client;
  if (!client || !client.url) throw new Error('该版本缺少客户端下载信息');
  const jarPath = path.join(versionDir, `${mcVersion}.jar`);
  await downloadToFile(downloadCandidates(client.url, 'client', { mcVersion }), jarPath, {
    sha1: client.sha1,
    size: client.size,
    signal: task.signal,
  });
  task.report({ percent: start + (end - start) * 0.06, stage: '游戏核心', detail: '客户端已就绪' });
  const launchJson = {
    ...versionJson,
    libraries: sanitizeLibraries(versionJson.libraries || []),
  };
  fs.writeFileSync(path.join(versionDir, `${mcVersion}.json`), JSON.stringify(launchJson, null, 2), 'utf8');

  const libEnd = start + (end - start) * 0.38;
  await downloadLibraries(task, launchJson, launchJson.libraries, start + (end - start) * 0.06, libEnd, '游戏依赖');
  await downloadAssets(task, launchJson, libEnd, end);
  return { versionJson: launchJson, jarPath };
}

function mergeLoaderProfile(base, profile) {
  const merged = JSON.parse(JSON.stringify(base));
  merged.id = profile.id;
  merged.mainClass = profile.mainClass || merged.mainClass;
  delete merged.inheritsFrom;
  merged.releaseTime = profile.releaseTime || merged.releaseTime;
  merged.time = profile.time || merged.time;
  merged.type = 'release';

  const keyOf = (library) => {
    try {
      const coord = mavenCoordinate(library.name);
      return `${coord.group}:${coord.artifact}`;
    } catch {
      return library.name;
    }
  };
  const libraries = new Map();
  for (const library of base.libraries || []) libraries.set(keyOf(library), library);
  for (const library of profile.libraries || []) libraries.set(keyOf(library), library);
  merged.libraries = Array.from(libraries.values());

  const baseArgs = base.arguments || {};
  const profileArgs = profile.arguments || {};
  merged.arguments = {
    jvm: [...(baseArgs.jvm || []), ...(profileArgs.jvm || [])],
    game: [...(baseArgs.game || []), ...(profileArgs.game || [])],
  };
  if (base.minecraftArguments && !merged.arguments.game.length) {
    merged.minecraftArguments = base.minecraftArguments;
  }
  merged.libraries = sanitizeLibraries(merged.libraries);
  return merged;
}

async function installFabricLike(task, loader, mcVersion, loaderVersion, baseJson, rangeStart, rangeEnd) {
  const root = store.getSettings().gameDir;
  let selectedVersion = loaderVersion;
  if (!selectedVersion) {
    const loaders = await getLoaders(mcVersion);
    selectedVersion = loaders[loader] && loaders[loader].recommended;
  }
  if (!selectedVersion) throw new Error(`没有找到可用的 ${loader} 加载器版本`);
  task.report({ percent: rangeStart, stage: `安装 ${loader}`, detail: selectedVersion });
  const profile = await getLoaderProfile(loader, mcVersion, selectedVersion);
  const merged = mergeLoaderProfile(baseJson, profile);
  const versionId = merged.id;
  const versionDir = ensureDir(path.join(root, 'versions', versionId));
  fs.writeFileSync(path.join(versionDir, `${versionId}.json`), JSON.stringify(merged, null, 2), 'utf8');
  // MCLC 会用游戏版本号查找基础版本 JSON，同时准备一份以避免启动时联网
  fs.writeFileSync(path.join(versionDir, `${mcVersion}.json`), JSON.stringify(baseJson, null, 2), 'utf8');
  const baseJar = path.join(root, 'versions', mcVersion, `${mcVersion}.jar`);
  if (fs.existsSync(baseJar)) {
    const targetJar = path.join(versionDir, `${versionId}.jar`);
    if (!fs.existsSync(targetJar)) fs.copyFileSync(baseJar, targetJar);
  }
  const baseAssetIndex = path.join(root, 'assets', 'indexes', `${baseJson.assetIndex?.id || mcVersion}.json`);
  const customAssetIndex = path.join(root, 'assets', 'indexes', `${versionId}.json`);
  if (fs.existsSync(baseAssetIndex) && !fs.existsSync(customAssetIndex)) {
    fs.copyFileSync(baseAssetIndex, customAssetIndex);
  }
  await downloadLibraries(task, merged, merged.libraries || [], rangeStart + 3, rangeEnd - 2, `${loader} 依赖`);
  return {
    versionId,
    loader,
    loaderVersion: selectedVersion,
    javaMajor: requiredJavaMajor(mcVersion, merged),
  };
}

function runProcess(command, args, options, onLog) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const handle = (chunk) => {
      const text = chunk.toString();
      output += text;
      if (onLog) onLog(text);
      if (output.length > 20000) output = output.slice(-12000);
    };
    child.stdout.on('data', handle);
    child.stderr.on('data', handle);
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`安装器退出码 ${code}\n${output.slice(-1600)}`));
    });
    if (options.onChild) options.onChild(child);
  });
}

function findForgeVersion(mcVersion) {
  const root = store.getSettings().gameDir;
  const versionsDir = path.join(root, 'versions');
  const entries = fs.existsSync(versionsDir) ? fs.readdirSync(versionsDir, { withFileTypes: true }) : [];
  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const json = path.join(versionsDir, entry.name, `${entry.name}.json`);
    if (!fs.existsSync(json)) continue;
    if (entry.name.includes('forge')) {
      try {
        const data = JSON.parse(fs.readFileSync(json, 'utf8'));
        if (data.id === entry.name) {
          matches.push({ id: entry.name, mtime: fs.statSync(json).mtimeMs, loader: /neo/i.test(entry.name) ? 'neoforge' : 'forge' });
        }
      } catch {
        // ignore
      }
    }
  }
  matches.sort((a, b) => b.mtime - a.mtime);
  return matches.find((item) => item.id.includes(mcVersion)) || matches[0] || null;
}

async function installForge(task, mcVersion, loaderVersion, rangeStart, rangeEnd) {
  const root = store.getSettings().gameDir;
  let selectedVersion = loaderVersion;
  if (!selectedVersion) {
    const loaders = await getLoaders(mcVersion);
    selectedVersion = loaders.forge.recommended || (loaders.forge.versions[0] && loaders.forge.versions[0].version);
  }
  if (!selectedVersion) throw new Error('该版本没有可用的 Forge 安装包');
  task.report({ percent: rangeStart, stage: '下载 Forge 安装器', detail: selectedVersion });
  const installerUrl = await getForgeInstallerUrl(mcVersion, selectedVersion);
  const installerFile = path.join(store.getSettings().gameDir, 'tycl-cache', `forge-${mcVersion}-${selectedVersion}-installer.jar`);
  await downloadToFile([installerUrl], installerFile, { signal: task.signal, timeout: 180000 });
  const java = await resolveJava({ mcVersion, anyVersion: true });
  task.report({ percent: rangeStart + 4, stage: '运行 Forge 安装器', detail: '安装可能需要几分钟' });
  let child = null;
  task.setCancelHandler(() => {
    if (child) child.kill();
  });
  await runProcess(
    java.path,
    ['-jar', installerFile, '--installClient', root],
    { cwd: root, onChild: (proc) => { child = proc; } },
    (text) => {
      const line = text.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0];
      if (line) task.report({ percent: Math.min(rangeEnd - 1, task.percent + 0.5), stage: '运行 Forge 安装器', detail: line.slice(0, 100) });
    },
  );
  const found = findForgeVersion(mcVersion);
  if (!found) throw new Error('Forge 安装器运行结束，但未找到生成的版本配置');
  return {
    versionId: found.id,
    loader: 'forge',
    loaderVersion: selectedVersion,
    javaMajor: requiredJavaMajor(mcVersion),
    forgeInstaller: installerFile,
  };
}

async function installVersionCore(task, { mcVersion, loader = 'vanilla', loaderVersion = '' }) {
  const base = await ensureBaseVersion(task, mcVersion, 2, loader === 'vanilla' ? 94 : 68);
  let result = {
    versionId: mcVersion,
    loader: 'vanilla',
    loaderVersion: '',
    javaMajor: requiredJavaMajor(mcVersion, base.versionJson),
  };
  if (loader === 'fabric' || loader === 'quilt') {
    result = await installFabricLike(task, loader, mcVersion, loaderVersion, base.versionJson, 70, 92);
  } else if (loader === 'forge') {
    result = await installForge(task, mcVersion, loaderVersion, 70, 92);
  } else if (loader !== 'vanilla') {
    throw new Error('暂不支持该模组加载器：' + loader);
  }
  task.report({ percent: 94, stage: '整理启动配置', detail: '正在创建实例' });
  return { ...result, mcVersion, baseVersion: mcVersion };
}

function makeInstanceName(mcVersion, loader, customName) {
  if (customName) return customName;
  const labels = { vanilla: '原版', fabric: 'Fabric', forge: 'Forge', quilt: 'Quilt' };
  return `${mcVersion} · ${labels[loader] || loader}`;
}

async function installGameTask(task, options) {
  const root = store.getSettings().gameDir;
  ensureDir(root);
  const result = await installVersionCore(task, options);
  const instance = createInstance({
    name: makeInstanceName(options.mcVersion, options.loader, options.instanceName),
    baseVersion: options.mcVersion,
    versionId: result.versionId,
    loader: result.loader,
    loaderVersion: result.loaderVersion,
    icon: result.loader === 'vanilla' ? 'grass' : result.loader,
    javaMemoryMb: options.memoryMb || null,
    forgeInstaller: result.forgeInstaller || '',
  });
  task.report({ percent: 100, stage: '完成', detail: '已创建游戏实例' }, true);
  return { instance, ...result };
}

async function ensureGameForModpack(task, { mcVersion, loader, loaderVersion }) {
  return installVersionCore(task, { mcVersion, loader, loaderVersion });
}

module.exports = {
  installGameTask,
  ensureGameForModpack,
  installVersionCore,
  ensureBaseVersion,
  downloadToFile,
  makeInstanceName,
  mergeLoaderProfile,
  rulesAllow,
  sanitizeLibraries,
  mavenCoordinate,
  findForgeVersion,
};
