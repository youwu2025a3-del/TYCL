'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { paths, ensureDir } = require('./paths');
const { store, readJson, writeJsonAtomic } = require('./store');
const auth = require('./auth');

const BUILTIN = [
  { id: 'builtin:yunshan', name: '云杉', description: '松林与旧木屋的气息', file: 'yunshan.png', model: 'classic', tone: '#4e8a6d' },
  { id: 'builtin:mint', name: '薄荷苏打', description: '微风、汽水与夏天', file: 'mint.png', model: 'classic', tone: '#7ac9ab' },
  { id: 'builtin:dusk', name: '暮色旅人', description: '从黄昏出发的冒险者', file: 'dusk.png', model: 'classic', tone: '#695a8b' },
  { id: 'builtin:frost', name: '霜蓝', description: '北境雪原的静默行者', file: 'frost.png', model: 'slim', tone: '#6c8cad' },
];

function skinsIndexFile() {
  return path.join(paths.skins(), 'index.json');
}

function customSkins() {
  const list = readJson(skinsIndexFile(), []);
  if (!Array.isArray(list)) return [];
  return list.filter((item) => item && item.file && fs.existsSync(path.join(paths.skins(), item.file)));
}

function saveCustomIndex(list) {
  writeJsonAtomic(skinsIndexFile(), list);
}

function dataUrlForFile(file) {
  try {
    const data = fs.readFileSync(file);
    return 'data:image/png;base64,' + data.toString('base64');
  } catch {
    return '';
  }
}

function pngInfo(buffer) {
  if (!buffer || buffer.length < 24) return null;
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

function builtinState() {
  return BUILTIN.map((item) => {
    const file = paths.assetDir('skins/' + item.file);
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      model: item.model,
      tone: item.tone,
      builtin: true,
      dataUrl: dataUrlForFile(file),
    };
  });
}

function getSkinState() {
  const settings = store.getSettings();
  const builtins = builtinState();
  const customs = customSkins().map((item) => ({
    id: 'custom:' + item.id,
    name: item.name || '自定义皮肤',
    description: item.description || '本地导入',
    model: item.model || 'classic',
    tone: item.tone || '#8aa0b8',
    builtin: false,
    dataUrl: dataUrlForFile(path.join(paths.skins(), item.file)),
  }));
  const all = [...builtins, ...customs];
  let official = null;
  const accountState = auth.getPublicState();
  const account = accountState.mode === 'microsoft' ? accountState.account : null;
  if (account && account.uuid) {
    const cachedFile = path.join(paths.skins(), `microsoft-${account.uuid}.png`);
    const dataUrl = fs.existsSync(cachedFile) ? dataUrlForFile(cachedFile) : account.skinUrl || '';
    official = {
      id: `microsoft:${account.uuid}`,
      name: account.name || 'Microsoft',
      description: 'Microsoft 正版皮肤',
      model: account.skinModel === 'slim' ? 'slim' : 'classic',
      tone: '#4e8a6d',
      builtin: false,
      official: true,
      dataUrl,
    };
    all.unshift(official);
  }
  let active = all.find((item) => item.id === settings.player.skin);
  if (official && (!active || settings.player.skin === 'builtin:yunshan' || String(settings.player.skin || '').startsWith('microsoft:'))) {
    active = official;
    if (settings.player.skin !== official.id) {
      store.saveSettings({
        player: {
          ...settings.player,
          skin: official.id,
          model: official.model,
        },
      });
    }
  }
  if (!active) active = builtins[0];
  return {
    activeSkinId: active.id,
    player: { ...settings.player, skin: active.id },
    skins: all,
    activeSkin: active,
  };
}

function setActiveSkin({ skinId, model }) {
  const state = getSkinState();
  const target = state.skins.find((item) => item.id === skinId);
  if (!target) throw new Error('皮肤不存在');
  const settings = store.saveSettings({
    player: {
      ...store.getSettings().player,
      skin: target.id,
      model: model === 'slim' || model === 'classic' ? model : target.model,
    },
  });
  return { settings, ...getSkinState() };
}

function setPlayerProfile({ name, model }) {
  const player = { ...store.getSettings().player };
  if (typeof name === 'string') player.name = name;
  if (model === 'slim' || model === 'classic') player.model = model;
  const settings = store.saveSettings({ player });
  return { settings, ...getSkinState() };
}

function uploadSkin({ dataUrl, name }) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('请选择 PNG 格式的皮肤文件');
  }
  const base64 = dataUrl.slice('data:image/png;base64,'.length);
  if (base64.length > 3 * 1024 * 1024) throw new Error('皮肤文件过大');
  const buffer = Buffer.from(base64, 'base64');
  const info = pngInfo(buffer);
  if (!info) throw new Error('无法识别的 PNG 文件');
  if (!((info.width === 64 && info.height === 64) || (info.width === 64 && info.height === 32))) {
    throw new Error('Minecraft 皮肤尺寸应为 64×64 或 64×32');
  }
  ensureDir(paths.skins());
  const id = crypto.randomUUID();
  const file = `${id}.png`;
  fs.writeFileSync(path.join(paths.skins(), file), buffer);
  const list = customSkins();
  list.unshift({
    id,
    name: (name || '我的皮肤').toString().slice(0, 24),
    file,
    model: info.height === 32 ? 'classic' : 'classic',
    tone: '#7d94ad',
    createdAt: new Date().toISOString(),
  });
  saveCustomIndex(list);
  return setActiveSkin({ skinId: 'custom:' + id });
}

function getPlayerHeadDataUrl() {
  return getSkinState().activeSkin.dataUrl;
}

module.exports = {
  BUILTIN,
  getSkinState,
  setActiveSkin,
  setPlayerProfile,
  uploadSkin,
  getPlayerHeadDataUrl,
  pngInfo,
};
