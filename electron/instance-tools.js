'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { paths, ensureDir, safeResolveWithin } = require('./paths');
const { getInstance, createInstance, updateInstance } = require('./instances');
const { fetchJson, mapLimit } = require('./net');

const MODRINTH = 'https://api.modrinth.com/v2';

function safeName(text) {
  return String(text || 'instance').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'instance';
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function sha1(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function parseModMetadata(file) {
  const result = { id: '', name: '', version: '', loader: '' };
  try {
    const zip = new AdmZip(file);
    const fabric = zip.getEntry('fabric.mod.json');
    const quilt = zip.getEntry('quilt.mod.json');
    if (fabric) {
      const data = JSON.parse(fabric.getData().toString('utf8'));
      result.id = data.id || '';
      result.name = data.name || data.id || '';
      result.version = data.version || '';
      result.loader = 'fabric';
    } else if (quilt) {
      const data = JSON.parse(quilt.getData().toString('utf8'));
      const q = data.quilt_loader || {};
      result.id = q.id || '';
      result.name = (q.metadata && q.metadata.name) || q.id || '';
      result.version = q.version || '';
      result.loader = 'quilt';
    }
    for (const entryName of ['META-INF/neoforge.mods.toml', 'META-INF/mods.toml']) {
      const entry = zip.getEntry(entryName);
      if (!entry) continue;
      const text = entry.getData().toString('utf8');
      const id = /modId\s*=\s*["']([^"']+)/.exec(text);
      const name = /displayName\s*=\s*["']([^"']+)/.exec(text);
      const version = /version\s*=\s*["']([^"']+)/.exec(text);
      result.id = result.id || (id ? id[1] : '');
      result.name = result.name || (name ? name[1] : '');
      result.version = result.version || (version ? version[1] : '');
      result.loader = result.loader || (entryName.includes('neoforge') ? 'neoforge' : 'forge');
      break;
    }
    if (!result.id) {
      const info = zip.getEntry('mcmod.info');
      if (info) {
        const data = JSON.parse(info.getData().toString('utf8'));
        const item = Array.isArray(data) ? data[0] : (data.modList || [])[0];
        if (item) {
          result.id = item.modid || '';
          result.name = item.name || '';
          result.version = item.version || '';
          result.loader = result.loader || 'forge';
        }
      }
    }
    const manifest = zip.getEntry('META-INF/MANIFEST.MF');
    if (manifest && !result.version) {
      const text = manifest.getData().toString('utf8');
      const match = /Implementation-Version:\s*(.+)/i.exec(text);
      if (match) result.version = match[1].trim();
    }
  } catch {
    // 损坏或非标准 jar：保留文件名即可
  }
  return result;
}

function listMods(instanceId) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const dir = path.join(instance.gameDir, 'mods');
  ensureDir(dir);
  const mods = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.jar') && !name.endsWith('.jar.disabled')) continue;
    const file = path.join(dir, name);
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    const meta = parseModMetadata(file);
    mods.push({
      file: name,
      path: file,
      enabled: name.endsWith('.jar'),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      sha1: stat.size < 80 * 1024 * 1024 ? sha1(file) : '',
      ...meta,
      name: meta.name || name.replace(/\.jar(\.disabled)?$/, ''),
    });
  }
  const groups = new Map();
  for (const mod of mods) {
    if (!mod.id) continue;
    if (!groups.has(mod.id)) groups.set(mod.id, []);
    groups.get(mod.id).push(mod);
  }
  const conflicts = [];
  for (const [id, items] of groups) {
    if (items.length > 1) {
      conflicts.push({
        id,
        name: items[0].name,
        files: items.map((item) => item.file),
        reason: '同一个 Mod 安装了多个文件',
      });
    }
  }
  const names = new Map();
  for (const mod of mods) {
    if (names.has(mod.file)) conflicts.push({ id: mod.id, name: mod.name, files: [mod.file], reason: '文件名重复' });
    names.set(mod.file, true);
  }
  return { mods, conflicts, dir };
}

function toggleMod(instanceId, file, enabled) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const dir = path.join(instance.gameDir, 'mods');
  const source = safeResolveWithin(dir, file);
  if (!fs.existsSync(source)) throw new Error('Mod 文件不存在');
  const targetName = enabled ? file.replace(/\.disabled$/, '') : `${file.replace(/\.disabled$/, '')}.disabled`;
  const target = safeResolveWithin(dir, targetName);
  if (source !== target) fs.renameSync(source, target);
  return { ok: true, file: targetName, enabled };
}

function deleteMod(instanceId, file) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const target = safeResolveWithin(path.join(instance.gameDir, 'mods'), file);
  if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  return { ok: true };
}

async function checkModUpdates(instanceId) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const { mods } = listMods(instanceId);
  const enabled = mods.filter((mod) => mod.enabled && mod.sha1);
  const results = [];
  await mapLimit(enabled, 4, async (mod) => {
    try {
      const version = await fetchJson(`${MODRINTH}/version_file/${mod.sha1}?algorithm=sha1`, { timeout: 15000 });
      const projectId = version.project_id;
      if (!projectId) return;
      const params = new URLSearchParams();
      params.set('game_versions', JSON.stringify([instance.baseVersion]));
      if (instance.loader !== 'vanilla') params.set('loaders', JSON.stringify([instance.loader]));
      const versions = await fetchJson(`${MODRINTH}/project/${projectId}/version?${params.toString()}`, { timeout: 20000 });
      const latest = (versions || []).find((item) => item.id !== version.id);
      if (latest) {
        results.push({
          file: mod.file,
          name: mod.name,
          currentVersion: version.version_number,
          latestVersion: latest.version_number,
          projectId,
          versionId: latest.id,
          title: latest.name || latest.version_number,
        });
      }
    } catch {
      // 没有 Modrinth 记录或网络失败时跳过
    }
  });
  return results;
}

