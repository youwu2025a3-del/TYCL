'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { paths } = require('./paths');
const { readJson, writeJsonAtomic } = require('./store');

function serversFile() {
  return path.join(paths.data(), 'servers.json');
}

function loadServers() {
  const data = readJson(serversFile(), { servers: [] });
  return Array.isArray(data.servers) ? data.servers : [];
}

function saveServers(servers) {
  writeJsonAtomic(serversFile(), { version: 1, servers });
}

function normalizeAddress(input) {
  let address = String(input || '').trim();
  if (!address) throw new Error('服务器地址不能为空');
  if (!address.includes(':')) address += ':25565';
  const [host, portText] = address.split(':');
  const port = Number(portText);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('服务器地址格式应为 地址:端口');
  return { host, port, address: `${host}:${port}` };
}

function listServers() {
  return loadServers();
}

function addServer({ name, address, note }) {
  const normalized = normalizeAddress(address);
  const servers = loadServers();
  if (servers.some((server) => server.address === normalized.address)) throw new Error('这个服务器已经在列表里了');
  const server = {
    id: crypto.randomUUID(),
    name: String(name || normalized.host).trim().slice(0, 48) || normalized.host,
    address: normalized.address,
    host: normalized.host,
    port: normalized.port,
    note: String(note || '').slice(0, 120),
    createdAt: new Date().toISOString(),
  };
  servers.unshift(server);
  saveServers(servers);
  return server;
}

function removeServer(id) {
  const servers = loadServers();
  const next = servers.filter((server) => server.id !== id);
  saveServers(next);
  return { ok: next.length !== servers.length };
}

function varint(value) {
  const bytes = [];
  let current = value >>> 0;
  do {
    let byte = current & 0x7f;
    current >>>= 7;
    if (current) byte |= 0x80;
    bytes.push(byte);
  } while (current);
  return Buffer.from(bytes);
}

function string(value) {
  const data = Buffer.from(value, 'utf8');
  return Buffer.concat([varint(data.length), data]);
}

function packet(id, payload) {
  const body = Buffer.concat([varint(id), payload]);
  return Buffer.concat([varint(body.length), body]);
}

function readVarint(buffer, offset = 0) {
  let value = 0;
  let shift = 0;
  let position = offset;
  while (position < buffer.length) {
    const byte = buffer[position++];
    value |= (byte & 0x7f) << shift;
    if (!(byte & 0x80)) return { value, offset: position };
    shift += 7;
    if (shift > 35) throw new Error('VarInt 过长');
  }
  return null;
}

function pingServer(input, timeout = 3500) {
  return new Promise((resolve) => {
    let target;
    try {
      target = normalizeAddress(input);
    } catch (error) {
      resolve({ address: String(input || ''), online: false, error: error.message });
      return;
    }
    const started = Date.now();
    let settled = false;
    let buffer = Buffer.alloc(0);
    const socket = net.createConnection({ host: target.host, port: target.port });
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ...target, ...result });
    };
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      const handshake = packet(
        0,
        Buffer.concat([
          varint(47),
          string(target.host),
          Buffer.from([(target.port >> 8) & 0xff, target.port & 0xff]),
          varint(1),
        ]),
      );
      socket.write(Buffer.concat([handshake, packet(0, Buffer.alloc(0))]));
    });
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const length = readVarint(buffer);
      if (!length || buffer.length < length.offset + length.value) return;
      const body = buffer.subarray(length.offset, length.offset + length.value);
      const id = readVarint(body);
      if (!id || id.value !== 0) return;
      const textLength = readVarint(body, id.offset);
      if (!textLength) return;
      const text = body.subarray(textLength.offset, textLength.offset + textLength.value).toString('utf8');
      try {
        const data = JSON.parse(text);
        const motd = data.description && typeof data.description === 'object'
          ? String(data.description.text || (data.description.extra || []).map((item) => item.text || '').join(''))
          : String(data.description || '');
        finish({
          online: true,
          latency: Date.now() - started,
          version: data.version ? data.version.name : '',
          protocol: data.version ? data.version.protocol : 0,
          players: data.players || { online: 0, max: 0 },
          motd: motd.replace(/§[0-9a-fk-or]/gi, '').slice(0, 300),
          favicon: data.favicon || '',
        });
      } catch {
        finish({ online: false, error: '服务器返回了无法解析的状态' });
      }
    });
    socket.on('timeout', () => finish({ online: false, error: '连接超时' }));
    socket.on('error', (error) => finish({ online: false, error: error.message }));
    socket.on('close', () => {
      if (!settled) finish({ online: false, error: '连接已关闭' });
    });
  });
}

async function pingAll() {
  const servers = loadServers();
  return Promise.all(servers.map(async (server) => ({ ...server, status: await pingServer(server.address) })));
}

module.exports = { listServers, addServer, removeServer, pingServer, pingAll, normalizeAddress };
