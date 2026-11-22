import { api, isElectron } from './api.js';
import { icon, hydrateIcons } from './icons.js';
import { applyThemeDom, ensureThemeColorMeta, toast, confirmDialog, closeMenu, setAvatar, openModal } from './components.js';
import { escapeHtml } from './utils.js';
import {
  openInstallModal,
  openLatestInstall,
  openAccountModal,
  openAboutModal,
  openProjectModal,
  openLogsModal,
  openUpdatesModal,
  openAvailableUpdatePrompt,
  openNewsDetail,
  openDiagnosticsModal,
  openInstanceManager,
  launchInstance,
} from './flows.js';
import { openMessageCenter, refreshMessages } from './messages.js';
import * as homePage from './pages/home.js';
import * as newsPage from './pages/news.js';
import * as aiPage from './pages/ai.js';
import * as multiplayerPage from './pages/multiplayer.js';
import * as versionsPage from './pages/versions.js';
import * as resourcesPage from './pages/resources.js';
import * as skinsPage from './pages/skins.js';
import * as settingsPage from './pages/settings.js';
import { setupEasterEggs } from './easter.js';

const appEl = document.getElementById('app');
const taskRoot = document.getElementById('task-root');
const navItems = Array.from(document.querySelectorAll('.nav-item[data-route]'));

const PAGE_META = {
  home: { label: '首页', title: '首页' },
  news: { label: '新闻', title: '新闻' },
  ai: { label: 'AI 助手', title: 'AI 助手' },
  multiplayer: { label: '联机', title: '联机' },
  versions: { label: '游戏库', title: '游戏库' },
  resources: { label: '资源中心', title: '资源中心' },
  skins: { label: '皮肤工坊', title: '皮肤工坊' },
  settings: { label: '设置', title: '设置' },
};

const PAGES = {
  home: homePage,
  news: newsPage,
  ai: aiPage,
  multiplayer: multiplayerPage,
  versions: versionsPage,
  resources: resourcesPage,
  skins: skinsPage,
  settings: settingsPage,
};

const state = {
  settings: {
    theme: 'light',
    accent: 'mint',
    memoryMb: 4096,
    gameDir: '',
    downloadSource: 'bmclapi',
    showSnapshots: false,
    javaPath: '',
  },
  player: { name: 'Steve', model: 'classic' },
  skins: [],
  activeSkin: null,
  activeSkinId: '',
  account: { mode: 'offline', account: null, offlineName: 'Steve' },
  instances: [],
  activeGame: null,
  system: {},
  versionCache: null,
  ui: {
    selectedInstanceId: safeLocalGet('tycl.selectedInstance') || '',
    versionTab: safeLocalGet('tycl.versionTab') || 'installed',
    resourceType: safeLocalGet('tycl.resourceType') || 'modpack',
  },
};

let currentRoute = 'home';
let currentCleanup = null;
let currentAbort = null;
let renderToken = 0;
const taskCards = new Map();
let themeMedia = null;

function safeLocalGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function saveUi() {
  safeLocalSet('tycl.selectedInstance', state.ui.selectedInstanceId || '');
  safeLocalSet('tycl.versionTab', state.ui.versionTab || 'installed');
  safeLocalSet('tycl.resourceType', state.ui.resourceType || 'modpack');
}

