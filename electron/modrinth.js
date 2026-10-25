'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { fetchJson, downloadToFile, mapLimit } = require('./net');
const { ensureDir, safeResolveWithin, paths } = require('./paths');
const { getInstance, createInstance, updateInstance } = require('./instances');
const { ensureGameForModpack, makeInstanceName } = require('./installer');
const { store } = require('./store');

const API = 'https://api.modrinth.com/v2';
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function cachedJson(url, ttl = CACHE_TTL) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.time < ttl) return hit.data;
  const data = await fetchJson(url, { timeout: 25000 });
  cache.set(url, { time: Date.now(), data });
  return data;
}

function normalizeHit(hit) {
  return {
    id: hit.project_id || hit.id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    author: hit.author,
    iconUrl: hit.icon_url,
    downloads: hit.downloads || 0,
    follows: hit.follows || 0,
    categories: hit.display_categories || hit.categories || [],
    versions: hit.versions || [],
    projectType: hit.project_type || 'mod',
    updated: hit.date_modified,
    license: hit.license,
    color: hit.color || null,
    gallery: hit.gallery || [],
  };
}

function normalizeProject(project) {
  return {
    id: project.id,
    slug: project.slug,
    title: project.title,
    description: project.description,
    body: project.body || '',
    author: '',
    iconUrl: project.icon_url,
    downloads: project.downloads || 0,
    follows: project.followers || 0,
    categories: project.categories || [],
    loaders: project.loaders || [],
    gameVersions: project.game_versions || [],
    projectType: project.project_type || 'mod',
    updated: project.updated,
    license: project.license ? project.license.id || project.license : '',
    gallery: project.gallery || [],
    sourceUrl: project.source_url || '',
    issuesUrl: project.issues_url || '',
    color: project.color || null,
  };
}

async function search({ query = '', type = 'modpack', gameVersion = '', loader = '', category = '', offset = 0, limit = 20, sort = 'relevance' } = {}) {
  const facets = [[`project_type:${type === 'mod' ? 'mod' : 'modpack'}`]];
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  if (loader) facets.push([`categories:${loader}`]);
  if (category) facets.push([`categories:${category}`]);
  const indexMap = { relevance: 'relevance', downloads: 'downloads', newest: 'newest', updated: 'updated', follows: 'follows' };
  const params = new URLSearchParams({
    query: query || '',
    facets: JSON.stringify(facets),
    index: indexMap[sort] || 'relevance',
    offset: String(Math.max(0, offset)),
    limit: String(Math.min(50, Math.max(1, limit))),
  });
  const data = await cachedJson(`${API}/search?${params.toString()}`);
  return {
    hits: (data.hits || []).map(normalizeHit),
    total: data.total_hits || 0,
    offset: data.offset || 0,
    limit: data.limit || limit,
  };
}

async function getProject(idOrSlug) {
  const project = await cachedJson(`${API}/project/${encodeURIComponent(idOrSlug)}`);
  const normalized = normalizeProject(project);
  try {
    const members = await cachedJson(`${API}/project/${encodeURIComponent(idOrSlug)}/members`);
    if (Array.isArray(members) && members.length) {
      const lead = members.find((member) => member.role === 'Project Lead') || members.find((member) => member.ordering === 0) || members[0];
      if (lead && lead.user && lead.user.username) normalized.author = lead.user.username;
    }
  } catch {
    // 作者信息不是关键
  }
  return normalized;
}

async function getVersions(idOrSlug, { gameVersion = '', loader = '', featured = false } = {}) {
  const params = new URLSearchParams();
  if (gameVersion) params.set('game_versions', JSON.stringify([gameVersion]));
  if (loader) params.set('loaders', JSON.stringify([loader]));
  if (featured) params.set('featured', 'true');
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const versions = await cachedJson(`${API}/project/${encodeURIComponent(idOrSlug)}/version${suffix}`);
  return (Array.isArray(versions) ? versions : []).map((version) => ({
    id: version.id,
    name: version.name,
    versionNumber: version.version_number,
    gameVersions: version.game_versions || [],
    loaders: version.loaders || [],
    files: version.files || [],
    dependencies: version.dependencies || [],
    datePublished: version.date_published,
    downloads: version.downloads || 0,
    versionType: version.version_type || 'release',
  }));
}

async function getVersion(versionId) {
  return cachedJson(`${API}/version/${encodeURIComponent(versionId)}`);
}