function listWorlds(instanceId) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const dir = path.join(instance.gameDir, 'saves');
  ensureDir(dir);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'level.dat')))
    .map((entry) => {
      const worldDir = path.join(dir, entry.name);
      const stat = fs.statSync(worldDir);
      return { name: entry.name, path: worldDir, modifiedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function listScreenshots(instanceId) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const dir = path.join(instance.gameDir, 'screenshots');
  ensureDir(dir);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name))
    .map((entry) => ({ name: entry.name, path: path.join(dir, entry.name), size: fs.statSync(path.join(dir, entry.name)).size }))
    .sort((a, b) => b.name.localeCompare(a.name));
}

function archiveInstance(instance, target) {
  const zip = new AdmZip();
  zip.addFile(
    'tycl-instance.json',
    Buffer.from(
      JSON.stringify(
        {
          format: 'tycl-instance',
          version: 1,
          exportedAt: new Date().toISOString(),
          instance: {
            name: instance.name,
            baseVersion: instance.baseVersion,
            versionId: instance.versionId,
            loader: instance.loader,
            loaderVersion: instance.loaderVersion || '',
            icon: instance.icon || 'grass',
            javaMemoryMb: instance.javaMemoryMb || null,
            javaPath: instance.javaPath || '',
            modpack: instance.modpack || null,
          },
        },
        null,
        2,
      ),
      'utf8',
    ),
  );
  zip.addLocalFolder(instance.gameDir, 'game');
  zip.writeZip(target);
  return target;
}

function backupInstance(instanceId) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const file = path.join(paths.backups(), `${safeName(instance.name)}-${stamp()}.zip`);
  archiveInstance(instance, file);
  return { ok: true, file, name: path.basename(file), size: fs.statSync(file).size };
}

function listBackups() {
  const dir = paths.backups();
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.zip'))
    .map((name) => {
      const file = path.join(dir, name);
      const stat = fs.statSync(file);
      return { name, file, size: stat.size, modifiedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function importArchive(zipPath) {
  if (!zipPath || !fs.existsSync(zipPath)) throw new Error('备份文件不存在');
  const zip = new AdmZip(zipPath);
  const manifestEntry = zip.getEntry('tycl-instance.json');
  if (!manifestEntry) throw new Error('不是 TYCL 实例备份');
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  const meta = manifest.instance || {};
  const instance = createInstance({
    name: `${meta.name || '导入实例'}（导入）`,
    baseVersion: meta.baseVersion || '',
    versionId: meta.versionId || meta.baseVersion || '',
    loader: meta.loader || 'vanilla',
    loaderVersion: meta.loaderVersion || '',
    icon: meta.icon || 'grass',
    javaMemoryMb: meta.javaMemoryMb || null,
    javaPath: meta.javaPath || '',
    modpack: meta.modpack || null,
  });
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !entry.entryName.startsWith('game/')) continue;
    const relative = entry.entryName.slice('game/'.length);
    if (!relative) continue;
    const target = safeResolveWithin(instance.gameDir, relative);
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, entry.getData());
  }
  return { ok: true, instance };
}

function exportInstance(instanceId, target) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  archiveInstance(instance, target);
  return { ok: true, file: target };
}

