'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');
const { store } = require('./store');
const { paths } = require('./paths');
const { getInstance, gameRoot } = require('./instances');
const { detectJava, requiredJavaMajor } = require('./java');
const { recentLogs } = require('./launcher');

const PATTERNS = [
  { re: /OutOfMemoryError|Java heap space|GC overhead limit exceeded/i, level: 'error', title: '内存不足', detail: '游戏分配的内存不够，或整合包体积过大。请在设置中提高内存，并关闭占用内存的程序。' },
  { re: /UnsupportedClassVersionError|class file version|Unsupported major\.minor/i, level: 'error', title: 'Java 版本不匹配', detail: '当前 Java 版本与游戏或 Mod 不兼容。较新的 Minecraft 通常需要 Java 17 / 21，旧版本可能需要 Java 8。' },
  { re: /Mixin apply failed|MixinTransformerError|mixin.*(failed|error)|InvalidMixinException/i, level: 'error', title: 'Mixin 注入失败', detail: '通常是 Mod 冲突或 Mod 与当前加载器版本不匹配。尝试逐个禁用最近加入的 Mod。' },
  { re: /Missing or unsupported mandatory dependencies|ModResolutionException|Incompatible mod set|Duplicate mods|Mod file .* is duplicate/i, level: 'error', title: 'Mod 依赖或版本冲突', detail: '缺少前置 Mod、重复安装同一个 Mod，或多个 Mod 依赖不同版本。请根据日志中的依赖名称补齐或移除冲突项。' },
  { re: /NoSuchMethodError|NoClassDefFoundError|ClassNotFoundException/i, level: 'error', title: '类或依赖不兼容', detail: '常见于 Mod 与 Minecraft / 加载器版本不匹配。确认所有 Mod 都支持当前游戏版本，并清理旧版本残留。' },
  { re: /GLFW error|Failed to create window|Pixel format|OpenGL|Could not initialize GLX/i, level: 'warn', title: '图形环境初始化失败', detail: '更新显卡驱动，关闭其他占用 GPU 的程序；远程桌面或虚拟机环境可能缺少 OpenGL 支持。' },
  { re: /EXCEPTION_ACCESS_VIOLATION|A fatal error has been detected by the Java Runtime Environment/i, level: 'error', title: 'JVM 或显卡驱动崩溃', detail: '可能是显卡驱动、LWJGL natives 或 Java 版本问题。尝试更换 Java，并检查是否混入了错误架构的 natives。' },
  { re: /Could not find or load main class|Unrecognized option|Could not create the Java Virtual Machine/i, level: 'error', title: '启动参数或 Java 异常', detail: 'Java 无法识别启动参数，或选择的 Java 版本不可用。尝试重新选择 Java 并重新安装实例。' },
  { re: /Failed to download|Download failed|Connection timed out|ETIMEDOUT|ECONNRESET/i, level: 'warn', title: '文件下载失败', detail: '安装过程中有文件下载失败。请检查网络后重新安装，或切换下载源。' },
];

function levelRank(level) {
  return level === 'error' ? 3 : level === 'warn' ? 2 : 1;
}

function readTail(file, limit = 220) {
  try {
    const content = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    return content.slice(-limit).join('\n');
  } catch {
    return '';
  }
}

function findLatestLog(instanceId) {
  try {
    const dir = paths.logs();
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.log') && (!instanceId || name.startsWith(instanceId)))
      .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (!files.length) return null;
    return { file: path.join(dir, files[0].name), name: files[0].name };
  } catch {
    return null;
  }
}

