'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const AdmZip = require('adm-zip');
const { paths, ensureDir } = require('./paths');
const { downloadToFile } = require('./net');

let tunnel = null;
const BORE_URL = 'https://github.com/ekzhang/bore/releases/download/v0.6.0/bore-v0.6.0-x86_64-pc-windows-msvc.zip';

function borePath() {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'third_party', 'bore', 'bore.exe'),
        path.join(process.resourcesPath, 'bore', 'bore.exe'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'third_party', 'bore', 'bore.exe'),
        path.join(paths.data(), 'tools', 'bore.exe'),
      ]
    : [path.join(__dirname, '..', 'third_party', 'bore', 'bore.exe'), path.join(paths.data(), 'tools', 'bore.exe')];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

async function ensureBore() {
  const existing = borePath();
  if (fs.existsSync(existing)) return existing;
  const tools = ensureDir(path.join(paths.data(), 'tools'));
  const zip = path.join(tools, 'bore.zip');
  await downloadToFile([BORE_URL], zip, { timeout: 90000, skipIfExists: false, retries: 2 });
  const archive = new AdmZip(zip);
  const entry = archive.getEntries().find((item) => !item.isDirectory && item.entryName.endsWith('bore.exe'));
  if (!entry) throw new Error('联机组件下载不完整');
  const target = path.join(tools, 'bore.exe');
  fs.writeFileSync(target, entry.getData());
  try { fs.rmSync(zip, { force: true }); } catch { /* ignore */ }
  return target;
}

function stopTunnel() {
  if (!tunnel) return { ok: true };
  try {
    tunnel.child.kill();
  } catch {
    // ignore
  }
  tunnel = null;
  return { ok: true };
}

async function startTunnel({ port = 25565, server = 'bore.pub', secret = '' } = {}) {
  const localPort = Number(port);
  if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) throw new Error('本地端口无效');
  if (!/^[a-zA-Z0-9.-]+$/.test(String(server || 'bore.pub'))) throw new Error('隧道服务器地址无效');
  stopTunnel();
  const exe = await ensureBore();
  if (!fs.existsSync(exe)) throw new Error('缺少联机组件 bore.exe，请检查网络后重试');
  const args = ['local', String(localPort), '--to', String(server || 'bore.pub')];
  if (secret) args.push('--secret', String(secret));
  const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const state = { child, port: localPort, server, address: '', startedAt: Date.now(), error: '' };
  tunnel = state;
  return new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const finishError = (message) => {
      if (settled) return;
      settled = true;
      state.error = message;
      stopTunnel();
      reject(new Error(message));
    };
    const onData = (chunk) => {
      output += String(chunk);
      const match = /remote_port=(\d+)/.exec(output) || /listening at\s+([a-zA-Z0-9.-]+):(\d+)/.exec(output);
      if (!match) return;
      const remotePort = Number(match[2] || match[1]);
      const host = match[1] && Number.isNaN(Number(match[1])) ? match[1] : String(server || 'bore.pub');
      state.address = `${host}:${remotePort}`;
      if (settled) return;
      settled = true;
      resolve({ ok: true, address: state.address, localPort, server: host, startedAt: state.startedAt });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (error) => finishError(error.message));
    child.on('close', (code) => {
      if (!settled) finishError(`联机隧道启动失败（退出码 ${code}）`);
      else if (tunnel === state) tunnel = null;
    });
    setTimeout(() => finishError('连接联机服务器超时，请检查网络后重试'), 20000);
  });
}

function getTunnelState() {
  if (!tunnel) return { active: false };
  return {
    active: true,
    address: tunnel.address,
    localPort: tunnel.port,
    server: tunnel.server,
    startedAt: tunnel.startedAt,
    error: tunnel.error,
  };
}

module.exports = { startTunnel, stopTunnel, getTunnelState, borePath };