function backupWorld(instanceId, worldName) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const worldDir = safeResolveWithin(path.join(instance.gameDir, 'saves'), worldName);
  if (!fs.existsSync(worldDir)) throw new Error('存档不存在');
  const file = path.join(paths.backups(), `world-${safeName(worldName)}-${stamp()}.zip`);
  const zip = new AdmZip();
  zip.addLocalFolder(worldDir, safeName(worldName));
  zip.writeZip(file);
  return { ok: true, file, name: path.basename(file) };
}

function listResources(instanceId) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const readDir = (folder, filter) => {
    const dir = ensureDir(path.join(instance.gameDir, folder));
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => filter(entry))
      .map((entry) => {
        const file = path.join(dir, entry.name);
        const stat = fs.statSync(file);
        return { name: entry.name, path: file, directory: entry.isDirectory(), size: entry.isFile() ? stat.size : 0, modifiedAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  };
  return {
    resourcepacks: readDir('resourcepacks', (entry) => entry.isFile() && entry.name.endsWith('.zip')),
    shaderpacks: readDir('shaderpacks', (entry) => entry.isFile() && entry.name.endsWith('.zip')),
    saves: readDir('saves', (entry) => entry.isDirectory() && fs.existsSync(path.join(instance.gameDir, 'saves', entry.name, 'level.dat'))),
  };
}

function addResource(instanceId, kind, source, copyDirectory = true) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const folder = kind === 'resourcepacks' ? 'resourcepacks' : kind === 'shaderpacks' ? 'shaderpacks' : 'saves';
  const targetRoot = ensureDir(path.join(instance.gameDir, folder));
  const stat = fs.statSync(source);
  if (kind === 'saves') {
    const name = path.basename(source, path.extname(source)).replace(/[\\/:*?"<>|]/g, '').slice(0, 64) || 'Imported World';
    const target = safeResolveWithin(targetRoot, name);
    if (stat.isDirectory()) {
      if (!copyDirectory) throw new Error('不能导入文件夹');
      if (fs.existsSync(target)) throw new Error('同名存档已存在');
      fs.cpSync(source, target, { recursive: true });
    } else if (/\.(zip|mcworld)$/i.test(source)) {
      const zip = new AdmZip(source);
      const temp = path.join(targetRoot, `.import-${Date.now()}`);
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        const file = safeResolveWithin(temp, entry.entryName);
        ensureDir(path.dirname(file));
        fs.writeFileSync(file, entry.getData());
      }
      if (!fs.existsSync(path.join(temp, 'level.dat'))) {
        const nested = fs.readdirSync(temp, { withFileTypes: true }).find((entry2) => entry2.isDirectory() && fs.existsSync(path.join(temp, entry2.name, 'level.dat')));
        if (nested) fs.renameSync(path.join(temp, nested.name), target);
        else throw new Error('压缩包中没有 level.dat');
      } else {
        fs.renameSync(temp, target);
      }
    } else {
      throw new Error('存档需要是文件夹、.zip 或 .mcworld');
    }
    return { ok: true, name };
  }
  if (!stat.isFile() || !source.toLowerCase().endsWith('.zip')) throw new Error('资源包 / 光影包需要是 .zip');
  const target = safeResolveWithin(targetRoot, path.basename(source));
  fs.copyFileSync(source, target);
  return { ok: true, name: path.basename(source) };
}

function deleteResource(instanceId, kind, name) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const folder = kind === 'resourcepacks' ? 'resourcepacks' : kind === 'shaderpacks' ? 'shaderpacks' : 'saves';
  const target = safeResolveWithin(path.join(instance.gameDir, folder), name);
  if (!fs.existsSync(target)) return { ok: false };
  fs.rmSync(target, { recursive: true, force: true });
  return { ok: true };
}

function updateSettings(instanceId, patch) {  const allowed = {};
  if (typeof patch.name === 'string') allowed.name = patch.name.trim().slice(0, 64);
  if (typeof patch.javaPath === 'string') allowed.javaPath = patch.javaPath;
  if (Number.isFinite(Number(patch.javaMemoryMb))) allowed.javaMemoryMb = Math.max(1024, Math.min(65536, Math.round(Number(patch.javaMemoryMb) / 512) * 512));
  return updateInstance(instanceId, allowed);
}

module.exports = {
  listMods,
  toggleMod,
  deleteMod,
  checkModUpdates,
  listWorlds,
  listScreenshots,
  backupInstance,
  listBackups,
  importArchive,
  exportInstance,
  backupWorld,
  listResources,
  addResource,
  deleteResource,
  updateSettings,
};