function resolveTheme(theme) {
  if (theme !== 'system') return theme;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateQuickThemeIcon() {
  const button = document.getElementById('quick-theme');
  if (!button) return;
  const actual = resolveTheme(state.settings.theme);
  button.innerHTML = icon(actual === 'dark' ? 'sun' : 'moon', 15);
  button.title = actual === 'dark' ? '切换到浅色主题' : '切换到深色主题';
}

function displayName() {
  if (state.account?.mode === 'microsoft' && state.account.account?.name) return state.account.account.name;
  return state.player?.name || 'Steve';
}

function applyPlayerUi() {
  const avatar = document.getElementById('sidebar-avatar');
  const name = document.getElementById('sidebar-name');
  const type = document.querySelector('.player-type');
  const count = document.getElementById('nav-instance-count');
  setAvatar(avatar, state.activeSkin?.dataUrl);
  if (name) name.textContent = displayName();
  if (type) {
    const microsoft = state.account?.mode === 'microsoft';
    type.innerHTML = `<i></i> ${microsoft ? 'Microsoft 正版' : '离线账户'}`;
  }
  if (count) {
    count.textContent = String(state.instances.length);
    count.hidden = state.instances.length === 0;
  }
}

function applyBootstrap(data) {
  if (!data) return;
  if (data.settings) state.settings = { ...state.settings, ...data.settings, player: { ...state.player, ...(data.settings.player || {}) } };
  if (data.player) state.player = { ...state.player, ...data.player };
  if (Array.isArray(data.skins)) state.skins = data.skins;
  if (data.activeSkin) state.activeSkin = data.activeSkin;
  if (data.activeSkinId) state.activeSkinId = data.activeSkinId;
  if (Array.isArray(data.instances)) state.instances = data.instances;
  if (data.activeGame !== undefined) state.activeGame = data.activeGame;
  if (data.account) state.account = data.account;
  if (data.system) state.system = { ...state.system, ...data.system };
  if (!state.activeSkin && state.skins.length) {
    state.activeSkin = state.skins.find((skin) => skin.id === state.settings.player.skin) || state.skins[0];
    state.activeSkinId = state.activeSkin.id;
  }
  if (!state.instances.some((item) => item.id === state.ui.selectedInstanceId)) {
    state.ui.selectedInstanceId = state.instances[0]?.id || '';
  }
  applyThemeDom(state.settings.theme, state.settings.accent);
  updateQuickThemeIcon();
  applyPlayerUi();
}

function setSidebarActive(route) {
  navItems.forEach((item) => {
    const active = item.dataset.route === route || (route === 'resources' && item.dataset.route === 'resources');
    item.classList.toggle('active', active);
  });
  const pageLabel = document.getElementById('chrome-page');
  if (pageLabel) pageLabel.textContent = PAGE_META[route]?.label || '首页';
  document.title = `TYCL — ${PAGE_META[route]?.title || 'Minecraft Launcher'}`;
}

async function renderRoute(route, { force = false } = {}) {
  if (!PAGES[route]) route = 'home';
  if (!force && route === currentRoute && appEl.dataset.rendered === 'true') return;
  closeMenu();
  if (currentAbort) currentAbort.abort();
  if (typeof currentCleanup === 'function') {
    try {
      currentCleanup();
    } catch {
      // ignore
    }
  }
  currentCleanup = null;
  currentRoute = route;
  appEl.dataset.rendered = 'true';
  setSidebarActive(route);
  appEl.scrollTop = 0;
  const controller = new AbortController();
  currentAbort = controller;
  const token = ++renderToken;
  const pageContext = { ...ctx, signal: controller.signal };
  try {
    const cleanup = await PAGES[route].render(appEl, pageContext);
    if (token !== renderToken || controller.signal.aborted) {
      if (typeof cleanup === 'function') cleanup();
      return;
    }
    currentCleanup = cleanup;
    hydrateIcons(appEl);
  } catch (error) {
    if (token !== renderToken) return;
    console.error(error);
    appEl.innerHTML = `<div class="page"><div class="page-error">${icon('alert-triangle', 32)}<strong>页面加载失败</strong><span>${escapeHtml(error.message || '未知错误')}</span><button class="btn btn-secondary btn-sm" data-retry-page style="margin-top:10px">重新加载</button></div></div>`;
    appEl.querySelector('[data-retry-page]')?.addEventListener('click', () => renderRoute(route, { force: true }));
  }
}

function navigate(route, options = {}) {
  if (!PAGES[route]) return;
  if (route === 'resources' && options.type) {
    state.ui.resourceType = options.type;
    saveUi();
  }
  if (options.versionTab) {
    state.ui.versionTab = options.versionTab;
    saveUi();
  }
  const hash = `#${route}`;
  if (location.hash !== hash) {
    try {
      history.pushState(null, '', hash);
    } catch {
      // ignore
    }
  }
  renderRoute(route, { force: true });
}

const ctx = {
  state,
  api,
  isElectron,
  navigate,
  rerender: () => renderRoute(currentRoute, { force: true }),
  saveUi,
  applyBootstrap,
  async refreshState({ rerender = false } = {}) {
    const data = await api.getBootstrap();
    applyBootstrap(data);
    if (rerender) await renderRoute(currentRoute, { force: true });
    return data;
  },
  async saveSettings(patch) {
    const result = await api.saveSettings(patch);
    applyBootstrap(result);
    return result;
  },
  async setTheme(theme) {
    state.settings.theme = theme;
    applyThemeDom(theme, state.settings.accent);
    updateQuickThemeIcon();
    try {
      await api.setNativeTheme?.(theme);
      const result = await api.saveSettings({ theme });
      applyBootstrap(result);
    } catch (error) {
      toast({ title: '主题保存失败', message: error.message, type: 'error' });
    }
  },
  async setAccent(accent) {
    state.settings.accent = accent;
    applyThemeDom(state.settings.theme, accent);
    try {
      const result = await api.saveSettings({ accent });
      applyBootstrap(result);
    } catch (error) {
      toast({ title: '颜色保存失败', message: error.message, type: 'error' });
    }
  },
  openInstall: (options) => openInstallModal(ctx, options),
  openLatestInstall: () => openLatestInstall(ctx),
  openAccount: () => openAccountModal(ctx),
  openAbout: () => openAboutModal(ctx),
  openProject: (id) => openProjectModal(ctx, id),
  openLogs: (instance) => openLogsModal(ctx, instance),
  openNews: (entry) => openNewsDetail(ctx, entry),
  openDiagnostics: (instance, options) => openDiagnosticsModal(ctx, instance, options),
  openInstanceManager: (instance) => openInstanceManager(ctx, instance),
  openUpdates: () => openUpdatesModal(ctx),
  launch: (instance, button) => launchInstance(ctx, instance, button),
  confirm: confirmDialog,
  toast,
  displayName,
};

window.tyclContext = ctx;

let launchTaskId = '';
let launchHideTimer = null;

function updateLaunchProgress(payload) {
  const overlay = document.getElementById('launch-overlay');
  if (!overlay || payload.id !== launchTaskId) return;
  overlay.hidden = false;
  const percent = Math.max(0, Math.min(100, Number(payload.percent) || 0));
  const circle = document.getElementById('launch-ring-value');
  if (circle) circle.style.strokeDashoffset = String(314 - (314 * percent) / 100);
  document.getElementById('launch-percent').textContent = `${Math.round(percent)}%`;
  document.getElementById('launch-stage').textContent = payload.stage || '正在启动游戏…';
  document.getElementById('launch-detail').textContent = payload.detail || '';
}

function showLaunchProgress(taskId, instanceName = '') {
  launchTaskId = taskId;
  const overlay = document.getElementById('launch-overlay');
  if (!overlay) return;
  overlay.hidden = false;
  const title = document.getElementById('launch-title');
  if (title) title.textContent = instanceName ? `正在启动 · ${instanceName}` : '正在启动游戏';
  updateLaunchProgress({ id: taskId, percent: 0, stage: '准备 Java 与游戏文件…' });
}

function hideLaunchProgress() {
  const overlay = document.getElementById('launch-overlay');
  if (overlay) overlay.hidden = true;
  launchTaskId = '';
}

document.querySelector('[data-launch-hide]')?.addEventListener('click', hideLaunchProgress);

api.onTaskProgress((payload) => updateLaunchProgress(payload));
api.onTaskDone((payload) => {
  if (payload.id !== launchTaskId) return;
  updateLaunchProgress({ ...payload, percent: 100, stage: '游戏已启动' });
  clearTimeout(launchHideTimer);
  launchHideTimer = setTimeout(hideLaunchProgress, 900);
});
api.onTaskError((payload) => {
  if (payload.id === launchTaskId) hideLaunchProgress();
});

ctx.showLaunchProgress = showLaunchProgress;

api.onBootstrapChanged?.(async () => {
  try {
    const data = await api.getBootstrap();
    applyBootstrap(data);
    if (currentRoute === 'skins' || currentRoute === 'home') await renderRoute(currentRoute, { force: true });
    if (currentRoute === 'settings' && document.querySelector('#settings-eggs')) await renderRoute('settings', { force: true });
  } catch {
    // 后台皮肤刷新失败不影响当前页面
  }
});

function commandActions() {
  const pages = [
    ['home', '首页', '总览与最近游玩', 'home'],
    ['news', '新闻', '版本与活动', 'file-text'],
    ['ai', 'AI 助手', '自然语言找包与规划', 'sparkles'],
    ['multiplayer', '联机', '房间号与自动开服', 'globe'],
    ['versions', '游戏库', '实例与版本', 'layers'],
    ['resources', '资源中心', '整合包与 Mod', 'compass'],
    ['skins', '皮肤工坊', '正版皮肤与预览', 'shirt'],
    ['settings', '设置', '账户、Java、更新', 'settings'],
  ];
  const actions = pages.map(([route, label, hint, iconName]) => ({
    label, hint, iconName, section: '页面', run: () => navigate(route),
  }));
  actions.push(
    { label: '安装新版本', hint: '下载 Minecraft 或整合包', iconName: 'download', section: '操作', run: () => ctx.openLatestInstall() },
    { label: '检查更新', hint: '查看 TYCL 新版本', iconName: 'megaphone', section: '操作', run: () => ctx.openUpdates() },
    { label: '账户', hint: '登录、切换或离线账户', iconName: 'user', section: '操作', run: () => ctx.openAccount() },
  );
  for (const instance of state.instances) {
    actions.push({
      label: instance.name,
      hint: `${instance.baseVersion} · ${instance.loaderLabel || '原版'} · 打开实例管理`,
      iconName: 'box',
      section: '实例',
      run: () => ctx.openInstanceManager(instance),
    });
  }
  return actions;
}

let commandItems = [];
let commandActive = 0;

function closeCommandPalette() {
  const root = document.getElementById('command-palette');
  if (!root || root.hidden) return;
  root.hidden = true;
  document.getElementById('command-input').value = '';
}

function renderCommandResults(query = '') {
  const results = document.getElementById('command-results');
  if (!results) return;
  const needle = query.trim().toLowerCase();
  const all = commandActions();
  commandItems = needle
    ? all.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(needle))
    : all;
  commandActive = Math.min(commandActive, Math.max(0, commandItems.length - 1));
  if (!commandItems.length) {
    results.innerHTML = `<div class="manager-empty">没有找到“${escapeHtml(query)}”</div>`;
    return;
  }
  let lastSection = '';
  results.innerHTML = commandItems.map((item, index) => {
    const header = item.section !== lastSection ? `<div class="command-section">${escapeHtml(item.section)}</div>` : '';
    lastSection = item.section;
    return `${header}<button class="command-item ${index === commandActive ? 'active' : ''}" data-command-index="${index}">
      <span class="command-icon">${icon(item.iconName, 13)}</span>
      <span><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.hint)}</span></span>
    </button>`;
  }).join('');
  results.querySelectorAll('[data-command-index]').forEach((button) => {
    button.addEventListener('click', () => runCommand(Number(button.dataset.commandIndex)));
  });
}

