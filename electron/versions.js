'use strict';

const fs = require('fs');
const path = require('path');
const { fetchJson } = require('./net');
const { paths, ensureDir } = require('./paths');
const { store } = require('./store');

const MANIFEST_URLS = {
  official: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
  bmclapi: 'https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json',
};
const FABRIC_META = 'https://meta.fabricmc.net/v2';
const QUILT_META = 'https://meta.quiltmc.org/v3';
const FORGE_PROMOTIONS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';

let manifestCache = null;
let manifestCacheTime = 0;
const versionJsonCache = new Map();
let loaderCache = new Map();

function cacheFile(...parts) {
  return path.join(paths.cache(), ...parts);
}

function readCacheJson(file, maxAgeMs) {
  try {
    const stat = fs.statSync(file);
    if (maxAgeMs && Date.now() - stat.mtimeMs > maxAgeMs) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeCacheJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
}

async function getManifest({ force = false } = {}) {
  if (!force && manifestCache && Date.now() - manifestCacheTime < 10 * 60 * 1000) return manifestCache;
  const source = store.getSettings().downloadSource === 'official' ? 'official' : 'bmclapi';
  const primary = MANIFEST_URLS[source];
  const fallback = source === 'official' ? MANIFEST_URLS.bmclapi : MANIFEST_URLS.official;
  const cached = readCacheJson(cacheFile('version_manifest_v2.json'), 1000 * 60 * 60 * 12);
  let lastError;
  for (const url of [primary, fallback]) {
    try {
      const data = await fetchJson(url, { timeout: 20000 });
      if (!data || !Array.isArray(data.versions)) throw new Error('版本清单格式异常');
      manifestCache = data;
      manifestCacheTime = Date.now();
      writeCacheJson(cacheFile('version_manifest_v2.json'), data);
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  if (cached) return cached;
  throw new Error('无法获取 Minecraft 版本清单：' + (lastError ? lastError.message : '网络错误'));
}

function simplifyVersion(version) {
  return {
    id: version.id,
    type: version.type,
    releaseTime: version.releaseTime,
    url: version.url,
  };
}

async function listVersions({ force = false } = {}) {
  const manifest = await getManifest({ force });
  return {
    latest: manifest.latest,
    versions: manifest.versions.map(simplifyVersion),
  };
}

async function getVersionJson(versionId) {
  if (versionJsonCache.has(versionId)) return versionJsonCache.get(versionId);
  const cache = cacheFile('versions', versionId + '.json');
  const cached = readCacheJson(cache, 1000 * 60 * 60 * 24 * 30);
  if (cached && cached.id === versionId) {
    versionJsonCache.set(versionId, cached);
    return cached;
  }
  const manifest = await getManifest();
  const entry = manifest.versions.find((item) => item.id === versionId);
  if (!entry) throw new Error('找不到游戏版本 ' + versionId);
  let data;
  try {
    data = await fetchJson(entry.url, { timeout: 30000 });
  } catch (error) {
    const source = store.getSettings().downloadSource;
    if (source === 'bmclapi') {
      data = await fetchJson(`https://bmclapi2.bangbang93.com/version/${encodeURIComponent(versionId)}/json`, { timeout: 30000 });
    } else {
      throw error;
    }
  }
  writeCacheJson(cache, data);
  versionJsonCache.set(versionId, data);
  return data;
}

function loaderLabel(key) {
  return { fabric: 'Fabric', forge: 'Forge', quilt: 'Quilt', vanilla: '原版' }[key] || key;
}

async function getLoaders(mcVersion) {
  if (loaderCache.has(mcVersion)) return loaderCache.get(mcVersion);
  const result = {
    vanilla: { label: '原版', recommended: '', versions: [{ version: '', stable: true, type: 'release' }] },
    fabric: { label: 'Fabric', recommended: '', versions: [] },
    forge: { label: 'Forge', recommended: '', versions: [] },
    quilt: { label: 'Quilt', recommended: '', versions: [] },
  };

  const [fabricResult, forgeResult, quiltResult] = await Promise.allSettled([
    fetchJson(`${FABRIC_META}/versions/loader/${encodeURIComponent(mcVersion)}`, { timeout: 20000 }),
    fetchJson(FORGE_PROMOTIONS, { timeout: 20000 }),
    fetchJson(`${QUILT_META}/versions/loader/${encodeURIComponent(mcVersion)}`, { timeout: 20000 }),
  ]);

  if (fabricResult.status === 'fulfilled' && Array.isArray(fabricResult.value)) {
    result.fabric.versions = fabricResult.value.map((item) => ({
      version: item.loader.version,
      stable: Boolean(item.loader.stable),
      type: 'loader',
    }));
    result.fabric.recommended = (result.fabric.versions.find((item) => item.stable) || result.fabric.versions[0] || {}).version || '';
  }
  if (quiltResult.status === 'fulfilled' && Array.isArray(quiltResult.value)) {
    result.quilt.versions = quiltResult.value.map((item) => ({
      version: item.loader.version,
      stable: Boolean(item.loader.stable),
      type: 'loader',
    }));
    result.quilt.recommended = (result.quilt.versions.find((item) => item.stable) || result.quilt.versions[0] || {}).version || '';
  }
  if (forgeResult.status === 'fulfilled' && forgeResult.value && forgeResult.value.promos) {
    const promos = forgeResult.value.promos;
    const recommended = promos[`${mcVersion}-recommended`];
    const latest = promos[`${mcVersion}-latest`];
    const set = new Set();
    if (recommended) set.add(recommended);
    if (latest) set.add(latest);
    result.forge.versions = Array.from(set).map((version) => ({ version, stable: version === recommended, type: 'loader' }));
    result.forge.recommended = recommended || latest || '';
  }

  loaderCache.set(mcVersion, result);
  return result;
}

async function getLoaderProfile(loader, mcVersion, loaderVersion) {
  if (!['fabric', 'quilt'].includes(loader)) throw new Error('不支持的加载器：' + loader);
  const base = loader === 'fabric' ? FABRIC_META : QUILT_META;
  const url = `${base}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`;
  return fetchJson(url, { timeout: 30000 });
}

async function getForgeInstallerUrl(mcVersion, loaderVersion) {
  const id = `${mcVersion}-${loaderVersion}`;
  return `https://maven.minecraftforge.net/net/minecraftforge/forge/${id}/forge-${id}-installer.jar`;
}

function mirrorUrl(url, kind, context = {}) {
  if (!url) return null;
  if (store.getSettings().downloadSource === 'official') return url;
  try {
    const parsed = new URL(url);
    if (kind === 'client' && context.mcVersion) {
      return `https://bmclapi2.bangbang93.com/version/${encodeURIComponent(context.mcVersion)}/client`;
    }
    if (parsed.hostname === 'resources.download.minecraft.net') {
      return url.replace('https://resources.download.minecraft.net', 'https://bmclapi2.bangbang93.com/assets');
    }
    if (parsed.hostname === 'libraries.minecraft.net') {
      return url.replace('https://libraries.minecraft.net', 'https://bmclapi2.bangbang93.com/maven');
    }
    if (parsed.hostname === 'launchermeta.mojang.com' || parsed.hostname === 'piston-meta.mojang.com') {
      if (kind === 'assetIndex' && context.assetId) {
        return `https://bmclapi2.bangbang93.com/assets/indexes/${encodeURIComponent(context.assetId)}.json`;
      }
      return url;
    }
    return url;
  } catch {
    return url;
  }
}

function downloadCandidates(url, kind, context) {
  const primary = store.getSettings().downloadSource === 'official' ? url : mirrorUrl(url, kind, context);
  const fallback = store.getSettings().downloadSource === 'official' ? url : url;
  return Array.from(new Set([primary, fallback].filter(Boolean)));
}

module.exports = {
  getManifest,
  listVersions,
  getVersionJson,
  getLoaders,
  getLoaderProfile,
  getForgeInstallerUrl,
  downloadCandidates,
  mirrorUrl,
  loaderLabel,
};
