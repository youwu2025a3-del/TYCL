'use strict';

const { fetchJson } = require('./net');

const CACHE_LIMIT = 500;
const cache = new Map();

function decodeEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function polishTranslation(text) {
  return String(text || '')
    .replace(/面料\s*API/gi, 'Fabric API')
    .replace(/面料/g, 'Fabric')
    .replace(/织物\s*装载机/g, 'Fabric Loader')
    .replace(/织物\s*加载器/g, 'Fabric Loader')
    .replace(/织物/g, 'Fabric')
    .replace(/香草/g, '原版')
    .replace(/图形检修/g, '图形增强')
    .replace(/图形大修/g, '光影增强')
    .replace(/优化模块/g, '优化 Mod')
    .replace(/生物群落/g, '生物群系')
    .replace(/改装配件/g, '模组')
    .replace(/改装包/g, '整合包')
    .replace(/虹膜/g, 'Iris')
    .replace(/钠(?=[，。；、\s]|$)/g, 'Sodium');
}

function splitChunks(text, max = 450) {
  const normalized = String(text || '').replace(/\r/g, '').trim();
  if (!normalized) return [];
  const sentences = normalized.split(/(?<=[.!?。！？])\s+|\n+/).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
    } else if (current.length + sentence.length + 1 <= max) {
      current += ' ' + sentence;
    } else {
      chunks.push(current);
      current = sentence;
    }
    while (current.length > max) {
      chunks.push(current.slice(0, max));
      current = current.slice(max).trim();
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

async function translateMyMemory(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`;
  const data = await fetchJson(url, { timeout: 20000, preferElectron: true });
  const translated = data?.responseData?.translatedText;
  if (data?.responseStatus !== 200 || !translated || /MYMEMORY WARNING/i.test(translated)) {
    throw new Error('MyMemory 翻译失败');
  }
  return { text: decodeEntities(translated).trim(), provider: 'MyMemory' };
}

async function translateGoogle(text) {
  const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=zh-CN&q=${encodeURIComponent(text)}`;
  const data = await fetchJson(url, { timeout: 20000, preferElectron: true });
  if (!Array.isArray(data)) throw new Error('Google 翻译失败');
  const translated = data
    .map((part) => (Array.isArray(part) ? part[0] || '' : String(part || '')))
    .join('');
  if (!translated) throw new Error('Google 翻译结果为空');
  return { text: decodeEntities(translated).trim(), provider: 'Google' };
}

async function translateChunk(text) {
  const key = 'zh-CN\0' + text;
  if (cache.has(key)) return cache.get(key);
  let result;
  try {
    result = await translateGoogle(text);
  } catch {
    result = await translateMyMemory(text);
  }
  if (cache.size < CACHE_LIMIT) cache.set(key, result);
  return result;
}

async function translateOne(text) {
  const chunks = splitChunks(text);
  if (!chunks.length) return { text: String(text || ''), provider: '', failed: false };
  const pieces = [];
  let provider = '';
  for (const chunk of chunks) {
    const result = await translateChunk(chunk);
    pieces.push(result.text);
    provider = result.provider;
  }
  return { text: polishTranslation(pieces.join(' ')), provider, failed: false };
}

async function translateTexts(texts, target = 'zh-CN') {
  if (!Array.isArray(texts)) throw new Error('翻译内容格式错误');
  if (target !== 'zh-CN' && target !== 'zh') throw new Error('目前只支持简体中文翻译');
  const list = texts.slice(0, 30).map((text) => String(text || '').trim());
  if (!list.length) return { translations: [], provider: '', partial: false };
  if (list.reduce((sum, text) => sum + text.length, 0) > 30000) {
    throw new Error('文本过长，无法一次汉化');
  }

  const results = new Array(list.length);
  let cursor = 0;
  let failures = 0;
  let provider = '';
  const worker = async () => {
    while (cursor < list.length) {
      const index = cursor++;
      const source = list[index];
      if (!source) {
        results[index] = '';
        continue;
      }
      try {
        const result = await translateOne(source);
        results[index] = result.text;
        provider = result.provider || provider;
      } catch {
        results[index] = source;
        failures += 1;
      }
    }
  };
  await Promise.all([worker(), worker()]);
  if (failures === list.length) throw new Error('翻译服务暂时不可用，请稍后再试');
  return { translations: results, provider, partial: failures > 0 };
}

module.exports = { translateTexts };
