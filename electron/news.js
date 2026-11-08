'use strict';

const fs = require('fs');
const path = require('path');
const { fetchJson } = require('./net');
const { paths } = require('./paths');

const NEWS_URL = 'https://launchercontent.mojang.com/v2/news.json';
const IMAGE_BASE = 'https://launchercontent.mojang.com';
const CACHE_TTL = 10 * 60 * 1000;

let cache = null;

const EDITION_MAP = {
  Java: { key: 'java', label: 'Java 版' },
  Bedrock: { key: 'bedrock', label: '基岩版' },
  Dungeons: { key: 'dungeons', label: '地牢' },
  DungeonsII: { key: 'dungeons', label: '地牢 II' },
  Legends: { key: 'legends', label: '传奇' },
};

function absoluteImage(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return IMAGE_BASE + (url.startsWith('/') ? url : `/${url}`);
}

function categoryLabel(entry) {
  const category = entry.category || '';
  if (category.includes('Java')) return 'Java 版';
  if (category.includes('Windows')) return '基岩版';
  if (category.includes('Dungeons II')) return '地牢 II';
  if (category.includes('Dungeons')) return '地牢';
  if (category.includes('Legends')) return '传奇';
  return category || 'Minecraft';
}

function primaryEdition(entry) {
  const category = entry.category || '';
  if (category.includes('Java')) return 'java';
  if (category.includes('Windows')) return 'bedrock';
  if (category.includes('Dungeons')) return 'dungeons';
  if (category.includes('Legends')) return 'legends';
  return 'other';
}

function normalizeEntry(entry) {
  const editions = [];
  for (const type of entry.newsType || []) {
    const edition = EDITION_MAP[type];
    if (edition && !editions.some((item) => item.key === edition.key)) editions.push(edition);
  }
  const image = entry.newsPageImage || entry.playPageImage || {};
  return {
    id: entry.id || `${entry.date}-${entry.title}`,
    title: String(entry.title || '').trim(),
    category: categoryLabel(entry),
    primary: primaryEdition(entry),
    date: entry.date || '',
    text: String(entry.text || '').trim(),
    image: absoluteImage(image.url),
    imageWidth: image.dimensions?.width || 772,
    imageHeight: image.dimensions?.height || 350,
    link: /^https?:\/\//i.test(entry.readMoreLink || '') ? entry.readMoreLink : '',
    editions,
    source: 'Minecraft 官方',
  };
}

function localEntries() {
  const files = [path.join(paths.data(), 'news-cache.json'), path.join(__dirname, '..', 'src', 'assets', 'news', 'mock.json')];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const entries = Array.isArray(data) ? data : data.entries;
      if (Array.isArray(entries) && entries.length) return entries;
    } catch { /* ignore */ }
  }
  return [];
}

async function getMinecraftNews({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL) return cache.data;
  let data;
  try {
    data = await fetchJson(NEWS_URL, { timeout: 25000 });
    try { fs.writeFileSync(path.join(paths.data(), 'news-cache.json'), JSON.stringify(data), 'utf8'); } catch { /* ignore */ }
  } catch (error) {
    const fallback = localEntries();
    if (!fallback.length) throw error;
    const entries = fallback.map(normalizeEntry).filter((entry) => entry.title).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    entries.forEach((entry, index) => {
      const local = path.join(__dirname, '..', 'src', 'assets', 'news', `news-${index}.png`);
      if (fs.existsSync(local)) entry.image = `./assets/news/news-${index}.png`;
    });
    const result = { source: 'Minecraft 新闻 · 本地缓存', sourceUrl: 'https://www.minecraft.net/zh-hans/news', language: 'zh', updatedAt: new Date().toISOString(), entries, offline: true };
    cache = { at: Date.now(), data: result };
    return result;
  }
  if (!data || !Array.isArray(data.entries)) throw new Error('官方新闻数据格式异常');
  const entries = data.entries
    .map(normalizeEntry)
    .filter((entry) => entry.title)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const result = {
    source: 'Minecraft 官方新闻',
    sourceUrl: 'https://www.minecraft.net/zh-hans/news',
    language: 'en',
    updatedAt: new Date().toISOString(),
    entries,
  };
  cache = { at: Date.now(), data: result };
  return result;
}

module.exports = { getMinecraftNews };
