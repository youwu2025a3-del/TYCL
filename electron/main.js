'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { store } = require('./store');
const { TaskManager } = require('./tasks');
const { getSkinState, setActiveSkin, setPlayerProfile, uploadSkin } = require('./skin');
const { listVersions, getLoaders } = require('./versions');
const { installGameTask, installVersionCore } = require('./installer');
const { listInstances, deleteInstance, getInstance } = require('./instances');
const instanceTools = require('./instance-tools');
const { launchInstance, getActiveGame, stopGame, recentLogs } = require('./launcher');
const modrinth = require('./modrinth');
const { detectJava } = require('./java');
const { ensureDir, paths } = require('./paths');
const auth = require('./auth');
const updater = require('./updater');
const news = require('./news');
const translate = require('./translate');
const diagnostics = require('./diagnostics');
const network = require('./network');
const servers = require('./servers');
const tunnel = require('./tunnel');
const lan = require('./lan');
const serverManager = require('./server-manager');

let mainWindow = null;
let loginWindow = null;
let splashWindow = null;
let tasks = null;
let mainReady = false;
let revealScheduled = false;
let splashStartedAt = 0;

const isDev = process.argv.includes('--dev');

function broadcast(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createWindow(options = {}) {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1060,
    minHeight: 700,
    frame: false,
    transparent: false,
    backgroundColor: '#f6f7f9',
    show: Boolean(options.immediate),
    title: 'TYCL',
    icon: path.join(__dirname, '..', 'src', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainReady = true;
    revealMainWindow();
  });
  mainWindow.webContents.once('did-finish-load', () => {
    mainReady = true;
    revealMainWindow();
    const settings = store.getSettings();
    if (settings.autoCheckUpdates && settings.updateFeedUrl) {
      setTimeout(async () => {
        try {
          const result = await updater.checkForUpdates();
          if (result.hasUpdate) broadcast('update:available', result);
        } catch {
          // 自动更新检查失败不打扰启动
        }
      }, 5000);
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  mainWindow.on('maximize', () => broadcast('window:maximized', true));
  mainWindow.on('unmaximize', () => broadcast('window:maximized', false));
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  }, 8000);
}

function createSplashWindow() {
  if (process.argv.includes('--no-splash')) return;
  splashStartedAt = Date.now();
  splashWindow = new BrowserWindow({
    width: 620,
    height: 400,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  splashWindow.loadFile(path.join(__dirname, '..', 'src', 'splash.html'));
  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show();
  });
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
  setTimeout(() => {
    if (!mainReady) revealMainWindow(true);
  }, 5000);
}

function revealMainWindow(force = false) {
  if (!mainWindow || revealScheduled) return;
  if (!mainReady && !force) return;
  revealScheduled = true;
  const minimum = 2600;
  const delay = splashStartedAt ? Math.max(0, minimum - (Date.now() - splashStartedAt)) : 0;
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, delay);
}

function bootstrap() {
  const settings = store.getSettings();
  return {
    settings,
    ...getSkinState(),
    instances: listInstances(),
    activeGame: getActiveGame(),
    account: auth.getPublicState(),
    system: {
      platform: process.platform,
      arch: process.arch,
      totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
      appVersion: app.getVersion(),
      gameDir: settings.gameDir,
      isMaximized: mainWindow ? mainWindow.isMaximized() : false,
      dev: isDev,
    },
  };
}

function normalizeGameDir(input) {
  if (!input || typeof input !== 'string') return store.getSettings().gameDir;
  const resolved = path.resolve(input);
  ensureDir(resolved);
  return resolved;
}

function openMicrosoftLoginWindow() {
  return new Promise((resolve, reject) => {
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.focus();
      reject(new Error('Microsoft 登录窗口已经打开'));
      return;
    }
    let settled = false;
    let finished = false;
    const finish = (error, code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (loginWindow && !loginWindow.isDestroyed()) {
        finished = true;
        loginWindow.close();
      }
      if (error) reject(error);
      else resolve(code);
    };
    const timeout = setTimeout(() => finish(new Error('Microsoft 登录超时，请重试')), 10 * 60 * 1000);
    loginWindow = new BrowserWindow({
      width: 520,
      height: 720,
      parent: mainWindow || undefined,
      modal: Boolean(mainWindow),
      show: false,
      title: '登录 Microsoft',
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: 'persist:tycl-microsoft-login',
        spellcheck: false,
      },
    });
    loginWindow.setMenuBarVisibility(false);
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
    loginWindow.webContents.setUserAgent(userAgent);
    loginWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const checkUrl = (event, url) => {
      if (!url.startsWith(auth.REDIRECT_URI)) return;
      if (event) event.preventDefault();
      try {
        const parsed = new URL(url);
        const error = parsed.searchParams.get('error');
        const description = parsed.searchParams.get('error_description');
        const code = parsed.searchParams.get('code');
        if (error) finish(new Error(description || `Microsoft 登录失败：${error}`));
        else if (code) finish(null, code);
      } catch {
        finish(new Error('无法解析 Microsoft 登录响应'));
      }
    };
    loginWindow.webContents.on('will-redirect', (event, url) => checkUrl(event, url));
    loginWindow.webContents.on('will-navigate', (event, url) => checkUrl(event, url));
    loginWindow.webContents.on('did-navigate', (_event, url) => checkUrl(null, url));
    loginWindow.once('ready-to-show', () => loginWindow.show());
    loginWindow.on('closed', () => {
      loginWindow = null;
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(finished ? 'Microsoft 登录已取消' : 'Microsoft 登录窗口已关闭'));
      }
    });
    loginWindow.loadURL(auth.getAuthUrl()).catch((error) => finish(error));
  });
}

