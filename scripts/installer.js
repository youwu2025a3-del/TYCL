'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const appDir = path.join(root, 'dist', 'TYCL-win32-x64');
const script = path.join(root, 'installer', 'TYCL.iss');

if (!fs.existsSync(path.join(appDir, 'TYCL.exe'))) {
  console.error('没有找到已打包的 TYCL，请先运行 npm run package:win');
  process.exit(1);
}

const candidates = [
  process.env.INNO_SETUP_ISCC,
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
  'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
].filter(Boolean);

const iscc = candidates.find((candidate) => fs.existsSync(candidate));
if (!iscc) {
  console.error('没有找到 Inno Setup 的 ISCC.exe。');
  console.error('安装 Inno Setup 6 后重试：winget install JRSoftware.InnoSetup');
  process.exit(1);
}

const result = spawnSync(iscc, [script], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, TYCL_VERSION: pkg.version },
});

if (result.status !== 0) {
  console.error('安装器编译失败。');
  process.exit(result.status || 1);
}

const output = path.join(root, 'dist', `TYCL-Setup-${pkg.version}.exe`);
if (!fs.existsSync(output)) {
  console.error('安装器没有生成：' + output);
  process.exit(1);
}
console.log('安装器已生成：' + output);
console.log('大小：' + (fs.statSync(output).size / 1024 / 1024).toFixed(1) + ' MB');
