'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const [pid, target, staged, exe, logPath, userData] = process.argv.slice(2);

function writeLog(message) {
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch {
    // ignore
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExit(processId, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      process.kill(processId, 0);
      await sleep(500);
    } catch {
      return true;
    }
  }
  return false;
}

function restartApp() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  const child = spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: 'ignore', windowsHide: true, env });
  child.unref();
}

(async () => {
  const id = Number(pid);
  writeLog(`updater started for pid ${id}`);
  const exited = await waitForExit(id);
  if (!exited) {
    writeLog('timed out waiting for TYCL to exit, aborting');
    process.exit(1);
  }
  await sleep(1500);
  const backup = target + '.bak';
  try {
    if (fs.existsSync(target)) fs.copyFileSync(target, backup);
    fs.copyFileSync(staged, target);
    writeLog('update applied');
    try {
      fs.rmSync(staged, { force: true });
    } catch {
      // ignore
    }
    await sleep(900);
    if (userData) {
      for (const name of ['Cache', 'Code Cache', 'GPUCache', 'DawnCache']) {
        try {
          fs.rmSync(path.join(userData, name), { recursive: true, force: true });
        } catch {
          // cache cleanup is best-effort
        }
      }
      try {
        fs.writeFileSync(path.join(userData, 'tycl-update-restart.flag'), '1', 'utf8');
      } catch {
        // ignore
      }
    }
    restartApp();
    writeLog('restarted TYCL');
  } catch (error) {
    writeLog(`update failed: ${error.message}`);
    try {
      if (fs.existsSync(backup)) fs.copyFileSync(backup, target);
    } catch (restoreError) {
      writeLog(`restore failed: ${restoreError.message}`);
    }
    try {
      restartApp();
    } catch {
      // ignore
    }
  }
  try {
    fs.rmSync(__filename, { force: true });
  } catch {
    // ignore
  }
})();
