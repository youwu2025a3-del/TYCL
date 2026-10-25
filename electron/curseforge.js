'use strict';

const fs = require('fs');
const path = require('path');
const { store } = require('./store');
const { getInstance } = require('./instances');
const { fetchJson, downloadToFile } = require('./net');

const API = 'https://api.curseforge.com/v1';
const GAME_ID = 432;
const CLASS_IDS = { mod: 6, modpack: 4471 };
const LOADER_IDS = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };

function apiKey() {
  return String(store.getSettings().curseForgeApiKey || '').trim();
}

function headers() {
  const key = apiKey();
  if (!key) throw new Error('请先在设置中填写 CurseForge API Key');
  return { 'x-api-key': key, Accept: 'application/json', 'User-Agent': 'TYCL Launcher' };
}

function normalize(mod) {
  return {
    id: mod.id,
    name: mod.name,
    slug: mod.slug,
    summary: mod.summary || '',
    author: (mod.authors && mod.authors[0] && mod.authors[0].name) || '',
    downloads: mod.downloadCount || 0,
    categories: (mod.categories || []).map((item) => item.name),
    iconUrl: mod.logo ? mod.logo.thumbnailUrl || mod.logo.url : '',
    projectType: mod.classId === CLASS_IDS.modpack ? 'modpack' : 'mod',
    updated: mod.dateModified,
    links: mod.links || {},
  };
}

async function search({ query = '', type = 'mod', gameVersion = '', loader = '', offset = 0, limit = 20 } = {}) {
  const params = new URLSearchParams({
    gameId: String(GAME_ID),
    classId: String(CLASS_IDS[type] || CLASS_IDS.mod),
    searchFilter: query,
    sortField: '2',
    sortOrder: 'desc',
    index: String(Math.max(0, offset)),
    pageSize: String(Math.min(50, Math.max(1, limit))),
  });
  if (gameVersion) params.set('gameVersion', gameVersion);
  if (loader && LOADER_IDS[loader]) params.set('modLoaderType', String(LOADER_IDS[loader]));
  const data = await fetchJson(`${API}/mods/search?${params.toString()}`, { timeout: 25000, headers: headers() });
  return {
    hits: (data.data || []).map(normalize),
    total: data.pagination?.totalCount || 0,
  };
}

function fileUrl(file) {
  if (file.downloadUrl) return file.downloadUrl;
  const id = Number(file.id);
  return `https://edge.forgecdn.net/files/${Math.floor(id / 1000)}/${id % 1000}/${encodeURIComponent(file.fileName)}`;
}

async function compatibleFile(projectId, instance) {
  const params = new URLSearchParams({ gameVersion: instance.baseVersion, pageSize: '50' });
  if (LOADER_IDS[instance.loader]) params.set('modLoaderType', String(LOADER_IDS[instance.loader]));
  const data = await fetchJson(`${API}/mods/${projectId}/files?${params.toString()}`, { timeout: 25000, headers: headers() });
  const files = data.data || [];
  return files.find((file) => file.releaseType === 1) || files[0] || null;
}

async function installCurseModTask(task, { instanceId, modId, fileId }) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const projectData = await fetchJson(`${API}/mods/${modId}`, { timeout: 25000, headers: headers() });
  const project = projectData.data;
  let file;
  if (fileId) {
    const fileData = await fetchJson(`${API}/mods/${modId}/files/${fileId}`, { timeout: 25000, headers: headers() });
    file = fileData.data;
  } else {
    file = await compatibleFile(modId, instance);
  }
  if (!file) throw new Error('没有找到兼容的文件版本');
  task.report({ percent: 8, stage: '下载 CurseForge Mod', detail: project.name });
  const modsDir = path.join(instance.gameDir, 'mods');
  fs.mkdirSync(modsDir, { recursive: true });
  const target = path.join(modsDir, path.basename(file.fileName));
  if (!fs.existsSync(target)) {
    await downloadToFile([fileUrl(file)], target, { signal: task.signal, timeout: 180000 });
  }
  task.report({ percent: 70, stage: '处理前置依赖', detail: `${(file.dependencies || []).length} 个` });
  const installed = [file.fileName];
  const required = (file.dependencies || []).filter((dep) => dep.relationType === 3);
  for (const dep of required) {
    if (task.signal.aborted) throw Object.assign(new Error('已取消'), { cancelled: true });
    try {
      const depFile = await compatibleFile(dep.modId, instance);
      if (!depFile) continue;
      const depData = await fetchJson(`${API}/mods/${dep.modId}`, { timeout: 25000, headers: headers() });
      const depTarget = path.join(modsDir, path.basename(depFile.fileName));
      if (!fs.existsSync(depTarget)) {
        await downloadToFile([fileUrl(depFile)], depTarget, { signal: task.signal, timeout: 180000 });
      }
      installed.push(depFile.fileName);
      task.report({ percent: 70 + (25 * installed.length) / Math.max(1, required.length + 1), stage: '安装前置依赖', detail: depData.data?.name || depFile.fileName });
    } catch {
      // 单个前置失败不终止主 Mod 安装
    }
  }
  return { project: project.name, file: file.fileName, installed, source: 'curseforge' };
}

module.exports = { search, installCurseModTask, apiKey };
