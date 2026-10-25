import { MOCK_NEWS, MOCK_NEWS_UPDATED_AT } from './news-mock.js';

const covers = './assets/covers/';

const BUILTIN_SKINS = [
  { id: 'builtin:yunshan', name: '云杉', description: '松林与旧木屋的气息', model: 'classic', builtin: true, tone: '#4e8a6d', dataUrl: './assets/skins/yunshan.png' },
  { id: 'builtin:mint', name: '薄荷苏打', description: '微风、汽水与夏天', model: 'classic', builtin: true, tone: '#7ac9ab', dataUrl: './assets/skins/mint.png' },
  { id: 'builtin:dusk', name: '暮色旅人', description: '从黄昏出发的冒险者', model: 'classic', builtin: true, tone: '#695a8b', dataUrl: './assets/skins/dusk.png' },
  { id: 'builtin:frost', name: '霜蓝', description: '北境雪原的静默行者', model: 'slim', builtin: true, tone: '#6c8cad', dataUrl: './assets/skins/frost.png' },
];

const DEFAULT_SETTINGS = {
  theme: 'light',
  accent: 'mint',
  player: { name: 'Steve', model: 'classic', skin: 'builtin:yunshan' },
  gameDir: 'C:\\Users\\You\\AppData\\Roaming\\TYCL\\minecraft',
  javaPath: '',
  memoryMb: 6144,
  downloadSource: 'bmclapi',
  showSnapshots: false,
  closeToTray: false,
  accountMode: 'offline',
  microsoftClientId: '00000000402b5328',
  updateFeedUrl: 'https://tycl-updates-a3y8.youwu2025a3.workers.dev/update.json',
  autoCheckUpdates: true,
};

const SAMPLE_INSTANCES = [
  {
    id: 'demo-fabric-1201',
    name: '1.20.1 · Fabric',
    baseVersion: '1.20.1',
    versionId: 'fabric-loader-0.16.10-1.20.1',
    loader: 'fabric',
    loaderVersion: '0.16.10',
    loaderLabel: 'Fabric',
    icon: 'fabric',
    modsCount: 42,
    installed: true,
    gameDir: 'C:\\Users\\You\\AppData\\Roaming\\TYCL\\minecraft\\tycl-instances\\demo-fabric-1201',
    lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    playSeconds: 162480,
    modpack: { title: 'Fabulously Optimized', iconUrl: covers + 'fabulously-optimized.webp' },
  },
  {
    id: 'demo-forge-1192',
    name: '1.19.2 · Forge',
    baseVersion: '1.19.2',
    versionId: '1.19.2-forge-43.3.0',
    loader: 'forge',
    loaderVersion: '43.3.0',
    loaderLabel: 'Forge',
    icon: 'forge',
    modsCount: 18,
    installed: true,
    gameDir: 'C:\\Users\\You\\AppData\\Roaming\\TYCL\\minecraft\\tycl-instances\\demo-forge-1192',
    lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    playSeconds: 92160,
    modpack: null,
  },
  {
    id: 'demo-vanilla-1214',
    name: '1.21.4 · 原版',
    baseVersion: '1.21.4',
    versionId: '1.21.4',
    loader: 'vanilla',
    loaderVersion: '',
    loaderLabel: '原版',
    icon: 'grass',
    modsCount: 0,
    installed: true,
    gameDir: 'C:\\Users\\You\\AppData\\Roaming\\TYCL\\minecraft\\tycl-instances\\demo-vanilla-1214',
    lastPlayedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
    playSeconds: 33480,
    modpack: null,
  },
];

const VERSIONS = [
  '1.21.4', '1.21.3', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.20',
  '1.19.4', '1.19.2', '1.18.2', '1.17.1', '1.16.5', '1.15.2', '1.14.4', '1.12.2', '1.8.9', '1.7.10',
].map((id, index) => ({
  id,
  type: 'release',
  releaseTime: new Date(Date.now() - index * 1000 * 60 * 60 * 24 * 55).toISOString(),
}));
VERSIONS.splice(3, 0,
  { id: '25w45a', type: 'snapshot', releaseTime: '2026-10-01T10:00:00.000Z' },
  { id: '25w42a', type: 'snapshot', releaseTime: '2026-09-12T10:00:00.000Z' },
);

