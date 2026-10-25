'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { paths, ensureDir } = require('./paths');
const { getInstance } = require('./instances');
const { getVersionJson } = require('./versions');
const { resolveJava } = require('./java');
const { downloadToFile } = require('./net');

let active = null;

const CLIENT_ONLY_HINTS = [
  /sodium/i, /iris/i, /optifine/i, /embeddium/i, /rubidium/i, /oculus/i,
  /journeymap/i, /xaero/i, /minimap/i, /shader/i, /sound.?physics/i,
  /shoulder.?surfing/i, /first.?person/i, /zoom/i, /item.?physic/i,
];

function serverRoot(instance) {
  return ensureDir(path.join(paths.data(), 'servers', instance.id));
}

function serverJarUrl(instance) {
  if (instance.loader === 'vanilla') return null;
  if (instance.loader === 'fabric') {
    return `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(instance.baseVersion)}/${encodeURIComponent(instance.loaderVersion)}/server/jar`;
  }
  if (instance.loader === 'quilt') {
    return `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(instance.baseVersion)}/${encodeURIComponent(instance.loaderVersion)}/server/jar`;
  }
  throw new Error(`${instance.loader} 服务端暂未自动支持，请使用原版或 Fabric 实例`);
}

function runInstaller(executable, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += String(chunk); });
    child.stderr.on('data', (chunk) => { output += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output.slice(-800) || `安装器退出（代码 ${code}）`));
    });
  });
}

async function ensureServerJar(instance, root, javaPath) {
  if (instance.loader === 'vanilla') {
    const target = path.join(root, 'server.jar');
    if (fs.existsSync(target) && fs.statSync(target).size > 1024) return target;
    const json = await getVersionJson(instance.baseVersion);
    const url = json.downloads && json.downloads.server && json.downloads.server.url;
    if (!url) throw new Error('该版本没有可用的官方服务端');
    await downloadToFile([url], target, { sha1: json.downloads.server.sha1, size: json.downloads.server.size, timeout: 120000 });
    return target;
  }
  if (instance.loader === 'fabric' || instance.loader === 'quilt') {
    const launcherName = instance.loader === 'fabric' ? 'fabric-server-launch.jar' : 'quilt-server-launch.jar';
    const launcher = path.join(root, launcherName);
    if (fs.existsSync(launcher) && fs.statSync(launcher).size > 1024) return launcher;
    const installerName = instance.loader === 'fabric' ? 'fabric-installer.jar' : 'quilt-installer.jar';
    const installer = path.join(root, installerName);
    if (!fs.existsSync(installer)) {
      const url = instance.loader === 'fabric'
        ? 'https://maven.fabricmc.net/net/fabricmc/fabric-installer/1.0.1/fabric-installer-1.0.1.jar'
        : 'https://maven.quiltmc.org/repository/release/org/quiltmc/quilt-installer/0.11.2/quilt-installer-0.11.2.jar';
      await downloadToFile([url], installer, { timeout: 120000, skipIfExists: false });
    }
    const args = instance.loader === 'fabric'
      ? ['-jar', installer, 'server', '-mcversion', instance.baseVersion, '-loader', instance.loaderVersion, '-downloadMinecraft']
      : ['-jar', installer, 'install', 'server', instance.baseVersion, '--download-server'];
    await runInstaller(javaPath, args, root);
    if (!fs.existsSync(launcher)) throw new Error(`${instance.loader} 服务端安装器没有生成启动文件`);
    return launcher;
  }
  throw new Error(`${instance.loader} 服务端暂未自动支持，请使用原版或 Fabric 实例`);
}