function runCommand(index) {
  const item = commandItems[index];
  if (!item) return;
  closeCommandPalette();
  item.run();
}

function openCommandPalette() {
  const root = document.getElementById('command-palette');
  if (!root) return;
  root.hidden = false;
  commandActive = 0;
  renderCommandResults('');
  const input = document.getElementById('command-input');
  input.value = '';
  input.focus();
}

function setupCommandPalette() {
  const root = document.getElementById('command-palette');
  const input = document.getElementById('command-input');
  if (!root || !input) return;
  document.getElementById('command-trigger')?.addEventListener('click', openCommandPalette);
  root.querySelector('[data-command-close]')?.addEventListener('click', closeCommandPalette);
  input.addEventListener('input', () => { commandActive = 0; renderCommandResults(input.value); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closeCommandPalette(); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); commandActive = Math.min(commandItems.length - 1, commandActive + 1); renderCommandResults(input.value); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); commandActive = Math.max(0, commandActive - 1); renderCommandResults(input.value); return; }
    if (event.key === 'Enter') { event.preventDefault(); runCommand(commandActive); }
  });
}


async function openAiDrawer() {
  if (document.querySelector('.ai-drawer')) return;
  const root = document.createElement('div');
  root.className = 'ai-drawer';
  root.innerHTML = `<div class="ai-drawer-panel"><button class="ai-drawer-close" aria-label="关闭 AI">×</button><div class="ai-drawer-content"></div></div>`;
  document.body.appendChild(root);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.classList.remove('open');
    root.classList.add('closing');
    setTimeout(() => root.remove(), 220);
  };
  root.querySelector('.ai-drawer-close').addEventListener('click', close);
  root.addEventListener('click', (event) => { if (event.target === root) close(); });
  const onKey = (event) => {
    if (event.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
  const drawerCtx = {
    ...ctx,
    navigate: (...args) => { close(); return ctx.navigate(...args); },
    openProject: (...args) => { close(); return ctx.openProject(...args); },
    openDiagnostics: (...args) => { close(); return ctx.openDiagnostics(...args); },
    openInstanceManager: (...args) => { close(); return ctx.openInstanceManager(...args); },
  };
  requestAnimationFrame(() => root.classList.add('open'));
  await aiPage.render(root.querySelector('.ai-drawer-content'), drawerCtx);
}

function setupChrome() {
  setupCommandPalette();
  document.getElementById('chrome-ai')?.addEventListener('click', () => openAiDrawer());
  const messagesButton = document.getElementById('chrome-messages');
  if (messagesButton) messagesButton.onclick = () => openMessageCenter(ctx);
  document.getElementById('quick-theme')?.addEventListener('click', () => {
    const actual = resolveTheme(state.settings.theme);
    ctx.setTheme(actual === 'dark' ? 'light' : 'dark');
  });
  document.getElementById('chrome-updates')?.addEventListener('click', () => ctx.openUpdates());
  document.getElementById('chrome-queue')?.addEventListener('click', openDownloadQueue);
  document.getElementById('chrome-help')?.addEventListener('click', () => ctx.openAbout());
  document.getElementById('win-min')?.addEventListener('click', () => api.minimize?.());
  document.getElementById('win-max')?.addEventListener('click', async () => {
    const maximized = await api.toggleMaximize?.();
    updateWindowIcon(Boolean(maximized));
  });
  document.getElementById('win-close')?.addEventListener('click', () => api.closeWindow?.());
  document.getElementById('chrome-drag')?.addEventListener('dblclick', async () => {
    const maximized = await api.toggleMaximize?.();
    updateWindowIcon(Boolean(maximized));
  });
  document.getElementById('open-folder-nav')?.addEventListener('click', () => {
    if (state.settings.gameDir) api.openPath(state.settings.gameDir);
  });
  document.getElementById('player-card')?.addEventListener('click', () => ctx.openAccount());
  navItems.forEach((item) => {
    item.addEventListener('click', () => navigate(item.dataset.route));
  });
  api.onWindowMaximized?.((maximized) => updateWindowIcon(Boolean(maximized)));
  window.addEventListener('popstate', () => {
    const route = (location.hash || '#home').slice(1);
    renderRoute(PAGES[route] ? route : 'home', { force: true });
  });

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      const root = document.getElementById('command-palette');
      if (root && !root.hidden) closeCommandPalette();
      else openCommandPalette();
      return;
    }
    if (event.ctrlKey && !event.shiftKey && !event.altKey) {
      const routes = { '1': 'home', '2': 'versions', '3': 'resources', '4': 'skins', '5': 'settings' };
      if (routes[event.key]) {
        event.preventDefault();
        navigate(routes[event.key]);
      }
      if (event.key === ',') {
        event.preventDefault();
        navigate('settings');
      }
    }
  });

  document.addEventListener('click', (event) => {
    const routeButton = event.target.closest('[data-route]');
    if (routeButton && !routeButton.classList.contains('nav-item')) {
      event.preventDefault();
      navigate(routeButton.dataset.route);
    }
  });
}

