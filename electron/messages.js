'use strict';

const fs = require('fs');
const path = require('path');
const { fetchJson } = require('./net');
const { paths, ensureDir } = require('./paths');
const { store } = require('./store');

const DEFAULT_FEED = 'https://tycl-1327923012.cos.ap-shanghai.myqcloud.com/tycl/blessings.json';
const FILE_NAME = 'messages.json';
// 这些是早期内置示例，不能出现在真实消息中心里。
const REMOVED_SAMPLE_IDS = new Set(['welcome-2026-11', 'christmas-2026']);
let cached = null;

function file() {
  return path.join(paths.data(), FILE_NAME);
}

function normalize(item, source = 'remote') {
  const id = String(item.id || item.uuid || '').trim();
  if (!id) return null;
  return {
    id,
    title: String(item.title || '一条新消息').trim().slice(0, 120),
    message: String(item.message || item.body || item.content || '').trim().slice(0, 4000),
    author: String(item.author || 'A3Y8').trim().slice(0, 40),
    date: String(item.date || item.publishedAt || '').trim().slice(0, 40),
    type: item.type === 'notice' ? 'notice' : 'blessing',
    link: /^https?:\/\//i.test(item.link || '') ? item.link : '',
    source,
  };
}

function empty() {
  return { messages: [], read: [], updatedAt: 0 };
}

function read() {
  if (cached) return cached;
  try {
    const data = JSON.parse(fs.readFileSync(file(), 'utf8'));
    cached = {
      messages: Array.isArray(data.messages) ? data.messages
        .filter((item) => !REMOVED_SAMPLE_IDS.has(String(item.id || '')))
        .map((item) => normalize(item, item.source || 'local')).filter(Boolean) : [],
      read: Array.isArray(data.read) ? [...new Set(data.read.map(String))] : [],
      updatedAt: Number(data.updatedAt) || 0,
    };
  } catch {
    cached = empty();
  }
  return cached;
}

function write(data) {
  cached = data;
  ensureDir(path.dirname(file()));
  fs.writeFileSync(file(), JSON.stringify(data, null, 2), 'utf8');
}

function merge(items) {
  const data = read();
  const byId = new Map(data.messages.map((item) => [item.id, item]));
  for (const item of items) {
    const old = byId.get(item.id);
    byId.set(item.id, old ? { ...old, ...item, source: old.source === 'local' ? 'remote' : old.source } : item);
  }
  data.messages = [...byId.values()].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  data.updatedAt = Date.now();
  return data;
}

function snapshot(data = read(), remoteError = '') {
  const unread = data.messages.filter((item) => !data.read.includes(item.id)).length;
  return { messages: data.messages, read: data.read, unread, updatedAt: data.updatedAt, error: remoteError };
}

async function refresh() {
  const url = String(store.getSettings().blessingFeedUrl || DEFAULT_FEED).trim() || DEFAULT_FEED;
  let error = '';
  let items = [];
  try {
    const payload = await fetchJson(url, { timeout: 12000 });
    const raw = Array.isArray(payload) ? payload : payload.items || payload.messages || [];
    items = raw.map((item) => normalize(item)).filter(Boolean);
  } catch (err) {
    error = err.message;
  }

  if (items.length) {
    const data = merge(items);
    write(data);
    return snapshot(data, '');
  }

  let data = read();
  return snapshot(data, error);
}

function list() {
  return snapshot();
}

function markRead(ids = null) {
  const data = read();
  if (Array.isArray(ids) && ids.length) {
    data.read = [...new Set([...data.read, ...ids.map(String)])];
  } else {
    data.read = data.messages.map((item) => item.id);
  }
  write(data);
  return snapshot(data);
}

module.exports = { refresh, list, markRead, DEFAULT_FEED };
