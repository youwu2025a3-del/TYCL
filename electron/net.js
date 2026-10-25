'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { ensureDir } = require('./paths');

const USER_AGENT = 'TYCL-Launcher/1.0.0 (Electron; +https://modrinth.com)';

let ipv4Dispatcher = null;
let undiciFetch = null;
let electronNet = null;
try {
  const undici = require('undici');
  undiciFetch = undici.fetch;
  // 某些系统优先解析到不可达的 IPv6 地址，下载 CDN 文件时固定走 IPv4 更稳。
  ipv4Dispatcher = new undici.Agent({ connect: { family: 4 } });
} catch {
  // 没有 undici 时退回 Node 内置 fetch
}
try {
  electronNet = require('electron').net;
} catch {
  // 非 Electron 环境（语法检查 / 单测）使用 Node fetch
}

async function preferredFetch(url, options = {}) {
  if (electronNet && typeof electronNet.fetch === 'function') {
    const requestOptions = { ...options, cache: options.cache || 'no-store' };
    delete requestOptions.dispatcher;
    try {
      return await electronNet.fetch(url, requestOptions);
    } catch (error) {
      if (error && (error.name === 'AbortError' || error.name === 'TimeoutError')) throw error;
      // Chromium 网络栈不可用时回退到 Node fetch
    }
  }
  return smartFetch(url, options);
}

async function smartFetch(url, options = {}) {
  const attempts = [];
  if (undiciFetch && ipv4Dispatcher) {
    attempts.push({ fetch: undiciFetch, options: { ...options, dispatcher: ipv4Dispatcher } });
  }
  attempts.push({ fetch: fetch, options });
  let lastError;
  for (const attempt of attempts) {
    try {
      return await attempt.fetch(url, attempt.options);
    } catch (error) {
      lastError = error;
      if (error && (error.name === 'AbortError' || error.name === 'TimeoutError')) throw error;
    }
  }
  throw lastError;
}

async function fetchJson(url, options = {}) {
  const fetcher = options.preferElectron ? preferredFetch : smartFetch;
  const response = await fetcher(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(options.timeout || 30000),
  });
  if (!response.ok) {
    throw new Error(`请求失败 ${response.status}: ${url}`);
  }
  return response.json();
}

async function fetchText(url, options = {}) {
  const fetcher = options.preferElectron ? preferredFetch : smartFetch;
  const response = await fetcher(url, {
    headers: { 'User-Agent': USER_AGENT, ...(options.headers || {}) },
    signal: AbortSignal.timeout(options.timeout || 30000),
  });
  if (!response.ok) throw new Error(`请求失败 ${response.status}: ${url}`);
  return response.text();
}

function sha1File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function isValidFile(file, expectedSha1) {
  try {
    const stat = fs.statSync(file);
    if (!stat.size) return false;
    if (expectedSha1) {
      const hash = await sha1File(file);
      return hash.toLowerCase() === String(expectedSha1).toLowerCase();
    }
    return true;
  } catch {
    return false;
  }
}

async function downloadToFile(urls, destination, options = {}) {
  const urlList = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
  if (!urlList.length) throw new Error('没有可用的下载地址');
  const { sha1, signal, onProgress, skipIfExists = true, preferElectronFetch = false, retries = 1 } = options;
  ensureDir(path.dirname(destination));
  if (skipIfExists && (await isValidFile(destination, sha1 || null))) {
    if (onProgress) onProgress({ downloaded: options.size || 1, total: options.size || 1 });
    return { skipped: true, path: destination };
  }

  const part = `${destination}.part`;
  let lastError;
  for (const url of urlList) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (signal && signal.aborted) throw Object.assign(new Error('已取消'), { cancelled: true });
      try {
        let existing = 0;
        try {
          existing = fs.statSync(part).size;
        } catch {
          existing = 0;
        }
        const fetcher = preferElectronFetch ? preferredFetch : smartFetch;
        const headers = { 'User-Agent': USER_AGENT };
        if (existing > 0) headers.Range = `bytes=${existing}-`;
        const response = await fetcher(url, {
          headers,
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(options.timeout || 120000)]) : AbortSignal.timeout(options.timeout || 120000),
          redirect: 'follow',
        });
        if (response.status === 416) {
          fs.rmSync(part, { force: true });
          existing = 0;
          throw new Error('断点已失效，重新下载');
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const resumed = response.status === 206 && existing > 0;
        const length = Number(response.headers.get('content-length')) || 0;
        const total = length ? (resumed ? existing + length : length) : options.size || 0;
        let downloaded = resumed ? existing : 0;
        const body = Readable.fromWeb(response.body);
        body.on('data', (chunk) => {
          downloaded += chunk.length;
          if (onProgress) onProgress({ downloaded, total });
        });
        await pipeline(body, fs.createWriteStream(part, { flags: resumed ? 'a' : 'w' }));
        if (sha1 && !(await isValidFile(part, sha1))) {
          fs.rmSync(part, { force: true });
          throw new Error('文件校验失败');
        }
        fs.renameSync(part, destination);
        return { skipped: false, path: destination, size: downloaded, resumed };
      } catch (error) {
        if (signal && signal.aborted) throw Object.assign(new Error('已取消'), { cancelled: true });
        lastError = error;
        if (/校验失败|HTTP 404|HTTP 403/.test(error.message || '')) {
          try {
            fs.rmSync(part, { force: true });
          } catch {
            // ignore
          }
        }
        if (error.cancelled) throw error;
        if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
  }
  throw new Error(`下载失败：${path.basename(destination)}（${lastError ? lastError.message : '未知错误'}）`);
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  let failure = null;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      if (failure) return;
      try {
        results[current] = await worker(items[current], current);
      } catch (error) {
        failure = failure || error;
        return;
      }
    }
  });
  await Promise.all(workers);
  if (failure) throw failure;
  return results;
}

module.exports = { USER_AGENT, fetchJson, fetchText, smartFetch, preferredFetch, downloadToFile, sha1File, isValidFile, mapLimit };