function updateWindowIcon(maximized) {
  const button = document.getElementById('win-max');
  if (button) button.innerHTML = icon(maximized ? 'restore' : 'maximize', 14);
}

function setupThemeWatcher() {
  if (!window.matchMedia) return;
  themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (state.settings.theme === 'system') {
      applyThemeDom('system', state.settings.accent);
      updateQuickThemeIcon();
    }
  };
  if (themeMedia.addEventListener) themeMedia.addEventListener('change', onChange);
  else themeMedia.addListener?.(onChange);
}

function showVersionWelcome() {
  const version = state.system?.appVersion;
  if (!version) return;
  const seen = safeLocalGet('tycl.seenVersion');
  if (!seen) {
    safeLocalSet('tycl.seenVersion', version);
    return;
  }
  if (seen === version) return;
  safeLocalSet('tycl.seenVersion', version);
  setTimeout(() => {
    if (document.querySelector('#modal-root .modal')) return;
    ctx.openUpdates();
  }, 900);
}

/* ---------- Task dock ---------- */
const TASK_ICONS = { install: 'cloud-download', mod: 'package', modpack: 'package', launch: 'play' };
const TASK_LABELS = { install: '安装游戏', mod: '安装 Mod', modpack: '安装整合包', launch: '启动游戏' };
const TASK_STATUS = { running: '进行中', paused: '已暂停', done: '已完成', error: '失败' };
let queueModal = null;

function activeTaskCount() {
  return Array.from(taskCards.values()).filter((card) => ['running', 'paused'].includes(card.payload.status || 'running')).length;
}

function updateQueueBadge() {
  const badge = document.getElementById('queue-dot');
  if (!badge) return;
  const count = activeTaskCount();
  badge.hidden = count === 0;
  badge.textContent = count > 9 ? '9+' : String(count);
}

function queueMarkup() {
  const cards = Array.from(taskCards.values());
  if (!cards.length) {
    return `<div class="queue-empty">${icon('download', 26)}<strong>下载队列是空的</strong><span>安装游戏、Mod 或整合包后，任务会显示在这里。</span></div>`;
  }
  return cards
    .map((card) => {
      const task = card.payload;
      const status = task.status || 'running';
      const percent = Math.max(0, Math.min(100, Number(task.percent) || 0));
      return `<div class="queue-item ${status}">
        <div class="queue-icon">${icon(TASK_ICONS[task.kind] || 'download', 15)}</div>
        <div class="queue-main">
          <div class="queue-head">
            <strong>${escapeHtml(task.title || TASK_LABELS[task.kind] || '任务')}</strong>
            <span class="queue-state">${TASK_STATUS[status] || '进行中'}${status === 'running' ? ` · ${Math.round(percent)}%` : ''}</span>
          </div>
          <div class="queue-stage">${escapeHtml(task.stage || '准备中')}${task.detail ? ` · ${escapeHtml(task.detail)}` : ''}</div>
          <div class="progress queue-progress"><div class="progress-fill" style="width:${status === 'done' ? 100 : percent}%"></div></div>
        </div>
        ${
          status === 'running'
            ? `<div class="queue-controls"><button class="queue-icon-btn" data-queue-pause="${escapeHtml(task.id)}" title="暂停任务">${icon('pause', 12)}</button><button class="queue-cancel" data-queue-cancel="${escapeHtml(task.id)}" title="取消任务">${icon('close', 12)}</button></div>`
            : status === 'paused'
              ? `<div class="queue-controls"><button class="queue-icon-btn resume" data-queue-resume="${escapeHtml(task.id)}" title="继续任务">${icon('play', 12)}</button><button class="queue-cancel" data-queue-cancel="${escapeHtml(task.id)}" title="取消任务">${icon('close', 12)}</button></div>`
              : `<span class="queue-check">${icon(status === 'done' ? 'check' : 'alert-triangle', 14)}</span>`
        }
      </div>`;
    })
    .join('');
}

