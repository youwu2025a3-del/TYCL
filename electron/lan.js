'use strict';

const dgram = require('dgram');

let socket = null;
let started = false;
let error = '';
const worlds = new Map();

function prune() {
  const now = Date.now();
  for (const [key, world] of worlds) {
    if (now - world.lastSeen > 12000) worlds.delete(key);
  }
}

function start() {
  if (started) return { ok: true, error };
  started = true;
  socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  socket.on('error', (err) => {
    error = err.message;
    try { socket.close(); } catch { /* ignore */ }
    socket = null;
    started = false;
  });
  socket.on('message', (message, rinfo) => {
    const text = message.toString('utf8');
    const motd = /\[MOTD\]([\s\S]*?)\[\/MOTD\]/i.exec(text);
    const port = /\[AD\]([\s\S]*?)\[\/AD\]/i.exec(text);
    if (!port) return;
    const address = `${rinfo.address}:${Number(port[1]) || 25565}`;
    worlds.set(address, {
      address,
      host: rinfo.address,
      port: Number(port[1]) || 25565,
      motd: (motd ? motd[1] : 'Minecraft LAN World').slice(0, 180),
      lastSeen: Date.now(),
    });
  });
  try {
    socket.bind(4445, () => {
      try { socket.addMembership('224.0.2.60'); } catch { /* 某些网卡不支持组播 */ }
    });
  } catch (err) {
    error = err.message;
    started = false;
  }
  return { ok: started, error };
}

function list() {
  prune();
  return [...worlds.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

function stop() {
  if (socket) {
    try { socket.close(); } catch { /* ignore */ }
  }
  socket = null;
  started = false;
  worlds.clear();
  return { ok: true };
}

module.exports = { start, list, stop };