const MODPACKS = [
  {
    id: 'prominence-2-fabric', slug: 'prominence-2-fabric', title: 'Prominence II: Hasturian Era',
    author: 'ElocinDev', description: '以自定义内容构建的剧情向 RPG 整合包，升级天赋树、锻造神器并挑战强大首领。',
    iconUrl: covers + 'prominence-2-fabric.webp', bannerUrl: covers + 'prominence-2-fabric-banner.webp',
    downloads: 2217267, follows: 1494, categories: ['adventure', 'rpg', 'quests', 'fabric'],
    gameVersions: ['1.20.1'], loaders: ['fabric'], projectType: 'modpack', version: '1.20.1',
  },
  {
    id: 'fabulously-optimized', slug: 'fabulously-optimized', title: 'Fabulously Optimized',
    author: 'robotkoer', description: '轻量、稳定、开箱即用的性能整合包，在保持原版风格的同时显著提升帧率。',
    iconUrl: covers + 'fabulously-optimized.webp', bannerUrl: covers + 'fabulously-optimized-banner.webp',
    downloads: 15600000, follows: 4100, categories: ['optimization', 'lightweight', 'fabric'],
    gameVersions: ['1.21.4', '1.21.1', '1.20.1'], loaders: ['fabric'], projectType: 'modpack', version: '1.21.4',
  },
  {
    id: 'better-mc-forge-bmc4', slug: 'better-mc-forge-bmc4', title: 'Better MC [FORGE] · BMC4',
    author: 'SHXRKIE', description: '舒服的原版增强体验：新的生物群系、地牢与冒险内容，为 1.20.1 打造。',
    iconUrl: covers + 'better-mc-forge-bmc4.webp', bannerUrl: covers + 'better-mc-forge-bmc4-banner.webp',
    downloads: 2323663, follows: 674, categories: ['adventure', 'combat', 'forge'],
    gameVersions: ['1.20.1'], loaders: ['forge'], projectType: 'modpack', version: '1.20.1',
  },
  {
    id: 'battlearmorytacz', slug: 'battlearmorytacz', title: 'BattleArmory TACZ',
    author: 'JZ_zhenmeng', description: '100+ 现代枪械随机配发，从经典步枪到科幻武器，每局都有全新的战术体验。',
    iconUrl: covers + 'battlearmorytacz.webp', bannerUrl: covers + 'battlearmorytacz-banner.webp',
    downloads: 3798105, follows: 100, categories: ['combat', 'multiplayer', 'forge'],
    gameVersions: ['1.20.1'], loaders: ['forge'], projectType: 'modpack', version: '1.20.1',
  },
  {
    id: 'adrenaline', slug: 'adrenaline', title: 'Adrenaline',
    author: 'Snober', description: '尽可能压榨每一帧的性能向整合包，适合低配设备与追求高帧率的玩家。',
    iconUrl: covers + 'adrenaline.webp', downloads: 2900000, follows: 820,
    categories: ['optimization', 'lightweight', 'fabric'], gameVersions: ['1.20.1', '1.21.1'], loaders: ['fabric'], projectType: 'modpack', version: '1.20.1',
  },
  {
    id: 'sodiumplus', slug: 'sodiumplus', title: 'Sodium Plus',
    author: 'NoSadBeHappy', description: '以 Sodium 为核心，辅以少量实用优化模组，让原版世界更顺滑。',
    iconUrl: covers + 'sodiumplus.png', downloads: 2921057, follows: 645,
    categories: ['optimization', 'fabric'], gameVersions: ['1.21.4', '1.20.1'], loaders: ['fabric'], projectType: 'modpack', version: '1.21.4',
  },
  {
    id: 'vanilla-perfected', slug: 'vanilla-perfected', title: 'Vanilla Perfected',
    author: 'demonjoeTV', description: '在保留原版手感的前提下，补全细节、提升性能并加入恰到好处的生活化内容。',
    iconUrl: covers + 'vanilla-perfected.webp', downloads: 2712541, follows: 2570,
    categories: ['adventure', 'optimization', 'fabric'], gameVersions: ['1.21.4', '1.20.1'], loaders: ['fabric'], projectType: 'modpack', version: '1.21.4',
  },
  {
    id: 'the-pixelmon-modpack', slug: 'the-pixelmon-modpack', title: 'The Pixelmon Modpack',
    author: 'Pixelmon', description: '收集、培育与对战宝可梦的完整整合体验，包含地图、任务与音乐。',
    iconUrl: covers + 'the-pixelmon-modpack.webp', downloads: 2409775, follows: 339,
    categories: ['adventure', 'quests', 'forge'], gameVersions: ['1.20.1'], loaders: ['forge'], projectType: 'modpack', version: '1.20.1',
  },
  {
    id: 'better-mc-fabric-bmc2', slug: 'better-mc-fabric-bmc2', title: 'Better MC [FABRIC] · BMC2',
    author: 'SHXRKIE', description: '面向 Fabric 的原版增强整合包，兼顾内容与性能，适合与朋友一同开服。',
    iconUrl: covers + 'better-mc-fabric-bmc2.webp', downloads: 3733090, follows: 1500,
    categories: ['adventure', 'optimization', 'fabric'], gameVersions: ['1.20.1'], loaders: ['fabric'], projectType: 'modpack', version: '1.20.1',
  },
];

