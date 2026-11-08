'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { getInstance } = require('./instances');
const { downloadToFile } = require('./net');
const tunnel = require('./tunnel');
const serverManager = require('./server-manager');

let active = null;

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function safeName(value) {
  const name = String(value || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 16);
  return name || 'Player';
}

function modFiles(instance) {
  const dir = path.join(instance.gameDir, 'mods');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jar'))
    .map((entry) => ({ name: entry.name, size: fs.statSync(path.join(dir, entry.name)).size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function start({ instanceId, password = '', server = 'bore.pub', whitelist = false } = {}) {
  await stop();
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const mods = modFiles(instance);
  const state = {
    instanceId,
    password: String(password || ''),
    whitelist: Boolean(whitelist),
    server: null,
    localPort: 0,
    address: '',
    startedAt: Date.now(),
  };
  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/manifest') {
        return json(res, 200, {
          instanceId,
          name: instance.name,
          passwordRequired: Boolean(state.password),
          whitelist: state.whitelist,
          mods,
          fingerprint: crypto.createHash('sha1').update(mods.map((mod) => mod.name).join('|')).digest('hex').slice(0, 8),
        });
      }
      if (req.method === 'POST' && url.pathname === '/auth') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const data = JSON.parse(body || '{}');
        if (state.password && String(data.password || '') !== state.password) {
          return json(res, 403, { error: '房间密码错误' });
        }
        const name = safeName(data.name);
        if (state.whitelist) serverManager.addWhitelist(name);
        return json(res, 200, { ok: true, name });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/mods/')) {
        const name = decodeURIComponent(url.pathname.slice('/mods/'.length));
        if (!mods.some((mod) => mod.name === name)) return json(res, 404, { error: 'Mod 不存在' });
        const file = path.join(instance.gameDir, 'mods', name);
        res.writeHead(200, {
          'Content-Type': 'application/java-archive',
          'Content-Length': fs.statSync(file).size,
          'Access-Control-Allow-Origin': '*',
        });
        return fs.createReadStream(file).pipe(res);
      }
      return json(res, 404, { error: 'Not found' });
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  };
  state.server = http.createServer((req, res) => { handler(req, res); });
  await new Promise((resolve, reject) => {
    state.server.once('error', reject);
    state.server.listen(0, '127.0.0.1', resolve);
  });
  state.localPort = state.server.address().port;
  const tunnelInfo = await tunnel.startTunnel({ id: 'room', port: state.localPort, server });
  state.address = tunnelInfo.address;
  active = state;
  return {
    ok: true,
    address: state.address,
    localPort: state.localPort,
    passwordRequired: Boolean(state.password),
    mods,
    fingerprint: crypto.createHash('sha1').update(mods.map((mod) => mod.name).join('|')).digest('hex').slice(0, 8),
  };
}

async function stop() {
  if (active?.server) {
    try { active.server.close(); } catch { /* ignore */ }
  }
  try { tunnel.stopTunnel('room'); } catch { /* ignore */ }
  active = null;
  return { ok: true };
}

function getState() {
  if (!active) return { active: false };
  return { active: true, address: active.address, localPort: active.localPort, passwordRequired: Boolean(active.password), startedAt: active.startedAt };
}

function requestJson(address, method, pathname, body, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const [host, port] = String(address).split(':');
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      hostname: host,
      port: Number(port),
      path: pathname,
      method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {},
      timeout,
    }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(text || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new Error(parsed.error || `房间服务返回 ${res.statusCode}`));
        } catch {
          reject(new Error(`房间服务响应无效：${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('房间服务连接超时')));
    if (data) req.write(data);
    req.end();
  });
}

async function join({ serviceAddress, password = '', name = '', instanceId }) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  if (!serviceAddress) throw new Error('房间服务地址为空');
  const manifest = await requestJson(serviceAddress, 'GET', '/manifest');
  if (manifest.passwordRequired) {
    await requestJson(serviceAddress, 'POST', '/auth', { password, name });
  }
  const localDir = path.join(instance.gameDir, 'mods');
  fs.mkdirSync(localDir, { recursive: true });
  const existing = new Set(fs.readdirSync(localDir));
  const missing = [];
  for (const mod of manifest.mods || []) {
    if (existing.has(mod.name)) continue;
    missing.push(mod.name);
    await downloadToFile([`http://${serviceAddress}/mods/${encodeURIComponent(mod.name)}`], path.join(localDir, mod.name), { timeout: 180000, skipIfExists: false });
  }
  return { manifest, missing, passwordRequired: Boolean(manifest.passwordRequired) };
}

async function authorize({ serviceAddress, password = '', name = '' }) {
  return requestJson(serviceAddress, 'POST', '/auth', { password, name });
}

module.exports = { start, stop, getState, join, authorize };