function bindQueueControls(body) {
  body.querySelectorAll('[data-queue-cancel]').forEach((button) => {
    button.addEventListener('click', () => {
      button.disabled = true;
      api.cancelTask?.(button.dataset.queueCancel);
    });
  });
  body.querySelectorAll('[data-queue-pause]').forEach((button) => {
    button.addEventListener('click', () => {
      button.disabled = true;
      api.pauseTask?.(button.dataset.queuePause);
    });
  });
  body.querySelectorAll('[data-queue-resume]').forEach((button) => {
    button.addEventListener('click', () => {
      button.disabled = true;
      api.resumeTask?.(button.dataset.queueResume);
    });
  });
}

function refreshQueue() {
  updateQueueBadge();
  if (!queueModal) return;
  const body = queueModal.body;
  body.innerHTML = `<div class="queue-list">${queueMarkup()}</div>`;
  bindQueueControls(body);
}

function openDownloadQueue() {
  if (queueModal) {
    queueModal.close();
    return;
  }
  queueModal = openModal({
    title: '下载队列',
    subtitle: '安装、Mod、整合包与启动任务',
    size: 'modal-md',
    body: `<div class="queue-list">${queueMarkup()}</div>`,
    footer: `<button class="btn btn-secondary btn-sm" data-modal-close>关闭</button>`,
    onClose: () => {
      queueModal = null;
    },
  });
  bindQueueControls(queueModal.body);
}

function ensureTaskCard(payload) {
  let card = taskCards.get(payload.id);
  if (card) return card;
  const el = document.createElement('div');
  el.className = 'task-card';
  el.dataset.task = payload.id;
  el.innerHTML = `
    <div class="task-top">
      <div class="task-spinner">${icon(TASK_ICONS[payload.kind] || 'download', 16)}</div>
      <div class="task-info">
        <div class="task-title">${escapeHtml(payload.title || TASK_LABELS[payload.kind] || '任务')}</div>
        <div class="task-stage">${escapeHtml(payload.stage || '准备中')}</div>
      </div>
      <span class="task-pct">0%</span>
      <button class="task-cancel" data-task-cancel="${escapeHtml(payload.id)}" title="取消">${icon('close', 12)}</button>
    </div>
    <div class="progress"><div class="progress-fill" style="width:0%"></div></div>
  `;
  taskRoot.appendChild(el);
  card = { el, payload: { ...payload, status: 'running' } };
  taskCards.set(payload.id, card);
  updateQueueBadge();
  return card;
}

function updateTaskCard(payload) {
  const card = ensureTaskCard(payload);
  card.payload = { ...card.payload, ...payload, status: 'running' };
  card.el.classList.remove('paused');
  const percent = Math.max(0, Math.min(100, payload.percent || 0));
  const stage = card.el.querySelector('.task-stage');
  const pct = card.el.querySelector('.task-pct');
  const fill = card.el.querySelector('.progress-fill');
  if (stage) stage.textContent = payload.stage || '处理中';
  if (pct) pct.textContent = `${Math.round(percent)}%`;
  if (fill) fill.style.width = `${percent}%`;
  refreshQueue();
}

function finishTaskCard(id, stateName = 'done', message = '') {
  const card = taskCards.get(id);
  if (!card) return;
  card.payload.status = stateName;
  const percentEl = card.el.querySelector('.task-pct');
  const fill = card.el.querySelector('.progress-fill');
  const cancel = card.el.querySelector('.task-cancel');
  const spinner = card.el.querySelector('.task-spinner');
  if (percentEl) percentEl.textContent = stateName === 'done' ? '100%' : '';
  if (fill) fill.style.width = stateName === 'done' ? '100%' : fill.style.width;
  if (cancel) cancel.remove();
  if (spinner) {
    spinner.innerHTML = icon(stateName === 'done' ? 'check' : 'alert-triangle', 16);
    spinner.style.color = stateName === 'done' ? 'var(--accent-strong)' : '#c43a48';
    spinner.style.background = stateName === 'done' ? 'var(--accent-soft)' : '#fdecee';
  }
  const stage = card.el.querySelector('.task-stage');
  if (stage && message) stage.textContent = message;
  refreshQueue();
  setTimeout(() => {
    card.el.style.transition = 'opacity .25s ease, transform .25s ease';
    card.el.style.opacity = '0';
    card.el.style.transform = 'translateY(6px)';
    setTimeout(() => {
      card.el.remove();
      taskCards.delete(id);
      refreshQueue();
    }, 260);
  }, stateName === 'done' ? 2200 : 5000);
}

taskRoot.addEventListener('click', (event) => {
  const button = event.target.closest('[data-task-cancel]');
  if (button) {
    button.disabled = true;
    button.innerHTML = '<span class="spinner" style="width:11px;height:11px"></span>';
    api.cancelTask?.(button.dataset.taskCancel);
  }
});

async function refreshAfterTask() {
  try {
    const data = await api.getBootstrap();
    applyBootstrap(data);
    setSidebarActive(currentRoute);
    if (['home', 'versions'].includes(currentRoute)) {
      await renderRoute(currentRoute, { force: true });
    }
  } catch {
    // 后台刷新失败不打扰用户
  }
}

function setupTaskEvents() {
  api.onTaskProgress(updateTaskCard);
  api.onTaskDone(async (payload) => {
    const kind = payload.kind;
    finishTaskCard(payload.id, 'done', '已完成');
    if (kind === 'ai') {
      toast({ title: 'AI 准备完成', message: payload.result?.room ? '房间已开好' : payload.result?.warning || '整合包已安装', duration: 6000 });
      if (payload.result?.room) {
        await refreshAfterTask();
        navigate('multiplayer');
      }
    } else if (kind === 'install') {
      toast({ title: '游戏安装完成', message: payload.result?.instance?.name || '新的实例已加入游戏库' });
      await refreshAfterTask();
    } else if (kind === 'modpack') {
      const warnings = payload.result?.warningCount;
      toast({
        title: '整合包安装完成',
        message: warnings ? `已创建实例，但有 ${warnings} 个文件下载失败，请查看日志` : payload.result?.instance?.name || '新的整合包实例已创建',
        type: warnings ? 'info' : 'success',
      });
      await refreshAfterTask();
    } else if (kind === 'mod') {
      toast({ title: 'Mod 安装完成', message: payload.result?.project || '文件已写入实例的 mods 目录' });
      await refreshAfterTask();
    } else if (kind === 'launch') {
      // 游戏启动状态由 game:status 事件提示
      await refreshAfterTask();
    }
  });
  api.onTaskError((payload) => {
    finishTaskCard(payload.id, 'error', payload.error || '发生错误');
    toast({
      title: '任务失败',
      message: payload.error || '请检查网络或 Java 设置后重试',
      type: 'error',
      duration: 6000,
    });
  });
  api.onTaskCancelled((payload) => {
    finishTaskCard(payload.id, 'error', '已取消');
    toast({ title: '任务已取消', message: payload.title || '', type: 'info' });
  });
  api.onTaskPaused?.((payload) => {
    const card = taskCards.get(payload.id);
    if (card) {
      card.payload.status = 'paused';
      card.payload.stage = '已暂停';
      card.el.classList.add('paused');
      const stage = card.el.querySelector('.task-stage');
      if (stage) stage.textContent = '已暂停';
      refreshQueue();
    }
    toast({ title: '任务已暂停', message: payload.title || '', type: 'info' });
  });
}