function findLatestCrash(instance) {
  const roots = [];
  if (instance) roots.push(path.join(instance.gameDir, 'crash-reports'));
  roots.push(path.join(gameRoot(), 'crash-reports'));
  const candidates = [];
  for (const root of roots) {
    try {
      for (const name of fs.readdirSync(root)) {
        if (!name.endsWith('.txt')) continue;
        const file = path.join(root, name);
        candidates.push({ file, name, mtime: fs.statSync(file).mtimeMs });
      }
    } catch {
      // ignore
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0] || null;
}

function analyzeText(text) {
  const source = String(text || '');
  return PATTERNS.filter((pattern) => pattern.re.test(source)).map(({ re, ...rest }) => rest);
}

async function getDiagnostics(instanceId, options = {}) {
  const settings = store.getSettings();
  const instance = instanceId ? getInstance(instanceId) : null;
  const checks = [];
  const add = (level, title, detail) => checks.push({ level, title, detail });

  add('ok', 'TYCL 运行正常', `v${app.getVersion()} · ${process.platform} / ${process.arch}`);
  const totalMem = Math.round(os.totalmem() / 1024 / 1024);
  add('ok', '系统内存', `共 ${(totalMem / 1024).toFixed(0)} GB，游戏分配 ${(settings.memoryMb / 1024).toFixed(1)} GB`);

  if (!instance) {
    add('warn', '没有选择实例', '选择一个游戏实例后，可以进行更完整的启动诊断。');
  } else {
    const versionFile = path.join(gameRoot(), 'versions', instance.versionId, `${instance.versionId}.json`);
    if (!fs.existsSync(versionFile)) {
      add('error', '版本文件缺失', `找不到 ${instance.versionId}.json。请重新安装该实例。`);
    } else {
      add('ok', '版本文件完整', `${instance.baseVersion} · ${instance.loaderLabel || instance.loader}`);
    }
    if (!fs.existsSync(instance.gameDir)) {
      add('error', '实例目录缺失', instance.gameDir);
    } else {
      add('ok', '实例目录可用', instance.gameDir);
    }
    if (instance.modsCount > 0) {
      add(instance.modsCount > 250 ? 'warn' : 'ok', 'Mod 数量', `${instance.modsCount} 个 Mod${instance.modsCount > 250 ? '，数量较多，需留意内存与冲突' : ''}`);
    }
    if ((settings.memoryMb || 0) < 2048) {
      add('warn', '内存分配偏低', '建议至少分配 4 GB，尤其是整合包。');
    }
    if ((settings.memoryMb || 0) > totalMem * 0.8) {
      add('warn', '内存分配偏高', '给游戏分配过多内存可能让系统和其他程序卡顿。');
    }
  }

  let javaList = [];
  try {
    const result = await detectJava();
    javaList = Array.isArray(result) ? result : result.javas || [];
  } catch {
    // ignore
  }
  let required = 17;
  if (instance) {
    try {
      const file = path.join(gameRoot(), 'versions', instance.baseVersion, `${instance.baseVersion}.json`);
      const json = JSON.parse(fs.readFileSync(file, 'utf8'));
      required = requiredJavaMajor(instance.baseVersion, json);
    } catch {
      required = requiredJavaMajor(instance?.baseVersion);
    }
  }
  if (!javaList.length) {
    add('error', '没有检测到 Java', '请安装 Java 17 / 21，或在设置中手动指定 java.exe。');
  } else {
    const selected = settings.javaPath ? javaList.find((java) => java.path === settings.javaPath) : null;
    const best = selected || javaList.find((java) => Number(java.major) >= required) || javaList[0];
    add(Number(best.major) >= required ? 'ok' : 'warn', 'Java 运行环境', `Java ${best.major} · ${best.path}`);
    if (selected && Number(selected.major) < required) {
      add('error', 'Java 版本过低', `这个实例建议至少 Java ${required}，当前手动选择的是 Java ${selected.major}。`);
    }
    if (!selected) {
      add('ok', 'Java 自动选择', `未手动指定，将优先匹配 Java ${required} 或更高版本。`);
    }
  }

  const latestLog = findLatestLog(instance?.id);
  const logTail = latestLog ? readTail(latestLog.file) : (options.logFile ? readTail(options.logFile) : '');
  if (!logTail) {
    add('warn', '没有启动日志', '还没有这个实例的启动记录，或日志目录不可访问。');
  }

  const crash = findLatestCrash(instance);
  let crashText = '';
  if (crash) {
    crashText = readTail(crash.file, 140);
    add('warn', '发现崩溃报告', crash.name);
  }

  const findings = analyzeText(`${logTail}\n${crashText}`);
  for (const finding of findings) add(finding.level, finding.title, finding.detail);
  if (options.code && options.code !== 0) {
    add('warn', '游戏异常退出', `退出代码 ${options.code}。可以结合下面的日志和崩溃报告定位。`);
  }

  const overall = checks.reduce((level, check) => (levelRank(check.level) > levelRank(level) ? check.level : level), 'ok');
  return {
    generatedAt: new Date().toISOString(),
    level: overall,
    appVersion: app.getVersion(),
    system: { platform: process.platform, arch: process.arch, totalMemoryMb: totalMem, cpus: os.cpus()?.length || 0 },
    environment: {
      gameDir: settings.gameDir,
      javaPath: settings.javaPath || '',
      javaRequired: required,
      javaList,
      memoryMb: settings.memoryMb,
    },
    instance: instance
      ? {
          id: instance.id,
          name: instance.name,
          baseVersion: instance.baseVersion,
          versionId: instance.versionId,
          loader: instance.loader,
          loaderLabel: instance.loaderLabel,
          gameDir: instance.gameDir,
          modsCount: instance.modsCount,
        }
      : null,
    checks,
    log: { file: latestLog?.file || '', tail: logTail },
    crash: crash ? { file: crash.file, name: crash.name, excerpt: crashText, findings } : null,
    exitCode: options.code || 0,
  };
}

module.exports = { getDiagnostics };