function modSide(file) {
  const name = path.basename(file);
  try {
    const zip = new AdmZip(file);
    const fabric = zip.getEntry('fabric.mod.json');
    if (fabric) {
      const data = JSON.parse(fabric.getData().toString('utf8'));
      if (data.environment === 'client') return { side: 'client', id: data.id || name, name: data.name || name };
      return { side: 'server', id: data.id || name, name: data.name || name };
    }
    const quilt = zip.getEntry('quilt.mod.json');
    if (quilt) {
      const data = JSON.parse(quilt.getData().toString('utf8'));
      const env = data.quilt_loader && data.quilt_loader.environment;
      if (env === 'client') return { side: 'client', id: data.quilt_loader.id || name, name: name };
      return { side: 'server', id: (data.quilt_loader && data.quilt_loader.id) || name, name };
    }
    for (const entryName of ['META-INF/neoforge.mods.toml', 'META-INF/mods.toml']) {
      const entry = zip.getEntry(entryName);
      if (!entry) continue;
      const text = entry.getData().toString('utf8');
      if (/clientSideOnly\s*=\s*true/i.test(text)) return { side: 'client', id: name, name };
      return { side: 'server', id: name, name };
    }
  } catch {
    // 损坏或非标准 jar 按服务端 mod 处理，至少不会误删
  }
  if (CLIENT_ONLY_HINTS.some((pattern) => pattern.test(name))) return { side: 'client', id: name, name };
  return { side: 'server', id: name, name };
}

function syncServerMods(instance, root) {
  const source = path.join(instance.gameDir, 'mods');
  const target = ensureDir(path.join(root, 'mods'));
  const kept = [];
  const skipped = [];
  fs.readdirSync(target).forEach((name) => fs.rmSync(path.join(target, name), { force: true }));
  if (!fs.existsSync(source)) return { kept, skipped, sourceCount: 0 };
  for (const name of fs.readdirSync(source)) {
    if (!name.endsWith('.jar') && !name.endsWith('.jar.disabled')) continue;
    if (name.endsWith('.disabled')) continue;
    const file = path.join(source, name);
    const side = modSide(file);
    if (side.side === 'client') {
      skipped.push({ file: name, name: side.name });
      continue;
    }
    fs.copyFileSync(file, path.join(target, name));
    kept.push({ file: name, name: side.name });
  }
  return { kept, skipped, sourceCount: kept.length + skipped.length };
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '0.0.0.0');
  });
}

function writeServerProperties(root, port, motd, config = {}) {
  const file = path.join(root, 'server.properties');
  const defaults = {
    'server-port': String(port),
    'online-mode': config.onlineMode ? 'true' : 'false',
    'white-list': config.whitelist ? 'true' : 'false',
    'max-players': String(Math.max(1, Number(config.maxPlayers) || 20)),
    'view-distance': String(Math.min(32, Math.max(3, Number(config.viewDistance) || 10))),
    motd: motd || 'TYCL Room',
    'enable-query': 'false',
    'spawn-protection': '0',
    difficulty: ['peaceful', 'easy', 'normal', 'hard'].includes(config.difficulty) ? config.difficulty : 'normal',
    gamemode: 'survival',
  };
  let current = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const index = line.indexOf('=');
      current[line.slice(0, index)] = line.slice(index + 1);
    }
  } catch {
    current = {};
  }
  const merged = {
    ...defaults,
    ...current,
    'server-port': String(port),
    'online-mode': config.onlineMode ? 'true' : 'false',
    'white-list': config.whitelist ? 'true' : 'false',
    'max-players': String(Math.max(1, Number(config.maxPlayers) || 20)),
    'view-distance': String(Math.min(32, Math.max(3, Number(config.viewDistance) || 10))),
    difficulty: defaults.difficulty,
    motd: motd || current.motd || 'TYCL Room',
  };
  fs.writeFileSync(file, Object.entries(merged).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', 'utf8');
}