async function openCrashAssistant(instance, payload = {}) {
  if (!instance) return;
  const modal = openModal({
    title: '游戏异常退出',
    subtitle: instance.name,
    size: 'modal-lg',
    body: `<div class="loading-block"><span class="spinner"></span> 正在读取日志、Mod 和 Java 环境…</div>`,
    footer: `<button class="btn btn-secondary btn-sm" data-crash-diag>${icon('activity', 13)} 完整诊断</button><button class="btn btn-primary btn-sm" data-crash-fix>${icon('sparkles', 13)} 帮我解决</button>`,
  });
  const body = modal.body;
  try {
    const data = await api.analyzeCrash(instance.id);
    const findings = data.findings || [];
    body.innerHTML = `
      <div class="notice warn">${icon('alert-triangle', 15)}<span>${escapeHtml(data.summary || '游戏没有正常启动或异常退出。')}${payload.code ? ` 退出码 ${escapeHtml(String(payload.code))}` : ''}</span></div>
      <div class="manager-section-title" style="margin-top:12px">可能原因</div>
      <div class="diag-checks">${findings.map((item) => `<div class="diag-check warn"><span class="diag-dot"></span><div><strong>${escapeHtml(item)}</strong></div></div>`).join('')}</div>
      <div class="notice" style="margin-top:10px">${icon('info', 14)}<span>「帮我解决」只处理能确定的安全项：内存不足、Java 版本错误、重复 Mod。不会删除存档，不会保证所有崩溃都能自动修复。</span></div>
      <div data-crash-result></div>
    `;
  } catch (error) {
    body.innerHTML = `<div class="notice warn">${icon('alert-triangle', 14)}<span>分析失败：${escapeHtml(error.message)}</span></div>`;
  }
  body.querySelector('[data-crash-diag]')?.addEventListener('click', () => { modal.close?.(); ctx.openDiagnostics(instance, { crash: true }); });
  body.querySelector('[data-crash-fix]')?.addEventListener('click', async () => {
    const resultBox = body.querySelector('[data-crash-result]');
    const button = body.querySelector('[data-crash-fix]');
    if (button) button.disabled = true;
    resultBox.innerHTML = `<div class="loading-block"><span class="spinner"></span> 正在尝试安全修复…</div>`;
    try {
      const result = await api.fixCrash(instance.id);
      const lines = [
        ...(result.fixed || []).map((item) => `已处理：${item}`),
        ...(result.manual || []).map((item) => `需要手动：${item}`),
      ];
      resultBox.innerHTML = `<div class="notice ${result.fixed?.length ? '' : 'warn'}">${icon(result.fixed?.length ? 'check' : 'info', 14)}<span>${lines.map(escapeHtml).join('<br>') || '没有可自动处理的项。'}</span></div>`;
      await refreshAfterTask();
    } catch (error) {
      resultBox.innerHTML = `<div class="notice warn">${icon('alert-triangle', 14)}<span>修复失败：${escapeHtml(error.message)}</span></div>`;
    } finally {
      if (button) button.disabled = false;
    }
  });
}

function setupGameEvents() {
  api.onAccountChanged?.((account) => {
    if (account) {
      state.account = account;
      applyPlayerUi();
    }
  });
  api.onUpdateAvailable?.((result) => {
    if (!result || !result.hasUpdate) return;
    openAvailableUpdatePrompt(ctx, result);
  });
  api.onGameStatus(async (payload) => {
    if (!payload || !payload.type) return;
    if (payload.type === 'running') {
      state.activeGame = { instanceId: payload.instanceId, pid: payload.pid, startedAt: Date.now() };
      const instance = state.instances.find((item) => item.id === payload.instanceId);
      toast({ title: '游戏已启动', message: instance ? instance.name : 'Minecraft 正在启动' });
      if (['home', 'versions'].includes(currentRoute)) {
        renderRoute(currentRoute, { force: true });
      }
    } else if (payload.type === 'stopped') {
      state.activeGame = null;
      const seconds = payload.seconds || 0;
      toast({ title: '游戏已退出', message: seconds ? `本次游玩 ${Math.max(1, Math.round(seconds / 60))} 分钟` : '下次见。', type: 'info' });
      if (payload.code && Number(payload.code) !== 0) {
        const instance = state.instances.find((item) => item.id === payload.instanceId);
        setTimeout(() => openCrashAssistant(instance, payload), 500);
      }
      await refreshAfterTask();
    } else if (payload.type === 'error') {
      const instance = state.instances.find((item) => item.id === payload.instanceId) || state.instances[0];
      setTimeout(() => openCrashAssistant(instance, payload), 400);
      toast({ title: '游戏运行出错', message: payload.message || '正在读取日志', type: 'error', duration: 6000 });
    }
  });
}