function primaryFile(version) {
  const files = version.files || [];
  return files.find((file) => file.primary) || files[0];
}

function compatibleVersion(versions, instance) {
  return versions.find(
    (version) =>
      version.gameVersions.includes(instance.baseVersion) &&
      (instance.loader === 'vanilla' || version.loaders.includes(instance.loader)),
  );
}

async function resolveModVersion({ projectId, versionId, instance }) {
  if (versionId) return getVersion(versionId);
  const versions = await getVersions(projectId, { gameVersion: instance.baseVersion, loader: instance.loader === 'vanilla' ? undefined : instance.loader });
  const version = compatibleVersion(versions, instance);
  if (!version) throw new Error(`没有找到兼容 ${instance.baseVersion} / ${instance.loader} 的文件版本`);
  return version;
}

async function downloadModFile(task, modsDir, version, projectTitle, start, end, visited) {
  const file = primaryFile(version);
  if (!file || !file.url) throw new Error('该版本没有可下载的 Mod 文件');
  const fileName = path.basename(file.filename || file.url.split('/').pop());
  const destination = path.join(modsDir, fileName);
  if (fs.existsSync(destination)) {
    task.report({ percent: end, stage: '安装 Mod', detail: `${projectTitle} 已存在` });
    return { skipped: true, fileName, title: projectTitle };
  }
  await downloadToFile(file.url, destination, {
    sha1: file.hashes && file.hashes.sha1,
    size: file.size,
    signal: task.signal,
    skipIfExists: true,
  });
  task.report({ percent: end, stage: '安装 Mod', detail: projectTitle });
  return { skipped: false, fileName, title: projectTitle };
}

async function installModTask(task, { instanceId, projectId, versionId, title }) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const modsDir = ensureDir(path.join(instance.gameDir, 'mods'));
  task.setTitle = undefined; // 保持任务接口简单
  task.report({ percent: 5, stage: '解析 Mod', detail: title || projectId });
  const version = await resolveModVersion({ projectId, versionId, instance });
  if (!version) throw new Error('找不到可安装的版本');
  const project = await getProject(projectId).catch(() => ({ title: title || projectId }));
  const versionTitle = version.name || version.version_number || '';
  task.report({ percent: 15, stage: '准备安装', detail: versionTitle });
  const installed = [];
  installed.push(await downloadModFile(task, modsDir, version, project.title || title || projectId, 20, 68, new Set()));

  const requiredDependencies = (version.dependencies || []).filter((dep) => dep.dependency_type === 'required');
  let index = 0;
  for (const dependency of requiredDependencies) {
    if (task.signal.aborted) throw Object.assign(new Error('已取消'), { cancelled: true });
    index += 1;
    try {
      let depVersion;
      if (dependency.version_id) {
        depVersion = await getVersion(dependency.version_id);
      } else if (dependency.project_id) {
        const versions = await getVersions(dependency.project_id, {
          gameVersion: instance.baseVersion,
          loader: instance.loader === 'vanilla' ? undefined : instance.loader,
        });
        depVersion = compatibleVersion(versions, instance);
      }
      if (!depVersion) continue;
      const depProject = await getProject(depVersion.project_id || dependency.project_id).catch(() => ({ title: '前置 Mod' }));
      installed.push(
        await downloadModFile(
          task,
          modsDir,
          depVersion,
          depProject.title || '前置 Mod',
          68,
          96,
        ),
      );
    } catch (error) {
      task.report({ percent: 96, stage: '安装 Mod', detail: `前置依赖安装失败：${error.message}` });
    }
    task.report({ percent: 68 + (32 * index) / Math.max(1, requiredDependencies.length), stage: '处理前置依赖', detail: `${index}/${requiredDependencies.length}` });
  }
  return {
    instanceId,
    project: project.title || title,
    installed,
    path: modsDir,
    count: installed.filter((item) => !item.skipped).length,
  };
}

function loaderFromPack(index) {
  const deps = index.dependencies || {};
  if (deps['fabric-loader']) return { loader: 'fabric', loaderVersion: deps['fabric-loader'] };
  if (deps['forge']) return { loader: 'forge', loaderVersion: deps.forge };
  if (deps['quilt-loader']) return { loader: 'quilt', loaderVersion: deps['quilt-loader'] };
  if (deps['neoforge']) return { loader: 'neoforge', loaderVersion: deps.neoforge };
  return { loader: 'vanilla', loaderVersion: '' };
}