function registerIpc() {
  tasks = new TaskManager(broadcast);

  ipcMain.handle('app:bootstrap', async () => bootstrap());
  ipcMain.handle('app:open-path', async (_, target) => {
    if (!target) return { ok: false };
    const error = await shell.openPath(path.resolve(target));
    return { ok: !error, error };
  });
  ipcMain.handle('app:show-in-folder', async (_, target) => {
    if (target && fs.existsSync(target)) shell.showItemInFolder(path.resolve(target));
    return { ok: true };
  });
  ipcMain.handle('app:open-external', async (_, url) => {
    const allowed = /^https:\/\/([a-z0-9-]+\.)?(modrinth\.com|github\.com|minecraft\.net|fabricmc\.net|quiltmc\.org|minecraftforge\.net|mojang\.com)/i;
    if (!allowed.test(url) && !/^mailto:[^\s]+@[^\s]+\.[^\s]+$/i.test(url)) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('settings:save', async (_, patch) => {
    const current = store.getSettings();
    const next = { ...patch };
    if (typeof next.gameDir === 'string') next.gameDir = normalizeGameDir(next.gameDir);
    if (Array.isArray(next.instances)) delete next.instances;
    if (next.player) {
      next.player = { ...current.player, ...next.player };
    }
    const settings = store.saveSettings(next);
    nativeTheme.themeSource = settings.theme === 'system' ? 'system' : settings.theme;
    return { settings, ...getSkinState(), instances: listInstances() };
  });

  ipcMain.handle('dialog:directory', async (_, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options.title || '选择文件夹',
      defaultPath: options.defaultPath || store.getSettings().gameDir,
      properties: ['openDirectory', 'createDirectory'],
    });
    return { canceled: result.canceled, path: result.filePaths[0] || '' };
  });

  ipcMain.handle('dialog:file', async (_, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options.title || '选择文件',
      defaultPath: options.defaultPath || '',
      filters: options.filters || [{ name: '所有文件', extensions: ['*'] }],
      properties: ['openFile'],
    });
    return { canceled: result.canceled, path: result.filePaths[0] || '' };
  });

  ipcMain.handle('java:detect', async () => {
    const javas = await detectJava({ refresh: true });
    return { javas, settings: store.getSettings() };
  });

  ipcMain.handle('skin:set', async (_, payload) => setActiveSkin(payload));
  ipcMain.handle('skin:upload', async (_, payload) => uploadSkin(payload));
  ipcMain.handle('player:update', async (_, payload) => setPlayerProfile(payload));

  ipcMain.handle('account:microsoft-login', async () => {
    const code = await openMicrosoftLoginWindow();
    const account = await auth.loginWithCode(code);
    broadcast('account:changed', auth.getPublicState());
    return { account: auth.getPublicState(), ...bootstrap() };
  });
  ipcMain.handle('account:logout', async () => {
    const account = auth.logoutMicrosoft();
    broadcast('account:changed', account);
    return { account, ...bootstrap() };
  });
  ipcMain.handle('account:offline', async () => {
    const account = auth.setOfflineMode();
    broadcast('account:changed', account);
    return { account, ...bootstrap() };
  });
  ipcMain.handle('account:cancel-login', async () => {
    if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
    return { ok: true };
  });

  ipcMain.handle('updates:check', async () => updater.checkForUpdates());
  ipcMain.handle('updates:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 TYCL 更新包',
      filters: [
        { name: 'TYCL 更新包', extensions: ['zip', 'tyclupdate'] },
        { name: '应用资源包', extensions: ['asar'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return updater.prepareUpdate(result.filePaths[0]);
  });
  ipcMain.handle('updates:download', async (_, options) => updater.downloadUpdate(options));
  ipcMain.handle('updates:install', async (_, options) => {
    const result = updater.scheduleInstall(options);
    if (result.ok) {
      setTimeout(() => app.quit(), 600);
    }
    return result;
  });
  ipcMain.handle('updates:info', async () => updater.getInfo());

  ipcMain.handle('versions:list', async () => listVersions());
  ipcMain.handle('versions:loaders', async (_, mcVersion) => getLoaders(mcVersion));

  ipcMain.handle('versions:install', async (_, options) => {
    if (!options || !options.mcVersion) throw new Error('缺少游戏版本');
    const loader = ['vanilla', 'fabric', 'forge', 'quilt'].includes(options.loader) ? options.loader : 'vanilla';
    const title = options.loader === 'vanilla'
      ? `安装 Minecraft ${options.mcVersion}`
      : `安装 ${options.mcVersion} · ${options.loader}`;
    return tasks.start({
      kind: 'install',
      title,
      worker: (task) => installGameTask(task, { ...options, loader }),
    });
  });

  ipcMain.handle('instances:launch', async (_, instanceId, options = {}) => {
    const instance = getInstance(instanceId);
    if (!instance) throw new Error('实例不存在');
    return tasks.start({
      kind: 'launch',
      title: options.serverAddress ? `联机 · ${instance.name}` : `启动 ${instance.name}`,
      worker: (task) => launchInstance(instanceId, task, { onStatus: (status) => broadcast('game:status', status), serverAddress: options.serverAddress || '' }),
    });
  });
  ipcMain.handle('servers:list', async () => servers.listServers());
  ipcMain.handle('servers:add', async (_, payload) => servers.addServer(payload));
  ipcMain.handle('servers:remove', async (_, id) => servers.removeServer(id));
  ipcMain.handle('servers:ping', async (_, address) => servers.pingServer(address));
  ipcMain.handle('servers:ping-all', async () => servers.pingAll());
  ipcMain.handle('tunnel:start', async (_, options) => tunnel.startTunnel(options));
  ipcMain.handle('tunnel:stop', async () => tunnel.stopTunnel());
  ipcMain.handle('tunnel:state', async () => tunnel.getTunnelState());
  ipcMain.handle('lan:start', async () => lan.start());
  ipcMain.handle('lan:list', async () => lan.list());
  ipcMain.handle('server:start', async (_, options) => serverManager.startDedicatedServer(options.instanceId, options));
  ipcMain.handle('server:state', async () => serverManager.getServerState());
  ipcMain.handle('server:stop', async () => serverManager.stopDedicatedServer());
  ipcMain.handle('server:force-stop', async () => serverManager.forceStopServer());
  ipcMain.handle('instances:delete', async (_, instanceId) => deleteInstance(instanceId));
  ipcMain.handle('instances:details', async (_, instanceId) => {
    const instance = getInstance(instanceId);
    if (!instance) throw new Error('实例不存在');
    return {
      instance,
      mods: instanceTools.listMods(instanceId),
      worlds: instanceTools.listWorlds(instanceId),
      screenshots: instanceTools.listScreenshots(instanceId),
      backups: instanceTools.listBackups(),
    };
  });
  ipcMain.handle('instances:update-settings', async (_, instanceId, patch) => instanceTools.updateSettings(instanceId, patch));
  ipcMain.handle('instances:mod-toggle', async (_, instanceId, file, enabled) => instanceTools.toggleMod(instanceId, file, enabled));
  ipcMain.handle('instances:mod-delete', async (_, instanceId, file) => instanceTools.deleteMod(instanceId, file));
  ipcMain.handle('instances:mod-updates', async (_, instanceId) => instanceTools.checkModUpdates(instanceId));
  ipcMain.handle('instances:backup-world', async (_, instanceId, worldName) => instanceTools.backupWorld(instanceId, worldName));
  ipcMain.handle('instances:backup', async (_, instanceId) => instanceTools.backupInstance(instanceId));
  ipcMain.handle('backups:list', async () => instanceTools.listBackups());
  ipcMain.handle('instances:export', async (_, instanceId) => {
    const instance = getInstance(instanceId);
    if (!instance) throw new Error('实例不存在');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出 TYCL 实例',
      defaultPath: path.join(app.getPath('documents'), `${instance.name}.tyclinstance.zip`),
      filters: [{ name: 'TYCL 实例备份', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
    return instanceTools.exportInstance(instanceId, result.filePath);
  });
  ipcMain.handle('instances:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入 TYCL 实例',
      properties: ['openFile'],
      filters: [{ name: 'TYCL 实例备份', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true };
    return instanceTools.importArchive(result.filePaths[0]);
  });
  ipcMain.handle('instances:restore-backup', async (_, file) => instanceTools.importArchive(file));
  ipcMain.handle('instances:repair', async (_, instanceId) => {
    const instance = getInstance(instanceId);
    if (!instance) throw new Error('实例不存在');
    return tasks.start({
      kind: 'install',
      title: `修复实例 · ${instance.name}`,
      worker: (task) => installVersionCore(task, { mcVersion: instance.baseVersion, loader: instance.loader, loaderVersion: instance.loaderVersion }),
    });
  });
  ipcMain.handle('instances:update-modpack', async (_, instanceId, versionId) => {
    const instance = getInstance(instanceId);
    if (!instance || !instance.modpack) throw new Error('该实例不是整合包实例');
    return tasks.start({
      kind: 'modpack',
      title: `更新整合包 · ${instance.modpack.title || instance.name}`,
      worker: (task) => modrinth.updateModpackTask(task, { instance, versionId }),
    });
  });
  ipcMain.handle('instances:open-folder', async (_, instanceId) => {
    const instance = getInstance(instanceId);
    if (!instance) throw new Error('实例不存在');
    const error = await shell.openPath(instance.gameDir);
    return { ok: !error, error };
  });
  ipcMain.handle('game:active', async () => getActiveGame());
  ipcMain.handle('game:stop', async () => stopGame());
  ipcMain.handle('game:logs', async () => recentLogs());

  ipcMain.handle('task:cancel', async (_, id) => tasks.cancel(id));
  ipcMain.handle('task:pause', async (_, id) => tasks.pause(id));
  ipcMain.handle('task:resume', async (_, id) => tasks.resume(id));

  ipcMain.handle('resources:search', async (_, options) => modrinth.search(options));
  ipcMain.handle('translate:texts', async (_, texts, target) => translate.translateTexts(texts, target));
  ipcMain.handle('diagnostics:get', async (_, instanceId, options) => diagnostics.getDiagnostics(instanceId, options));
  ipcMain.handle('network:speedtest', async () => network.testSources());
  ipcMain.handle('news:list', async (_, options) => news.getMinecraftNews(options));
  ipcMain.handle('resources:project', async (_, id) => modrinth.getProject(id));
  ipcMain.handle('resources:versions', async (_, id, options) => modrinth.getVersions(id, options));
  ipcMain.handle('resources:install-mod', async (_, options) => {
    return tasks.start({
      kind: 'mod',
      title: `安装 Mod · ${options.title || options.projectId}`,
      worker: (task) => modrinth.installModTask(task, options),
    });
  });
  ipcMain.handle('resources:install-modpack', async (_, options) => {
    return tasks.start({
      kind: 'modpack',
      title: `安装整合包 · ${options.title || options.projectId}`,
      worker: (task) => modrinth.installModpackTask(task, options),
    });
  });

  ipcMain.handle('window:minimize', async () => {
    if (mainWindow) mainWindow.minimize();
  });
  ipcMain.handle('window:toggle-maximize', async () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', async () => {
    if (mainWindow) mainWindow.close();
  });
  ipcMain.handle('window:is-maximized', async () => (mainWindow ? mainWindow.isMaximized() : false));
  ipcMain.handle('theme:native', async (_, source) => {
    nativeTheme.themeSource = ['light', 'dark', 'system'].includes(source) ? source : 'system';
    return nativeTheme.shouldUseDarkColors;
  });
}

function consumeUpdateRestartFlag() {
  try {
    const flag = path.join(app.getPath('userData'), 'tycl-update-restart.flag');
    if (fs.existsSync(flag)) {
      fs.rmSync(flag, { force: true });
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function consumeLegacyUpdateRestart() {
  try {
    const log = path.join(paths.data(), 'updates', 'update.log');
    if (!fs.existsSync(log)) return false;
    const stat = fs.statSync(log);
    if (Date.now() - stat.mtimeMs > 15 * 60 * 1000) return false;
    const text = fs.readFileSync(log, 'utf8');
    if (!/update applied|restarted TYCL/i.test(text)) return false;
    try {
      fs.renameSync(log, `${log}.last-${Date.now()}`);
    } catch {
      fs.rmSync(log, { force: true });
    }
    return true;
  } catch {
    return false;
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    app.setAppUserModelId('com.tycl.launcher');
    nativeTheme.themeSource = store.getSettings().theme;
    registerIpc();
    const skipSplash = process.argv.includes('--no-splash') || consumeUpdateRestartFlag() || consumeLegacyUpdateRestart();
    if (!skipSplash) createSplashWindow();
    createWindow({ immediate: skipSplash });
    if (isDev && mainWindow) mainWindow.webContents.openDevTools({ mode: 'detach' });
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow({ immediate: true });
    });
  });
}

app.on('before-quit', () => {
  if (tasks) tasks.cancelAll();
  try { tunnel.stopTunnel(); } catch { /* ignore */ }
  try { lan.stop(); } catch { /* ignore */ }
  try { serverManager.forceStopServer(); } catch { /* ignore */ }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