const MODS = [
  {
    id: 'sodium', slug: 'sodium', title: 'Sodium', author: 'jellysquid3',
    description: '重新实现 Minecraft 渲染管线，显著提升帧率并减少卡顿，几乎必装的性能 Mod。',
    iconUrl: covers + 'sodium.webp', downloads: 215000000, follows: 72000,
    categories: ['optimization', 'fabric'], projectType: 'mod', gameVersions: ['1.21.4', '1.21.1', '1.20.1'], loaders: ['fabric'],
  },
  {
    id: 'iris', slug: 'iris', title: 'Iris Shaders', author: 'IrisShaders',
    description: '兼容 OptiFine 光影包的高性能光影加载器，让世界拥有更真实的光线与色彩。',
    iconUrl: covers + 'iris.webp', downloads: 128000000, follows: 48000,
    categories: ['visual', 'optimization', 'fabric'], projectType: 'mod', gameVersions: ['1.21.4', '1.21.1', '1.20.1'], loaders: ['fabric'],
  },
  {
    id: 'fabric-api', slug: 'fabric-api', title: 'Fabric API', author: 'modmuss50',
    description: 'Fabric 生态的基础 API，大多数 Fabric Mod 都需要它才能正常运行。',
    iconUrl: covers + 'fabric-api.png', downloads: 562000000, follows: 43000,
    categories: ['library', 'fabric'], projectType: 'mod', gameVersions: ['1.21.4', '1.21.1', '1.20.1', '1.19.2'], loaders: ['fabric'],
  },
  {
    id: 'create', slug: 'create', title: 'Create', author: 'simibubi',
    description: '以旋转动力与机械结构为核心的科技 Mod，用齿轮、传送带与列车建造你的工业世界。',
    iconUrl: covers + 'create.webp', downloads: 89000000, follows: 34000,
    categories: ['technology', 'forge', 'fabric'], projectType: 'mod', gameVersions: ['1.20.1', '1.19.2'], loaders: ['forge', 'fabric'],
  },
  {
    id: 'jei', slug: 'jei', title: 'Just Enough Items', author: 'mezz',
    description: '经典的物品与配方查询工具，保持你的合成桌整洁有序，随时找到需要的配方。',
    iconUrl: covers + 'jei.webp', downloads: 244000000, follows: 28000,
    categories: ['utility', 'forge', 'fabric'], projectType: 'mod', gameVersions: ['1.20.1', '1.19.2', '1.18.2'], loaders: ['forge', 'fabric'],
  },
  {
    id: 'xaeros-minimap', slug: 'xaeros-minimap', title: "Xaero's Minimap", author: 'thexaero',
    description: '在屏幕角落显示周围地形、玩家与生物的实时小地图，并支持路径点标记。',
    iconUrl: covers + 'xaeros-minimap.webp', downloads: 121000000, follows: 19031,
    categories: ['adventure', 'utility', 'forge', 'fabric'], projectType: 'mod', gameVersions: ['1.20.1', '1.19.2', '1.18.2'], loaders: ['forge', 'fabric'],
  },
  {
    id: 'cobblemon', slug: 'cobblemon', title: 'Cobblemon', author: 'Cobblemon',
    description: '将宝可梦带入 Minecraft 的开源 Mod，探索、捕捉、对战与培育你的伙伴。',
    iconUrl: covers + 'cobblemon.webp', downloads: 28000000, follows: 23000,
    categories: ['adventure', 'mobs', 'forge', 'fabric'], projectType: 'mod', gameVersions: ['1.20.1', '1.19.2'], loaders: ['forge', 'fabric'],
  },
  {
    id: 'terralith', slug: 'terralith', title: 'Terralith', author: 'Starmute',
    description: '使用原版方块重塑地形生成，新增数十种生物群系与壮观的自然景观。',
    iconUrl: covers + 'terralith.webp', downloads: 45000000, follows: 12000,
    categories: ['worldgen', 'adventure', 'fabric', 'forge'], projectType: 'mod', gameVersions: ['1.20.1', '1.19.2', '1.18.2'], loaders: ['fabric', 'forge'],
  },
];

const MODPACK_DETAIL_BODY = '这个整合包围绕探索与成长构建了一套完整的体验。它保留了 Minecraft 熟悉的节奏，同时加入恰到好处的新内容：新的地形、任务与工具，让你每次打开世界都有新的目标。\n\n整合包已经为你配置好推荐的模组组合与性能设置，安装完成后即可直接开始游戏。你也可以在实例目录中继续添加自己的 Mod。';
const MOD_DETAIL_BODY = '一个精心制作的 Minecraft 模组，适用于对应版本与加载器。安装到实例后，启动游戏即可体验。\n\n如果该 Mod 需要前置依赖，TYCL 会在安装时自动为你补齐。';

function projectDetail(item) {
  return {
    ...item,
    body: item.projectType === 'modpack' ? MODPACK_DETAIL_BODY : MOD_DETAIL_BODY,
    updated: new Date(Date.now() - 86400000 * 12).toISOString(),
    license: 'MIT',
    gallery: item.bannerUrl ? [item.bannerUrl] : [],
    sourceUrl: '',
    issuesUrl: '',
  };
}

