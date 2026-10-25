'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { store } = require('./store');
const { ensureDir, paths } = require('./paths');

const LOADER_LABELS = {
  vanilla: '原版',
  fabric: 'Fabric',
  forge: 'Forge',
  quilt: 'Quilt',
  neoforge: 'NeoForge',
};

function gameRoot() {
  return store.getSettings().gameDir;
}

function instancesRoot() {
  return paths.instancesRoot(gameRoot());
}

function instanceGameDir(instance) {
  return instance.gameDir || path.join(instancesRoot(), instance.id);
}

function countMods(instance) {
  try {
    const dir = path.join(instanceGameDir(instance), 'mods');
    return fs.readdirSync(dir).filter((name) => name.endsWith('.jar') || name.endsWith('.jar.disabled')).length;
  } catch {
    return 0;
  }
}

function instanceVersionExists(instance) {
  const file = path.join(gameRoot(), 'versions', instance.versionId, instance.versionId + '.json');
  return fs.existsSync(file);
}

function present(instance) {
  return {
    ...instance,
    gameDir: instanceGameDir(instance),
    loaderLabel: LOADER_LABELS[instance.loader] || '原版',
    modsCount: countMods(instance),
    installed: instanceVersionExists(instance),
  };
}

function listInstances() {
  return store
    .getInstances()
    .instances.slice()
    .sort((a, b) => String(b.lastPlayedAt || b.createdAt || '').localeCompare(String(a.lastPlayedAt || a.createdAt || '')))
    .map(present);
}

function getInstance(id) {
  const instance = store.getInstances().instances.find((item) => item.id === id);
  return instance ? present(instance) : null;
}

function createInstance(input) {
  const id = input.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const instance = {
    id,
    name: String(input.name || `${input.baseVersion}`).slice(0, 64),
    baseVersion: String(input.baseVersion || ''),
    versionId: String(input.versionId || input.baseVersion || ''),
    loader: input.loader || 'vanilla',
    loaderVersion: input.loaderVersion || '',
    icon: input.icon || 'grass',
    createdAt: now,
    lastPlayedAt: '',
    playSeconds: 0,
    modpack: input.modpack || null,
    gameDir: path.join(instancesRoot(), id),
    javaMemoryMb: input.javaMemoryMb || null,
    javaPath: input.javaPath || '',
    forgeInstaller: input.forgeInstaller || '',
  };
  ensureDir(instance.gameDir);
  for (const sub of ['mods', 'saves', 'resourcepacks', 'shaderpacks', 'logs']) {
    ensureDir(path.join(instance.gameDir, sub));
  }
  const data = store.getInstances();
  data.instances.push(instance);
  store.saveInstances(data);
  return present(instance);
}

function updateInstance(id, patch) {
  const data = store.getInstances();
  const index = data.instances.findIndex((item) => item.id === id);
  if (index === -1) throw new Error('实例不存在');
  data.instances[index] = { ...data.instances[index], ...patch, id };
  store.saveInstances(data);
  return present(data.instances[index]);
}

function touchInstance(id) {
  return updateInstance(id, { lastPlayedAt: new Date().toISOString() });
}

function addPlaySeconds(id, seconds) {
  const current = store.getInstances().instances.find((item) => item.id === id);
  if (!current) return;
  updateInstance(id, { playSeconds: Math.max(0, Math.round((current.playSeconds || 0) + seconds)) });
}

function deleteInstance(id, { deleteFiles = true } = {}) {
  const data = store.getInstances();
  const index = data.instances.findIndex((item) => item.id === id);
  if (index === -1) throw new Error('实例不存在');
  const [instance] = data.instances.splice(index, 1);
  store.saveInstances(data);
  if (deleteFiles) {
    const dir = instanceGameDir(instance);
    const resolved = path.resolve(dir);
    if (resolved.startsWith(path.resolve(instancesRoot())) && fs.existsSync(resolved)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
  return { ok: true };
}

function setInstanceModpack(id, modpack) {
  return updateInstance(id, { modpack });
}

function modsDir(id) {
  const instance = getInstance(id);
  if (!instance) throw new Error('实例不存在');
  const dir = path.join(instance.gameDir, 'mods');
  ensureDir(dir);
  return dir;
}

module.exports = {
  LOADER_LABELS,
  gameRoot,
  instancesRoot,
  instanceGameDir,
  listInstances,
  getInstance,
  createInstance,
  updateInstance,
  touchInstance,
  addPlaySeconds,
  deleteInstance,
  setInstanceModpack,
  modsDir,
};