function offlineUuid(name) {
  const crypto = require('crypto');
  const hash = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function writeWhitelist(root, names) {
  const list = (Array.isArray(names) ? names : [])
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .map((name) => ({ uuid: offlineUuid(name), name }));
  fs.writeFileSync(path.join(root, 'whitelist.json'), JSON.stringify(list, null, 2), 'utf8');
}

function modFingerprint(mods) {
  const crypto = require('crypto');
  const names = (mods || []).map((item) => item.file).sort();
  return crypto.createHash('sha1').update(names.join('|')).digest('hex').slice(0, 8);
}

async function startDedicatedServer(instanceId, { port = 25565, motd = 'TYCL Room', memoryMb = 0, config = {} } = {}) {
  if (active) throw new Error('已有服务端在运行');
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const root = serverRoot(instance);
  let actualPort = Number(port) || 25565;
  for (let attempt = 0; attempt < 20 && !(await isPortFree(actualPort)); attempt += 1) actualPort += 1;
  const java = await resolveJava({ mcVersion: instance.baseVersion, explicitPath: instance.javaPath || '', autoDownload: true });
  if (java.major < java.required) throw new Error(`Java ${java.major} 低于服务端需要的 Java ${java.required}`);
  const jar = await ensureServerJar(instance, root, java.path);
  const mods = syncServerMods(instance, root);
  const fingerprint = modFingerprint(mods.kept);
  const roomMotd = `${motd || 'TYCL Room'} · ${fingerprint}`;
  writeServerProperties(root, actualPort, roomMotd, config);
  writeWhitelist(root, config.whitelistNames || []);
  fs.writeFileSync(path.join(root, 'eula.txt'), 'eula=true\n', 'utf8');
  const max = Number(memoryMb) || instance.javaMemoryMb || 4096;
  const child = spawn(java.path, ['-Xms512M', `-Xmx${Math.max(1024, max)}M`, '-jar', jar, 'nogui'], {
    cwd: root,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const state = {
    child,
    instanceId,
    instanceName: instance.name,
    port: actualPort,
    root,
    startedAt: Date.now(),
    status: 'starting',
    logs: [],
    mods,
    fingerprint,
    config,
    java: java.path,
    error: '',
  };
  active = state;
  const append = (line) => {
    state.logs.push(String(line).trimEnd());
    if (state.logs.length > 240) state.logs.splice(0, state.logs.length - 240);
  };
  child.stdout.on('data', (chunk) => {
    const text = String(chunk);
    append(text);
    if (/Done \([\d.]+s\)!/.test(text) || /For help, type/.test(text)) state.status = 'running';
  });
  child.stderr.on('data', (chunk) => {
    const text = String(chunk);
    append(text);
    if (/Address already in use|FAILED TO BIND|Exception/i.test(text)) state.error = text.slice(0, 500);
  });
  child.on('error', (error) => {
    state.status = 'error';
    state.error = error.message;
  });
  child.on('close', (code) => {
    state.status = code === 0 ? 'stopped' : 'error';
    if (code !== 0 && !state.error) state.error = `服务端退出（代码 ${code}）`;
    if (active === state) active = null;
  });
  const deadline = Date.now() + 120000;
  while (state.status === 'starting' && Date.now() < deadline) {
    if (state.error && /Address already in use|FAILED TO BIND/i.test(state.error)) throw new Error(state.error);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (state.status !== 'running') {
    stopDedicatedServer();
    throw new Error(state.error || '服务端启动超时，请查看日志');
  }
  return { ...getServerState(), root, mods };
}

function getServerState() {
  if (!active) return { active: false };
  return {
    active: true,
    status: active.status,
    instanceId: active.instanceId,
    instanceName: active.instanceName,
    port: active.port,
    root: active.root,
    startedAt: active.startedAt,
    logs: active.logs.slice(-80),
    mods: active.mods,
    java: active.java,
    error: active.error,
  };
}

function stopDedicatedServer() {
  if (!active) return { ok: true };
  const state = active;
  try {
    state.child.stdin.write('stop\n');
  } catch {
    // ignore
  }
  setTimeout(() => {
    try { state.child.kill(); } catch { /* ignore */ }
  }, 5000);
  return { ok: true };
}

function forceStopServer() {
  if (!active) return;
  try { active.child.kill(); } catch { /* ignore */ }
  active = null;
}

function getServerFingerprint(instanceId) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const source = path.join(instance.gameDir, 'mods');
  const kept = [];
  if (fs.existsSync(source)) {
    for (const name of fs.readdirSync(source)) {
      if (!name.endsWith('.jar') || name.endsWith('.jar.disabled')) continue;
      if (modSide(path.join(source, name)).side !== 'client') kept.push({ file: name });
    }
  }
  return { fingerprint: modFingerprint(kept), count: kept.length };
}

module.exports = { startDedicatedServer, getServerState, stopDedicatedServer, forceStopServer, syncServerMods, modSide, getServerFingerprint };