function versionsFor(project) {
  const versions = project.gameVersions.map((gameVersion, index) => {
    const loader = project.loaders[index % project.loaders.length] || 'fabric';
    return {
      id: `${project.id}-${gameVersion}-${loader}`.toLowerCase(),
      name: `${project.title} ${gameVersion}`,
      versionNumber: gameVersion === project.version ? '最新版' : gameVersion,
      gameVersions: [gameVersion],
      loaders: [loader],
      versionType: 'release',
      datePublished: new Date(Date.now() - index * 86400000 * 22).toISOString(),
      downloads: Math.round(project.downloads / (index + 3)),
      files: [{ filename: `${project.slug}-${gameVersion}-${loader}.jar`, primary: true, url: '' }],
      dependencies: [],
    };
  });
  if (project.projectType === 'modpack') {
    versions.unshift({
      id: `${project.id}-latest`,
      name: '最新版本',
      versionNumber: '1.0.0',
      gameVersions: [project.version],
      loaders: project.loaders,
      versionType: 'release',
      datePublished: new Date().toISOString(),
      downloads: project.downloads,
      files: [{ filename: `${project.slug}.mrpack`, primary: true, url: '' }],
      dependencies: [],
    });
  }
  return versions;
}

const javaList = [
  { path: 'C:\\Program Files\\Microsoft\\jdk-17.0.13.11-hotspot\\bin\\java.exe', version: '17.0.13', major: 17, vendor: 'Microsoft' },
  { path: 'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.4.7-hotspot\\bin\\java.exe', version: '21.0.4', major: 21, vendor: 'Eclipse Adoptium' },
  { path: 'C:\\Program Files\\Java\\jdk1.8.0_421\\bin\\java.exe', version: '1.8.0_421', major: 8, vendor: 'Oracle' },
];

