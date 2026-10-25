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
import * as homePage from './pages/home.js';
import * as newsPage from './pages/news.js';
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
  versions: { label: '游戏库', title: '游戏库' },
  resources: { label: '资源中心', title: '资源中心' },
  skins: { label: '皮肤工坊', title: '皮肤工坊' },
  settings: { label: '设置', title: '设置' },
};

const PAGES = {
  home: homePage,
  news: newsPage,
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

function setupChrome() {
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
    if (kind === 'install') {
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
        setTimeout(() => openDiagnosticsModal(ctx, instance, { code: payload.code, crash: true }), 700);
      }
      await refreshAfterTask();
    } else if (payload.type === 'error') {
      toast({ title: '游戏运行出错', message: payload.message || '请查看启动日志', type: 'error', duration: 6000 });
    }
  });
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
    const initialRoute = (location.hash || '#home').slice(1);
    currentRoute = '';
    await renderRoute(PAGES[initialRoute] ? initialRoute : 'home', { force: true });
    showVersionWelcome();
  } catch (error) {
    console.error(error);
    appEl.innerHTML = `<div class="page"><div class="page-error">${icon('alert-triangle', 32)}<strong>TYCL 启动失败</strong><span>${escapeHtml(error.message)}</span><button class="btn btn-secondary btn-sm" data-retry style="margin-top:10px">重新尝试</button></div></div>`;
    appEl.querySelector('[data-retry]')?.addEventListener('click', () => init());
  }
}

init();
