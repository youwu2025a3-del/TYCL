'use strict';

const path = require('path');
const { paths } = require('./paths');
const topics = require('./knowledge-topics');

const SEED_VERSION = '3';
let database = null;
let fallback = null;

function seed() {
  try { return topics.generate(); } catch { return require('./knowledge-seed.json'); }
}

function open() {
  if (database || fallback) return;
  try {
    const { DatabaseSync } = require('node:sqlite');
    const file = path.join(paths.data(), 'knowledge.db');
    database = new DatabaseSync(file);
    database.exec(`CREATE TABLE IF NOT EXISTS faq (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patterns TEXT NOT NULL,
      answer TEXT NOT NULL,
      actions TEXT NOT NULL DEFAULT '[]'
    )`);
    database.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    const version = database.prepare("SELECT value FROM meta WHERE key = 'seed_version'").get();
    if (!version || version.value !== SEED_VERSION) {
      database.exec('DELETE FROM faq');
      database.prepare("INSERT INTO meta (key, value) VALUES ('seed_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(SEED_VERSION);
      const insert = database.prepare('INSERT INTO faq (patterns, answer, actions) VALUES (?, ?, ?)');
      for (const item of seed()) {
        insert.run(JSON.stringify(item.patterns || []), item.answer || '', JSON.stringify(item.actions || []));
      }
    }
  } catch {
    database = null;
    fallback = seed();
  }
}

function rows() {
  open();
  if (database) {
    try {
      return database.prepare('SELECT patterns, answer, actions FROM faq').all().map((row) => ({
        patterns: JSON.parse(row.patterns),
        answer: row.answer,
        actions: JSON.parse(row.actions || '[]'),
      }));
    } catch { /* ignore */ }
  }
  return fallback || seed();
}

const STOP_WORDS = new Set(['的','了','吗','呢','吧','啊','我','你','他','她','它','是','有','和','与','在','把','被','这','那','个','一下','怎么','如何','怎样','请问','什么','可以','需要','教程','方法','步骤','问题','怎么办','咋办','咋','能','会','要','想','请','教','告诉','帮我']);
const tokenCache = new Map();

function tokenize(input) {
  const text = String(input || '').toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]+/g, ' ');
  const tokens = new Set();
  for (const word of text.match(/[a-z0-9]+/g) || []) {
    if (word.length >= 2 && !STOP_WORDS.has(word)) tokens.add(word);
  }
  for (const chunk of text.match(/[\u4e00-\u9fa5]+/g) || []) {
    for (const char of chunk) if (!STOP_WORDS.has(char)) tokens.add(char);
    for (let i = 0; i < chunk.length - 1; i += 1) {
      const bigram = chunk.slice(i, i + 2);
      if (!STOP_WORDS.has(bigram)) tokens.add(bigram);
    }
    for (let i = 0; i < chunk.length - 2; i += 1) {
      const trigram = chunk.slice(i, i + 3);
      if (!STOP_WORDS.has(trigram)) tokens.add(trigram);
    }
  }
  return tokens;
}

function tokensForPattern(pattern) {
  const key = String(pattern || '');
  if (!tokenCache.has(key)) tokenCache.set(key, tokenize(key));
  return tokenCache.get(key);
}

function scorePattern(queryNormalized, queryTokens, pattern) {
  const key = String(pattern).toLowerCase().replace(/\s+/g, '');
  if (!key) return 0;
  if (queryNormalized === key) return 200;
  if (key.length >= 3 && queryNormalized.includes(key)) return 60 + key.length;
  const patternTokens = tokensForPattern(pattern);
  let overlap = 0;
  let weighted = 0;
  for (const token of queryTokens) {
    if (!patternTokens.has(token)) continue;
    overlap += 1;
    weighted += token.length >= 2 ? 3 : 1;
  }
  if (overlap < 2 || weighted < 6) return 0;
  return weighted * 4 + overlap;
}

function answer(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/\s+/g, '');
  const queryTokens = tokenize(raw);
  let best = null;
  let bestScore = 0;
  for (const entry of rows()) {
    const patterns = Array.isArray(entry.patterns) ? entry.patterns : [];
    let score = 0;
    for (const pattern of patterns) score = Math.max(score, scorePattern(normalized, queryTokens, pattern));
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  if (!best || bestScore < 8) return null;
  return { text: best.answer, actions: best.actions || [], mode: 'knowledge' };
}
function count() {
  open();
  try { return database ? database.prepare('SELECT COUNT(*) AS count FROM faq').get().count : (fallback || []).length; } catch { return 0; }
}

module.exports = { answer, count };