function extractOverrides(zip, instanceDir) {
  let count = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    let relative = '';
    if (entry.entryName.startsWith('overrides/')) relative = entry.entryName.slice('overrides/'.length);
    else if (entry.entryName.startsWith('client-overrides/')) relative = entry.entryName.slice('client-overrides/'.length);
    else continue;
    if (!relative) continue;
    const target = safeResolveWithin(instanceDir, relative);
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, entry.getData());
    count += 1;
  }
  return count;
}

async function installModpackTask(task, { projectId, versionId, title, iconUrl }) {
  task.report({ percent: 2, stage: '解析整合包', detail: title || projectId });
  const project = await getProject(projectId);
  let versions;
  if (versionId) {
    const version = await getVersion(versionId);
    versions = [version];
  } else {
    versions = await getVersions(projectId);
  }
  if (!versions.length) throw new Error('该整合包没有可安装的版本');
  const packVersion = versions[0];
  const file = primaryFile(packVersion);
  if (!file) throw new Error('整合包缺少下载文件');
  const safeTitle = project.title.replace(/[\\/:*?"<>|]/g, '').trim() || '整合包';
  task.report({ percent: 5, stage: '下载整合包', detail: packVersion.name || packVersion.version_number });
  const packDir = ensureDir(path.join(paths.cache(), 'modpacks'));
  const packFile = path.join(packDir, `${packVersion.id}.mrpack`);
  await downloadToFile(file.url, packFile, {
    sha1: file.hashes && file.hashes.sha1,
    signal: task.signal,
    timeout: 180000,
  });

  let zip;
  let index;
  try {
    zip = new AdmZip(packFile);
    const entry = zip.getEntry('modrinth.index.json');
    if (!entry) throw new Error('缺少 modrinth.index.json');
    index = JSON.parse(entry.getData().toString('utf8'));
  } catch (error) {
    throw new Error('无法解析整合包：' + error.message);
  }
  const mcVersion = index.dependencies && index.dependencies.minecraft;
  if (!mcVersion) throw new Error('整合包未声明 Minecraft 版本');
  const { loader, loaderVersion } = loaderFromPack(index);
  if (loader === 'neoforge') throw new Error('暂不支持 NeoForge 整合包');
  task.report({ percent: 9, stage: '安装游戏环境', detail: `Minecraft ${mcVersion} · ${loader}` });
  const core = await ensureGameForModpack(task, { mcVersion, loader, loaderVersion });
  const instance = createInstance({
    name: title || project.title || safeTitle,
    baseVersion: mcVersion,
    versionId: core.versionId,
    loader: core.loader,
    loaderVersion: core.loaderVersion,
    icon: core.loader === 'vanilla' ? 'grass' : core.loader,
    forgeInstaller: core.forgeInstaller || '',
    modpack: {
      projectId: project.id,
      versionId: packVersion.id,
      title: project.title,
      versionNumber: packVersion.version_number,
      iconUrl: project.iconUrl || iconUrl || '',
    },
  });

  const files = (index.files || []).filter((item) => !(item.env && item.env.client === 'unsupported'));
  let done = 0;
  const failures = [];
  task.report({ percent: 94, stage: '下载整合包内容', detail: `0 / ${files.length}` });
  await mapLimit(files, 6, async (item) => {
    if (task.signal.aborted) throw Object.assign(new Error('已取消'), { cancelled: true });
    if (!item.path || !Array.isArray(item.downloads) || !item.downloads.length) return;
    const target = safeResolveWithin(instance.gameDir, item.path);
    ensureDir(path.dirname(target));
    try {
      await downloadToFile(item.downloads, target, {
        sha1: item.hashes && item.hashes.sha1,
        size: item.fileSize,
        signal: task.signal,
      });
    } catch (error) {
      failures.push(`${item.path}: ${error.message}`);
    }
    done += 1;
    task.report({
      percent: 94 + (4 * done) / Math.max(1, files.length),
      stage: '下载整合包内容',
      detail: `${done} / ${files.length}`,
    });
  });
  task.report({ percent: 98, stage: '写入配置与覆盖文件', detail: '' });
  const overrides = extractOverrides(zip, instance.gameDir);
  fs.writeFileSync(path.join(instance.gameDir, 'modrinth.index.json'), JSON.stringify(index, null, 2), 'utf8');
  updateInstance(instance.id, {
    modpack: {
      ...instance.modpack,
      installedAt: new Date().toISOString(),
      fileCount: files.length,
    },
  });
  if (failures.length) {
    return { instance, warnings: failures.slice(0, 10), warningCount: failures.length, overrides };
  }
  return { instance, overrides, fileCount: files.length };
}

async function updateModpackTask(task, { instance, versionId }) {
  if (!instance || !instance.modpack) throw new Error('该实例不是整合包实例');
  const projectId = instance.modpack.projectId;
  const versions = await getVersions(projectId);
  const candidate =
    (versionId && versions.find((version) => version.id === versionId)) ||
    versions.find((version) => version.gameVersions.includes(instance.baseVersion)) ||
    versions[0];
  if (!candidate) throw new Error('没有找到可更新的整合包版本');
  if (candidate.id === instance.modpack.versionId) throw new Error('当前已经是最新整合包版本');
  const file = primaryFile(candidate);
  if (!file) throw new Error('整合包版本缺少下载文件');
  task.report({ percent: 3, stage: '下载整合包更新', detail: candidate.version_number || candidate.name });
  const packDir = ensureDir(path.join(paths.cache(), 'modpacks'));
  const packFile = path.join(packDir, `${candidate.id}.mrpack`);
  await downloadToFile(file.url, packFile, { sha1: file.hashes && file.hashes.sha1, signal: task.signal, timeout: 180000 });
  const zip = new AdmZip(packFile);
  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) throw new Error('更新包缺少 modrinth.index.json');
  const index = JSON.parse(indexEntry.getData().toString('utf8'));
  const mcVersion = index.dependencies && index.dependencies.minecraft;
  if (!mcVersion) throw new Error('更新包未声明 Minecraft 版本');
  const { loader, loaderVersion } = loaderFromPack(index);
  if (loader === 'neoforge') throw new Error('暂不支持 NeoForge 整合包');
  if (mcVersion !== instance.baseVersion || loader !== instance.loader) {
    task.report({ percent: 8, stage: '更新游戏环境', detail: `Minecraft ${mcVersion} · ${loader}` });
    const core = await ensureGameForModpack(task, { mcVersion, loader, loaderVersion });
    updateInstance(instance.id, { baseVersion: mcVersion, versionId: core.versionId, loader: core.loader, loaderVersion: core.loaderVersion, forgeInstaller: core.forgeInstaller || '' });
  }
  const files = (index.files || []).filter((item) => !(item.env && item.env.client === 'unsupported'));
  let done = 0;
  const failures = [];
  task.report({ percent: 12, stage: '同步整合包文件', detail: `0 / ${files.length}` });
  await mapLimit(files, 8, async (item) => {
    if (task.signal.aborted) throw Object.assign(new Error('已取消'), { cancelled: true });
    if (!item.path || !Array.isArray(item.downloads) || !item.downloads.length) return;
    const target = safeResolveWithin(instance.gameDir, item.path);
    ensureDir(path.dirname(target));
    try {
      await downloadToFile(item.downloads, target, {
        sha1: item.hashes && item.hashes.sha1,
        size: item.fileSize,
        signal: task.signal,
        skipIfExists: true,
      });
    } catch (error) {
      failures.push(`${item.path}: ${error.message}`);
    }
    done += 1;
    task.report({ percent: 12 + (80 * done) / Math.max(1, files.length), stage: '同步整合包文件', detail: `${done} / ${files.length}` });
  });
  task.report({ percent: 94, stage: '写入更新配置' });
  const overrides = extractOverrides(zip, instance.gameDir);
  fs.writeFileSync(path.join(instance.gameDir, 'modrinth.index.json'), JSON.stringify(index, null, 2), 'utf8');
  updateInstance(instance.id, {
    modpack: {
      ...instance.modpack,
      versionId: candidate.id,
      versionNumber: candidate.version_number,
      updatedAt: new Date().toISOString(),
      fileCount: files.length,
    },
  });
  return { ok: true, instanceId: instance.id, version: candidate.version_number, failures, overrides, fileCount: files.length };
}

module.exports = {
  search,
  getProject,
  getVersions,
  getVersion,
  installModTask,
  installModpackTask,
  updateModpackTask,
  normalizeHit,
  normalizeProject,
};