async function enforceDisclaimer() {
  await api.setDisclaimerPending?.(true);
  return new Promise((resolve) => {
    appEl.innerHTML = `
      <div class="disclaimer-gate">
        <div class="disclaimer-card">
          <div class="disclaimer-brand">${icon('shield', 22)}<strong>TYCL · 使用前请阅读</strong></div>
          <h1>免责声明</h1>
          <div class="disclaimer-text">
            <p>TYCL 是非官方 Minecraft 启动器，与 Mojang、Microsoft、Modrinth、CurseForge 无隶属关系。</p>
            <p>AI 只负责解析需求、检索公开来源和给出建议，不保证第三方 Mod、整合包、资源包、光影、服务器文件的完整性、合法性或安全性。</p>
            <p>自动检索、下载、更新和安装可能修改实例文件。请先备份存档；因使用第三方资源、自动更新或误操作造成的存档损坏、账号问题、版权纠纷或其他损失，由用户自行承担。</p>
            <p>TYCL 不绕过正版验证，不重新分发付费内容，不提供盗版资源。请支持正版 Minecraft 和支持作者。</p>
            <p>继续使用即表示你已理解并同意以上内容。</p>
          </div>
          <label class="disclaimer-check"><input type="checkbox" data-disclaimer-accept> 我已阅读并同意以上内容，且永久不再显示</label>
          <div class="disclaimer-actions">
            <button class="btn btn-danger" data-disclaimer-decline>不同意并退出</button>
            <button class="btn btn-primary" data-disclaimer-agree disabled>同意并进入</button>
          </div>
        </div>
      </div>
    `;
    hydrateIcons();
    const checkbox = appEl.querySelector('[data-disclaimer-accept]');
    const agree = appEl.querySelector('[data-disclaimer-agree]');
    checkbox.addEventListener('change', () => { agree.disabled = !checkbox.checked; });
    agree.addEventListener('click', async () => {
      if (!checkbox.checked) return;
      agree.disabled = true;
      try {
        await api.saveSettings({ disclaimerAccepted: true });
        state.settings.disclaimerAccepted = true;
        await api.setDisclaimerPending?.(false);
        resolve(true);
      } catch (error) {
        agree.disabled = false;
        await confirmDialog({ title: '保存失败', message: error.message, confirmText: '知道了' });
      }
    });
    appEl.querySelector('[data-disclaimer-decline]').addEventListener('click', async () => {
      await api.setDisclaimerPending?.(false);
      await api.quitApp?.();
      resolve(false);
    });
  });
}

