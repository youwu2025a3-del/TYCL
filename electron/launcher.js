'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('minecraft-launcher-core');
const { store } = require('./store');
const { getInstance, touchInstance, addPlaySeconds } = require('./instances');
const { getVersionJson } = require('./versions');
const { resolveJava } = require('./java');
const { ensureDir, paths } = require('./paths');
const { sanitizeLibraries } = require('./installer');
const auth = require('./auth');

let activeGame = null;

function memoryToMlc(mb, ratio = 1) {
  const value = Math.max(512, Math.round((mb * ratio) / 512) * 512);
  if (value % 1024 === 0) return `${value / 1024}G`;
  return `${value}M`;
}

function createLogFile(instance) {
  const dir = paths.logs();
  ensureDir(dir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${instance.id}-${stamp}.log`);
  return { file, stream: fs.createWriteStream(file, { flags: 'a' }) };
}

// 旧版本或第三方创建的版本 JSON 可能包含其他架构的 natives，
// MCLC 会把这些 jar 一并放进 classpath，导致 LWJGL 加载到错误架构。
function sanitizeInstalledVersionFiles(instance) {
  const root = store.getSettings().gameDir;
  const files = new Set([
    path.join(root, 'versions', instance.baseVersion, `${instance.baseVersion}.json`),
    path.join(root, 'versions', instance.versionId, `${instance.versionId}.json`),
    path.join(root, 'versions', instance.versionId, `${instance.baseVersion}.json`),
  ]);
  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue;
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(data.libraries)) continue;
      const filtered = sanitizeLibraries(data.libraries);
      if (filtered.length !== data.libraries.length) {
        data.libraries = filtered;
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
      }
    } catch {
      // 版本 JSON 清理失败不阻断启动
    }
  }
}

function launchInstance(instanceId, task, { onStatus }) {
  return new Promise(async (resolve, reject) => {
    try {
      if (activeGame) {
        throw new Error('已有游戏正在运行，请先关闭当前游戏');
      }
      const instance = getInstance(instanceId);
      if (!instance) throw new Error('实例不存在');
      if (!instance.installed) throw new Error('游戏文件不完整，请重新安装该实例');
      sanitizeInstalledVersionFiles(instance);
      const settings = store.getSettings();
      task.report({ percent: 5, stage: '验证账户', detail: '' });
      const launchAccount = await auth.resolveLaunchAuth();
      task.report({ percent: 7, stage: '验证账户', detail: `${launchAccount.name} · ${launchAccount.type === 'microsoft' ? 'Microsoft 正版' : '离线'}`, });
      task.report({ percent: 8, stage: '检查 Java', detail: '' });
      const baseJson = await getVersionJson(instance.baseVersion);
      const java = await resolveJava({
        mcVersion: instance.baseVersion,
        versionJson: baseJson,
        explicitPath: instance.javaPath || settings.javaPath || '',
        autoDownload: true,
        onProgress: ({ stage, percent, detail }) => {
          task.report({
            percent: 6 + Math.min(100, percent || 0) * 0.09,
            stage: stage || '准备 Java 运行时',
            detail: detail || '',
          });
        },
      });
      if (java.major < java.required) {
        throw new Error(`当前 Java ${java.major} 低于游戏所需的 Java ${java.required}`);
      }
      task.report({
        percent: 15,
        stage: '准备启动',
        detail: `Java ${java.major} · ${instance.loaderLabel || instance.loader}`,
      });

      const log = createLogFile(instance);
      const launcher = new Client();
      const max = instance.javaMemoryMb || settings.memoryMb || 4096;
      const gameTemp = path.join(instance.gameDir, 'tmp');
      ensureDir(gameTemp);
      const forgeInstaller = instance.forgeInstaller && fs.existsSync(instance.forgeInstaller) ? instance.forgeInstaller : null;
      if (instance.loader === 'forge' && !forgeInstaller) {
        throw new Error('找不到 Forge 安装器，请重新安装该实例');
      }
      const options = {
        authorization: launchAccount.authorization,
        root: settings.gameDir,
        version: {
          number: instance.baseVersion,
          type: 'release',
          ...(instance.loader !== 'forge' && instance.versionId !== instance.baseVersion ? { custom: instance.versionId } : {}),
        },
        ...(forgeInstaller ? { forge: forgeInstaller } : {}),
        memory: { max: memoryToMlc(max), min: memoryToMlc(max, 0.25) },
        javaPath: java.path,
        customArgs: ['-Dfile.encoding=UTF-8', '-Djava.awt.headless=false', `-Djava.io.tmpdir=${gameTemp}`],
        window: { width: 1280, height: 760, fullscreen: false },
        overrides: {
          gameDirectory: instance.gameDir,
          cwd: instance.gameDir,
          assetIndex: instance.baseVersion,
        },
        timeout: 120000,
      };

      let startedAt = Date.now();
      let lastDebug = '';
      const handleLog = (prefix, data) => {
        const line = `[${prefix}] ${String(data).trimEnd()}\n`;
        log.stream.write(line);
        if (prefix === 'debug') lastDebug = String(data).slice(0, 500);
        if (onStatus) onStatus({ type: 'log', instanceId: instance.id, line: String(data) });
      };

      launcher.on('debug', (message) => handleLog('debug', message));
      launcher.on('data', (message) => handleLog('game', message));
      launcher.on('download', (name) => {
        task.report({ percent: Math.min(80, task.percent + 1), stage: '补齐运行文件', detail: name });
      });
      launcher.on('progress', (progress) => {
        try {
          if (progress && progress.total) {
            const ratio = Number(progress.task || 0) / Number(progress.total || 1);
            task.report({
              percent: 20 + Math.max(0, Math.min(1, ratio)) * 60,
              stage: '校验游戏文件',
              detail: `${progress.type || ''} ${progress.task || 0}/${progress.total}`.trim(),
            });
          }
        } catch {
          // 忽略进度格式差异
        }
      });
      launcher.on('close', (code) => {
        const seconds = Math.round((Date.now() - startedAt) / 1000);
        addPlaySeconds(instance.id, seconds);
        activeGame = null;
        log.stream.end();
        if (onStatus) onStatus({ type: 'stopped', instanceId: instance.id, code, seconds });
      });

      task.report({ percent: 25, stage: '启动游戏', detail: '正在构建启动参数' });
      const child = await launcher.launch(options);
      if (!child) throw new Error(lastDebug ? `游戏进程启动失败：${lastDebug}` : '游戏进程启动失败，请检查启动日志与 Java 版本');
      activeGame = { instanceId: instance.id, child, startedAt };
      startedAt = Date.now();
      touchInstance(instance.id);
      task.report({ percent: 100, stage: '游戏已启动', detail: `PID ${child.pid}` }, true);
      if (onStatus) onStatus({ type: 'running', instanceId: instance.id, pid: child.pid, java: java.path });
      child.on('error', (error) => {
        if (onStatus) onStatus({ type: 'error', instanceId: instance.id, message: error.message });
      });
      resolve({ pid: child.pid, instanceId: instance.id });
    } catch (error) {
      activeGame = null;
      if (onStatus) onStatus({ type: 'error', instanceId, message: error.message });
      reject(error);
    }
  });
}

function getActiveGame() {
  return activeGame ? { instanceId: activeGame.instanceId, pid: activeGame.child.pid, startedAt: activeGame.startedAt } : null;
}

function isGameRunning(instanceId) {
  return Boolean(activeGame && (!instanceId || activeGame.instanceId === instanceId));
}

function stopGame() {
  if (!activeGame) return { ok: false };
  try {
    activeGame.child.kill();
  } catch {
    // ignore
  }
  return { ok: true };
}

function recentLogs(limit = 200) {
  try {
    const dir = paths.logs();
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.log'))
      .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (!files.length) return { file: '', lines: [] };
    const file = path.join(dir, files[0].name);
    const content = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    return { file, lines: content.slice(-limit) };
  } catch {
    return { file: '', lines: [] };
  }
}

module.exports = {
  launchInstance,
  getActiveGame,
  isGameRunning,
  stopGame,
  recentLogs,
  memoryToMlc,
};
