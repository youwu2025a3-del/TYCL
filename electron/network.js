'use strict';

const { preferredFetch } = require('./net');

const ENDPOINTS = [
  { key: 'bmclapi', name: 'BMCLAPI 镜像', url: 'https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json' },
  { key: 'official', name: 'Mojang 官方', url: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json' },
  { key: 'modrinth', name: 'Modrinth', url: 'https://api.modrinth.com/v2/search?limit=1' },
];

async function timed(endpoint) {
  const started = Date.now();
  try {
    const response = await preferredFetch(endpoint.url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    return { ...endpoint, ok: response.ok, ms: Date.now() - started, status: response.status };
  } catch (error) {
    return { ...endpoint, ok: false, ms: Date.now() - started, error: error.message };
  }
}

async function testSources() {
  const results = await Promise.all(ENDPOINTS.map(timed));
  results.sort((a, b) => (a.ok === b.ok ? a.ms - b.ms : a.ok ? -1 : 1));
  return { results, testedAt: new Date().toISOString() };
}

module.exports = { testSources };