async function showOnboarding() {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding';
  overlay.innerHTML = `
    <div class="onboarding-shell">
      <aside class="onboarding-rail">
        <div class="onboarding-brand"><img src="./assets/icon-128.png" alt=""><div><strong>TYCL</strong><span>FIRST LIGHT</span></div></div>
        <div class="onboarding-steps">
          <button class="onboarding-step active" data-onboarding-step="0"><b>01</b><span>欢迎</span></button>
          <button class="onboarding-step" data-onboarding-step="1"><b>02</b><span>游戏目录</span></button>
          <button class="onboarding-step" data-onboarding-step="2"><b>03</b><span>联机组件</span></button>
          <button class="onboarding-step" data-onboarding-step="3"><b>04</b><span>准备完成</span></button>
        </div>
        <div class="onboarding-rail-foot">TYCL 2.3 · 你的世界，下一次点击</div>
      </aside>
      <main class="onboarding-main">
        <button class="onboarding-skip" data-onboarding-skip>跳过引导</button>
        <div class="onboarding-progress"><span data-onboarding-bar></span></div>

        <section class="onboarding-slide active" data-onboarding-slide="0">
          <div class="onboarding-visual welcome-visual"><img class="onboarding-hero" src="./assets/hero-island.svg" alt=""><div class="onboarding-orbit one">${icon('cube', 18)}</div><div class="onboarding-orbit two">${icon('sparkles', 16)}</div></div>
          <div class="onboarding-copy"><span class="onboarding-kicker">WELCOME TO TYCL</span><h1>你的世界，<br><em>下一次点击。</em></h1><p>一个干净、能装 Mod、能联机、能问 AI 的 Minecraft 启动器。先用一分钟把它调成你的样子。</p><div class="onboarding-chips"><span>${icon('box', 12)} 实例隔离</span><span>${icon('globe', 12)} 一键联机</span><span>${icon('sparkles', 12)} AI 助手</span></div></div>
        </section>

        <section class="onboarding-slide" data-onboarding-slide="1">
          <div class="onboarding-visual folder-visual">${icon('folder', 54)}<div class="onboarding-folder-card"><span>GAME DIRECTORY</span><strong data-onboarding-path>${escapeHtml(state.settings.gameDir || '默认目录')}</strong></div></div>
          <div class="onboarding-copy"><span class="onboarding-kicker">STEP 02 · STORAGE</span><h1>游戏放在哪里？</h1><p>实例、存档、Mod 和下载都会放在这个目录。建议选一个空间充足的磁盘；以后也能在设置里修改。</p><div class="onboarding-actions"><button class="btn btn-primary" data-onboarding-choose>${icon('folder', 14)} 选择目录</button><span class="field-hint">默认目录适合大多数人</span></div></div>
        </section>

        <section class="onboarding-slide" data-onboarding-slide="2">
          <div class="onboarding-visual network-visual">${icon('globe', 54)}<div class="onboarding-network-card" data-onboarding-bore-status>${icon('activity', 16)} 正在检查联机组件…</div></div>
          <div class="onboarding-copy"><span class="onboarding-kicker">STEP 03 · MULTIPLAYER</span><h1>和朋友，进同一个世界。</h1><p>开房需要 bore 联机组件。没下载时只能浏览联机页，不能开房或加入房间；下载一次即可。</p><div class="onboarding-actions" data-onboarding-bore-actions></div></div>
        </section>

        <section class="onboarding-slide" data-onboarding-slide="3">
          <div class="onboarding-visual ready-visual"><img src="./assets/icon-128.png" alt=""><div class="onboarding-ready-ring"></div><div class="onboarding-ready-badge">${icon('check', 18)} READY</div></div>
          <div class="onboarding-copy"><span class="onboarding-kicker">STEP 04 · READY</span><h1>可以开始了。</h1><p>安装一个版本，或者直接问右上角的 AI 助手「想玩轻量、有科技感、能联机的生存整合包」。安装、JVM、开房都可以交给它准备。</p><div class="onboarding-chips"><span>右上角 ✨ AI</span><span>游戏库安装版本</span><span>联机页开房</span></div></div>
        </section>

        <footer class="onboarding-footer">
          <div class="onboarding-dots">${[0, 1, 2, 3].map((index) => `<button data-onboarding-dot="${index}" class="${index === 0 ? 'active' : ''}"></button>`).join('')}</div>
          <div class="onboarding-nav"><button class="btn btn-ghost btn-sm" data-onboarding-back>上一步</button><button class="btn btn-primary btn-sm" data-onboarding-next>下一步 ${icon('arrow-right', 13)}</button></div>
        </footer>
      </main>
    </div>
  `;
  document.body.appendChild(overlay);
  let step = 0;
  let boreReady = null;
  let finishResolve = null;
  const finished = new Promise((resolve) => { finishResolve = resolve; });
  const slides = Array.from(overlay.querySelectorAll('[data-onboarding-slide]'));
  const dots = Array.from(overlay.querySelectorAll('[data-onboarding-dot]'));
  const steps = Array.from(overlay.querySelectorAll('[data-onboarding-step]'));
  const bar = overlay.querySelector('[data-onboarding-bar]');
  const back = overlay.querySelector('[data-onboarding-back]');
  const next = overlay.querySelector('[data-onboarding-next]');

  const finish = async () => {
    try {
      await api.saveSettings({ onboardingDone: true });
      state.settings.onboardingDone = true;
    } catch { /* ignore */ }
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 260);
    finishResolve?.(true);
    return true;
  };

  const render = () => {
    slides.forEach((slide, index) => slide.classList.toggle('active', index === step));
    dots.forEach((dot, index) => dot.classList.toggle('active', index === step));
    steps.forEach((item, index) => item.classList.toggle('active', index === step));
    bar.style.width = `${((step + 1) / 4) * 100}%`;
    back.disabled = step === 0;
    next.innerHTML = step === 3 ? `进入 TYCL ${icon('arrow-right', 13)}` : `下一步 ${icon('arrow-right', 13)}`;
    if (step === 2 && boreReady === null) checkBore();
  };

  const checkBore = async () => {
    const status = overlay.querySelector('[data-onboarding-bore-status]');
    const actions = overlay.querySelector('[data-onboarding-bore-actions]');
    if (!status || !actions) return;
    try {
      const result = await api.checkTunnel();
      boreReady = Boolean(result.installed);
      status.innerHTML = boreReady ? `${icon('check', 16)} bore 已就绪` : `${icon('download', 16)} bore 尚未下载`;
      actions.innerHTML = boreReady
        ? `<span class="field-hint">开房和加入房间已经可用</span>`
        : `<button class="btn btn-primary" data-onboarding-bore>${icon('download', 14)} 下载联机组件</button><span class="field-hint">也可以稍后在联机页下载</span>`;
      actions.querySelector('[data-onboarding-bore]')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.innerHTML = '<span class="spinner" style="width:12px;height:12px"></span> 下载中…';
        try {
          await api.prepareTunnel();
          boreReady = true;
          checkBore();
          toast({ title: '联机组件已下载' });
        } catch (error) {
          button.disabled = false;
          button.innerHTML = '重试下载';
          toast({ title: '下载失败', message: error.message, type: 'error' });
        }
      });
    } catch {
      status.textContent = '检查失败，可以稍后在联机页重试';
    }
  };

  const go = (target) => { step = Math.max(0, Math.min(3, target)); render(); };
  overlay.querySelector('[data-onboarding-next]').addEventListener('click', async () => {
    if (step < 3) go(step + 1);
    else await finish();
  });
  overlay.querySelector('[data-onboarding-back]').addEventListener('click', () => go(step - 1));
  overlay.querySelector('[data-onboarding-skip]').addEventListener('click', finish);
  dots.forEach((dot) => dot.addEventListener('click', () => go(Number(dot.dataset.onboardingDot))));
  steps.forEach((item) => item.addEventListener('click', () => go(Number(item.dataset.onboardingStep))));
  overlay.querySelector('[data-onboarding-choose]').addEventListener('click', async () => {
    const result = await api.chooseDirectory({ title: '选择 TYCL 游戏目录' });
    if (!result || result.canceled || !result.path) return;
    try {
      await api.saveSettings({ gameDir: result.path });
      state.settings.gameDir = result.path;
      overlay.querySelector('[data-onboarding-path]').textContent = result.path;
      toast({ title: '游戏目录已更新' });
    } catch (error) {
      toast({ title: '保存失败', message: error.message, type: 'error' });
    }
  });
  render();
  return finished;
}

async function init() {
  ensureThemeColorMeta();
  appEl.innerHTML = `<div class="app-boot"><div class="app-boot-logo"><img src="./assets/icon-128.png" alt=""></div><span>正在准备你的世界…</span></div>`;
  hydrateIcons();
  setupChrome();
  setupEasterEggs();
  setupThemeWatcher();
  setupTaskEvents();
  setupGameEvents();
  updateWindowIcon(false);
  try {
    const data = await api.getBootstrap();
    applyBootstrap(data);
    if (!state.settings.disclaimerAccepted) {
      const accepted = await enforceDisclaimer();
      if (!accepted) return;
    }
    if (!state.settings.onboardingDone) {
      await showOnboarding();
    }
    const initialRoute = (location.hash || '#home').slice(1);
    currentRoute = '';
    await renderRoute(PAGES[initialRoute] ? initialRoute : 'home', { force: true });
    showVersionWelcome();
    refreshMessages(api)
      .then(() => refreshMessages(api, { notify: true, remote: true }))
      .catch(() => { /* 消息中心不影响启动 */ });
  } catch (error) {
    console.error(error);
    appEl.innerHTML = `<div class="page"><div class="page-error">${icon('alert-triangle', 32)}<strong>TYCL 启动失败</strong><span>${escapeHtml(error.message)}</span><button class="btn btn-secondary btn-sm" data-retry style="margin-top:10px">重新尝试</button></div></div>`;
    appEl.querySelector('[data-retry]')?.addEventListener('click', () => init());
  }
}

init();