const loaders = {
  vanilla: { label: '原版', recommended: '', versions: [{ version: '', stable: true }] },
  fabric: {
    label: 'Fabric',
    recommended: '0.16.10',
    versions: [
      { version: '0.16.10', stable: true }, { version: '0.16.9', stable: true }, { version: '0.16.8', stable: true },
    ],
  },
  forge: {
    label: 'Forge',
    recommended: '47.3.19',
    versions: [{ version: '47.3.19', stable: true }, { version: '47.3.0', stable: false }],
  },
  quilt: {
    label: 'Quilt',
    recommended: '0.26.4',
    versions: [{ version: '0.26.4', stable: true }, { version: '0.26.3', stable: true }],
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

const listeners = { progress: [], done: [], error: [], cancelled: [], game: [] };
const emit = (name, payload) => listeners[name].forEach((cb) => cb(payload));
const timers = new Map();

const state = {
  settings: readLocal('tycl.mock.settings', clone(DEFAULT_SETTINGS)),
  instances: readLocal('tycl.mock.instances', clone(SAMPLE_INSTANCES)),
  skins: readLocal('tycl.mock.skins', clone(BUILTIN_SKINS)),
  account: readLocal('tycl.mock.account', { mode: 'offline', account: null }),
  activeGame: null,
};
state.settings.player = { ...DEFAULT_SETTINGS.player, ...(state.settings.player || {}) };
state.settings.accountMode = state.account.mode === 'microsoft' ? 'microsoft' : 'offline';
state.settings.updateFeedUrl = state.settings.updateFeedUrl || '';
state.settings.microsoftClientId = state.settings.microsoftClientId || '00000000402b5328';

function getActiveSkin() {
  const active = state.skins.find((skin) => skin.id === state.settings.player.skin) || state.skins[0];
  if (state.settings.player.skin !== active.id) state.settings.player.skin = active.id;
  const model = state.settings.player.model || active.model;
  return { ...active, model };
}

function bootstrap() {
  const activeSkin = getActiveSkin();
  return {
    settings: clone(state.settings),
    player: clone({ ...state.settings.player, skin: activeSkin.id }),
    skins: clone(state.skins.map((skin) => ({ ...skin, model: skin.id === activeSkin.id ? activeSkin.model : skin.model }))),
    activeSkinId: activeSkin.id,
    activeSkin: clone(activeSkin),
    instances: clone(state.instances),
    activeGame: state.activeGame ? { ...state.activeGame } : null,
    account: clone({
      ...state.account,
      offlineName: state.settings.player.name,
      clientId: state.settings.microsoftClientId || '00000000402b5328',
    }),
    system: {
      platform: 'win32',
      arch: 'x64',
      totalMemoryMb: 32768,
      appVersion: '1.3.2',
      gameDir: state.settings.gameDir,
      isMaximized: false,
      demo: true,
    },
  };
}

function startTask({ kind, title, duration = 4200, result = {}, onDone = null }) {
  const id = 'mock-' + Math.random().toString(36).slice(2);
  let percent = 0;
  const stages = kind === 'install'
    ? ['解析版本信息', '下载游戏核心', '下载游戏依赖', '下载游戏资源', '安装模组加载器', '创建游戏实例']
    : kind === 'mod'
      ? ['解析 Mod 文件', '检查前置依赖', '下载 Mod', '写入 mods 目录']
      : kind === 'modpack'
        ? ['解析整合包', '安装游戏环境', '下载整合包内容', '写入覆盖文件']
        : ['检查 Java', '构建启动参数', '启动游戏'];
  let cancelled = false;
  const started = Date.now();
  emit('progress', { id, kind, title, percent: 0, stage: stages[0], detail: '准备中', status: 'running' });
  const timer = setInterval(() => {
    if (cancelled) return;
    const elapsed = Date.now() - started;
    percent = Math.min(99, Math.round((elapsed / duration) * 100));
    const stageIndex = Math.min(stages.length - 1, Math.floor((percent / 100) * stages.length));
    emit('progress', {
      id, kind, title, percent, stage: stages[stageIndex],
      detail: kind === 'launch' ? '正在准备运行环境…' : `${kindsDetail(kind)} ${Math.min(100, percent + 3)}%`,
      status: 'running',
    });
    if (elapsed >= duration) {
      clearInterval(timer);
      timers.delete(id);
      if (cancelled) return;
      const finalResult = typeof result === 'function' ? result() : result;
      if (onDone) onDone(finalResult);
      if (kind === 'launch') {
        state.activeGame = { instanceId: finalResult?.instanceId, pid: 18832, startedAt: Date.now() };
        emit('progress', { id, kind, title, percent: 100, stage: '游戏已启动', detail: 'PID 18832', status: 'running' });
        emit('game', { type: 'running', instanceId: finalResult?.instanceId, pid: 18832 });
      }
      emit('done', { id, kind, title, status: 'done', result: finalResult, elapsed: duration });
    }
  }, 110);
  timers.set(id, { timer, cancel: () => { cancelled = true; clearInterval(timer); timers.delete(id); emit('cancelled', { id, kind, title, status: 'cancelled' }); } });
  return { id };
}

function kindsDetail(kind) {
  return kind === 'install' ? '正在写入' : kind === 'mod' ? '正在下载' : kind === 'modpack' ? '正在解压' : '正在启动';
}

function addMockInstance({ mcVersion, loader, name, modpack = null }) {
  const loaderMap = { vanilla: '原版', fabric: 'Fabric', forge: 'Forge', quilt: 'Quilt' };
  const instance = {
    id: 'demo-' + Math.random().toString(36).slice(2),
    name: name || `${mcVersion} · ${loaderMap[loader] || '原版'}`,
    baseVersion: mcVersion,
    versionId: loader === 'vanilla' ? mcVersion : `${loader}-${mcVersion}`,
    loader,
    loaderLabel: loaderMap[loader] || '原版',
    loaderVersion: '',
    icon: loader,
    modsCount: modpack ? 86 : 0,
    installed: true,
    gameDir: `C:\\Users\\You\\AppData\\Roaming\\TYCL\\minecraft\\tycl-instances\\demo-${Date.now()}`,
    lastPlayedAt: '',
    playSeconds: 0,
    modpack,
  };
  state.instances.unshift(instance);
  writeLocal('tycl.mock.instances', state.instances);
  return instance;
}

function findCatalogItem(id) {
  return [...MODPACKS, ...MODS].find((item) => item.id === id || item.slug === id);
}

const api = {
  isElectron: false,
  isDemo: true,

  async getBootstrap() {
    await new Promise((r) => setTimeout(r, 250));
    return bootstrap();
  },
  async saveSettings(patch) {
    state.settings = { ...state.settings, ...patch, player: { ...state.settings.player, ...(patch.player || {}) } };
    writeLocal('tycl.mock.settings', state.settings);
    return bootstrap();
  },
  async chooseDirectory(options = {}) {
    return { canceled: false, path: options.defaultPath || state.settings.gameDir };
  },
  async chooseFile() {
    return { canceled: true, path: '' };
  },
  async detectJava() {
    await new Promise((r) => setTimeout(r, 500));
    return { javas: clone(javaList), settings: clone(state.settings) };
  },
  async setSkin({ skinId, model }) {
    const target = state.skins.find((skin) => skin.id === skinId);
    if (target) {
      state.settings.player.skin = target.id;
      if (model === 'slim' || model === 'classic') state.settings.player.model = model;
      writeLocal('tycl.mock.settings', state.settings);
    }
    return bootstrap();
  },
  async uploadSkin({ dataUrl, name }) {
    const skin = {
      id: 'custom:' + Date.now(), name: name || '我的皮肤', description: '本地导入',
      model: 'classic', builtin: false, tone: '#7d94ad', dataUrl,
    };
    state.skins.unshift(skin);
    state.settings.player.skin = skin.id;
    state.settings.player.model = skin.model;
    writeLocal('tycl.mock.skins', state.skins);
    writeLocal('tycl.mock.settings', state.settings);
    return bootstrap();
  },
  async updatePlayer(payload) {
    state.settings.player = { ...state.settings.player, ...payload };
    writeLocal('tycl.mock.settings', state.settings);
    return bootstrap();
  },
  async microsoftLogin() {
    await new Promise((r) => setTimeout(r, 1400));
    state.account = {
      mode: 'microsoft',
      account: {
        type: 'microsoft',
        name: 'A3Y8',
        uuid: '1f4f3f8a2e4c497fbbe20a8c8d579132',
        xuid: '2535000000000000',
        skins: [],
        capes: [],
        loggedInAt: new Date().toISOString(),
        expiresAt: Date.now() + 86400000,
      },
    };
    state.settings.accountMode = 'microsoft';
    writeLocal('tycl.mock.account', state.account);
    writeLocal('tycl.mock.settings', state.settings);
    return bootstrap();
  },
  async logoutMicrosoft() {
    state.account = { mode: 'offline', account: null };
    state.settings.accountMode = 'offline';
    writeLocal('tycl.mock.account', state.account);
    writeLocal('tycl.mock.settings', state.settings);
    return bootstrap();
  },
  async setOfflineAccount() {
    state.account = { mode: 'offline', account: null };
    state.settings.accountMode = 'offline';
    writeLocal('tycl.mock.account', state.account);
    writeLocal('tycl.mock.settings', state.settings);
    return bootstrap();
  },
  async cancelMicrosoftLogin() {
    return { ok: true };
  },
  async checkUpdates() {
    await new Promise((r) => setTimeout(r, 600));
    return {
      currentVersion: '1.3.2',
      packaged: false,
      canAutoUpdate: false,
      feedUrl: state.settings.updateFeedUrl,
      configured: false,
      hasUpdate: false,
      latestVersion: '1.3.2',
      notes: '',
      error: state.settings.updateFeedUrl ? '' : '尚未配置更新源（演示模式）',
      checkedAt: Date.now(),
    };
  },
  async getUpdateInfo() {
    return { currentVersion: '1.3.2', packaged: false, canAutoUpdate: false, feedUrl: state.settings.updateFeedUrl };
  },
  async chooseUpdatePackage() {
    return { canceled: true };
  },
  async downloadUpdate() {
    throw new Error('演示模式不支持下载更新');
  },
  async installUpdate() {
    throw new Error('演示模式不支持安装更新');
  },
  async listVersions() {
    await new Promise((r) => setTimeout(r, 450));
    return { latest: { release: '1.21.4', snapshot: '25w45a' }, versions: clone(VERSIONS) };
  },
  async getLoaders() {
    await new Promise((r) => setTimeout(r, 300));
    return clone(loaders);
  },
  async startInstall(options) {
    const task = startTask({
      kind: 'install', title: options.loader === 'vanilla' ? `安装 Minecraft ${options.mcVersion}` : `安装 ${options.mcVersion} · ${options.loader}`,
      duration: 4800,
      result: () => ({ instance: addMockInstance({ mcVersion: options.mcVersion, loader: options.loader, name: options.instanceName }) }),
    });
    return task;
  },
  async startLaunch(instanceId) {
    const instance = state.instances.find((item) => item.id === instanceId);
    return startTask({
      kind: 'launch',
      title: `启动 ${instance ? instance.name : '游戏'}`,
      duration: 2600,
      result: { instanceId, pid: 18832 },
    });
  },
  async cancelTask(id) {
    const timer = timers.get(id);
    if (timer) timer.cancel();
    return { ok: Boolean(timer) };
  },
  async deleteInstance(id) {
    state.instances = state.instances.filter((item) => item.id !== id);
    writeLocal('tycl.mock.instances', state.instances);
    return { ok: true };
  },
  async openInstanceFolder() {
    return { ok: true };
  },
  async searchCurseForge() { return { hits: [{ id: 238222, name: 'JEI', author: 'mezz', downloads: 120000000, summary: 'Just Enough Items', iconUrl: '' }] }; },
  async installCurseForge() { return { id: 'cf-task' }; },
  async addResource() { return { ok: true, name: 'demo.zip', resources: {} }; },
  async deleteResource() { return { ok: true, resources: {} }; },
  async testNetwork() {
    await new Promise((r) => setTimeout(r, 900));
    return {
      results: [
        { key: 'bmclapi', name: 'BMCLAPI 镜像', ok: true, ms: 86 },
        { key: 'official', name: 'Mojang 官方', ok: true, ms: 242 },
        { key: 'modrinth', name: 'Modrinth', ok: true, ms: 168 },
      ],
      testedAt: new Date().toISOString(),
    };
  },
  async getInstanceDetails(id) {
    const instance = state.instances.find((item) => item.id === id) || state.instances[0];
    return {
      instance,
      mods: {
        mods: [
          { file: 'fabric-api-0.92.2.jar', name: 'Fabric API', id: 'fabric-api', version: '0.92.2', size: 1880000, enabled: true },
          { file: 'sodium-0.5.11.jar', name: 'Sodium', id: 'sodium', version: '0.5.11', size: 942000, enabled: true },
          { file: 'iris-1.7.0.jar.disabled', name: 'Iris Shaders', id: 'iris', version: '1.7.0', size: 1240000, enabled: false },
        ],
        conflicts: [],
      },
      worlds: [{ name: '新的世界', path: 'mock', modifiedAt: new Date().toISOString() }],
      screenshots: [{ name: '2026-10-25_15.20.11.png' }],
      backups: [{ name: '实例备份-2026-10-25.zip', file: 'mock-backup.zip', size: 48200000, modifiedAt: new Date().toISOString() }],
      resources: { resourcepacks: [{ name: 'Faithful 32x.zip', size: 2200000, modifiedAt: new Date().toISOString() }], shaderpacks: [{ name: 'Complementary.zip', size: 5400000, modifiedAt: new Date().toISOString() }], saves: [{ name: '新的世界', directory: true, size: 0, modifiedAt: new Date().toISOString() }] },
    };
  },
  async updateInstanceSettings(id, patch) {
    const instance = state.instances.find((item) => item.id === id);
    if (instance) Object.assign(instance, patch);
    writeLocal('tycl.mock.instances', state.instances);
    return instance;
  },
  async toggleMod() { return { ok: true }; },
  async deleteMod() { return { ok: true }; },
  async checkModUpdates() { return []; },
  async backupWorld() { return { ok: true, name: 'world-backup.zip' }; },
  async backupInstance() { return { ok: true, name: 'instance-backup.zip', size: 48200000 }; },
  async listBackups() { return [{ name: 'instance-backup.zip', file: 'mock-backup.zip', size: 48200000, modifiedAt: new Date().toISOString() }]; },
  async exportInstance() { return { ok: false, cancelled: true }; },
  async importInstance() { return { ok: false, cancelled: true }; },
  async restoreBackup() { return { ok: false, cancelled: true }; },
  async repairInstance() { return { ok: true }; },
  async updateModpack() { return { ok: true }; },
  async openPath() {
    return { ok: true };
  },
  async listServers() {
    return [
      { id: 'demo-1', name: 'Hypixel', address: 'mc.hypixel.net:25565', host: 'mc.hypixel.net', port: 25565 },
      { id: 'demo-2', name: '本地测试服', address: '127.0.0.1:25565', host: '127.0.0.1', port: 25565 },
    ];
  },
  async addServer(payload) { return { id: 'demo-new', ...payload }; },
  async removeServer() { return { ok: true }; },
  async pingServer(address) { return { address, online: true, latency: 42, players: { online: 128, max: 500 }, version: '1.20.1', motd: 'A Minecraft Server' }; },
  async pingAllServers() { return (await this.listServers()).map((s) => ({ ...s, status: { online: true, latency: 42, players: { online: 128, max: 500 }, version: '1.20.1', motd: 'A Minecraft Server' } })); },
  async startTunnel() { await new Promise((r) => setTimeout(r, 700)); return { ok: true, address: 'bore.pub:35720', localPort: 25565 }; },
  async stopTunnel() { return { ok: true }; },
  async getTunnelState() { return { active: false }; },
  async startLanDiscovery() { return { ok: true }; },
  async startServer(options) { await new Promise((r) => setTimeout(r, 900)); return { active: true, status: 'running', instanceId: options.instanceId, instanceName: 'Mock', port: options.port || 25565, logs: ['[Server] Starting minecraft server', '[Server] Done (2.100s)!'], mods: { kept: [{ file: 'fabric-api.jar', name: 'Fabric API' }], skipped: [{ file: 'sodium.jar', name: 'Sodium' }, { file: 'iris.jar', name: 'Iris' }] } }; },
  async getServerState() { return { active: false }; },
  async stopServer() { return { ok: true }; },
  async forceStopServer() { return { ok: true }; },
  async listLanWorlds() { return [{ address: '192.168.1.8:54321', motd: 'Steve 的世界', lastSeen: Date.now() }]; },
  async showInFolder() {
    return { ok: true };
  },
  async openExternal() {
    return { ok: true };
  },
  async searchResources({ query = '', type = 'modpack', gameVersion = '', loader = '', category = '', offset = 0, limit = 20 } = {}) {
    await new Promise((r) => setTimeout(r, 350));
    const source = type === 'mod' ? MODS : MODPACKS;
    const q = query.trim().toLowerCase();
    const filtered = source.filter((item) => {
      if (q && !(item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.slug.includes(q))) return false;
      if (gameVersion && !item.gameVersions.includes(gameVersion)) return false;
      if (loader && !item.loaders.includes(loader)) return false;
      if (category && !item.categories.includes(category)) return false;
      return true;
    });
    return { hits: clone(filtered.slice(offset, offset + limit)), total: filtered.length, offset, limit };
  },
  async getProject(id) {
    await new Promise((r) => setTimeout(r, 250));
    const item = findCatalogItem(id);
    if (!item) throw new Error('项目不存在');
    return projectDetail(clone(item));
  },
  async getMinecraftNews() {
    await new Promise((r) => setTimeout(r, 450));
    return {
      source: 'Minecraft 官方新闻',
      sourceUrl: 'https://www.minecraft.net/zh-hans/news',
      language: 'en',
      updatedAt: MOCK_NEWS_UPDATED_AT,
      entries: clone(MOCK_NEWS),
    };
  },
  async getProjectVersions(id, filters = {}) {
    await new Promise((r) => setTimeout(r, 250));
    const item = findCatalogItem(id);
    if (!item) return [];
    let list = versionsFor(item);
    if (filters.gameVersion) list = list.filter((v) => v.gameVersions.includes(filters.gameVersion));
    if (filters.loader) list = list.filter((v) => v.loaders.includes(filters.loader));
    return clone(list);
  },
  async translateTexts(texts) {
    await new Promise((r) => setTimeout(r, 700));
    return {
      translations: (texts || []).map((text) => `【演示汉化】${text}`),
      provider: '演示翻译',
      partial: false,
    };
  },
  async getDiagnostics(instanceId) {
    await new Promise((r) => setTimeout(r, 350));
    const instance = state.instances.find((item) => item.id === instanceId) || state.instances[0];
    return {
      generatedAt: new Date().toISOString(),
      level: 'ok',
      appVersion: '1.3.2',
      system: { platform: 'win32', arch: 'x64', totalMemoryMb: 32768, cpus: 16 },
      environment: { gameDir: state.settings.gameDir, javaPath: '', javaRequired: 17, javaList: javaList.map((item) => ({ path: item.path, major: item.major })), memoryMb: state.settings.memoryMb },
      instance: instance ? { id: instance.id, name: instance.name, baseVersion: instance.baseVersion, versionId: instance.versionId, loader: instance.loader, loaderLabel: instance.loaderLabel, gameDir: instance.gameDir, modsCount: instance.modsCount } : null,
      checks: [
        { level: 'ok', title: 'TYCL 运行正常', detail: 'v1.1.7 · win32 / x64' },
        { level: 'ok', title: '版本文件完整', detail: instance ? `${instance.baseVersion} · ${instance.loaderLabel}` : '未选择实例' },
        { level: 'ok', title: 'Java 运行环境', detail: 'Java 21 · C:\\Program Files\\Java\\jdk-21\\bin\\java.exe' },
      ],
      log: { file: 'mock.log', tail: '[TYCL] 演示模式诊断日志\n[game] Setting user: Steve\n[game] LWJGL Version: 3.3.3' },
      crash: null,
      exitCode: 0,
    };
  },
  async installMod(options) {
    const item = findCatalogItem(options.projectId);
    return startTask({
      kind: 'mod',
      title: `安装 Mod · ${item ? item.title : 'Mod'}`,
      duration: 3200,
      result: { count: 1, project: item ? item.title : 'Mod' },
    });
  },
  async installModpack(options) {
    const item = findCatalogItem(options.projectId);
    return startTask({
      kind: 'modpack',
      title: `安装整合包 · ${item ? item.title : '整合包'}`,
      duration: 6500,
      result: () => {
        const instance = addMockInstance({
          mcVersion: item ? item.version : '1.20.1',
          loader: item ? item.loaders[0] : 'fabric',
          name: item ? item.title : '整合包',
          modpack: { title: item ? item.title : '整合包', iconUrl: item ? item.iconUrl : '' },
        });
        return { instance, fileCount: 128 };
      },
    });
  },
  async getActiveGame() {
    return state.activeGame;
  },
  async stopGame() {
    if (state.activeGame) {
      const game = state.activeGame;
      state.activeGame = null;
      emit('game', { type: 'stopped', instanceId: game.instanceId, code: 0, seconds: 60 });
    }
    return { ok: true };
  },
  async getLogs() {
    return { file: 'mock.log', lines: ['[TYCL] 演示模式日志', '[game] Setting user: Steve', '[game] LWJGL Version: 3.3.3'] };
  },
  async minimize() {},
  async toggleMaximize() { return false; },
  async closeWindow() {},
  async isMaximized() { return false; },
  async setNativeTheme() { return false; },
  onTaskProgress(cb) { listeners.progress.push(cb); },
  onTaskDone(cb) { listeners.done.push(cb); },
  onTaskError(cb) { listeners.error.push(cb); },
  onTaskCancelled(cb) { listeners.cancelled.push(cb); },
  onGameStatus(cb) { listeners.game.push(cb); },
  onAccountChanged() {},
  onUpdateAvailable() {},
  onWindowMaximized() {},
};

export const mockApi = api;
export const mockData = { MODPACKS, MODS, VERSIONS, BUILTIN_SKINS, javaList, loaders };
