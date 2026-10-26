'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const dist = path.join(root, 'dist');
const appDir = path.join(dist, 'TYCL-win32-x64');
const asarFile = path.join(appDir, 'resources', 'app.asar');

if (!fs.existsSync(asarFile)) {
  console.error('没有找到 app.asar，请先运行 npm run package:win');
  process.exit(1);
}

const notes = 'TYCL 更新：启动、联机、资源管理与稳定性修复。';
const channel = process.env.UPDATE_CHANNEL === 'beta' ? 'beta' : 'stable';
const zipName = channel === 'beta' ? `TYCL-beta-${pkg.version}.zip` : `TYCL-update-${pkg.version}.zip`;
const cosBase = String(process.env.TYCL_COS_BASE || 'https://tycl-1327923012.cos.ap-shanghai.myqcloud.com/tycl').replace(/\/+$/, '');
const downloadUrl = `${cosBase}/${zipName}`;

const updateManifest = {
  version: pkg.version,
  channel,
  notes,
  downloadUrl,
  downloadUrls: [downloadUrl],
  sha256: '',
  publishedAt: new Date().toISOString(),
};

const zipPath = path.join(dist, zipName);
const zip = new AdmZip();
zip.addFile('app.asar', fs.readFileSync(asarFile));
zip.addFile('update.json', Buffer.from(JSON.stringify(updateManifest, null, 2), 'utf8'));
zip.writeZip(zipPath);

const sha256 = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
updateManifest.sha256 = sha256;
const manifestName = channel === 'beta' ? 'beta-update.json' : 'update.json';
fs.writeFileSync(path.join(dist, manifestName), JSON.stringify(updateManifest, null, 2), 'utf8');

console.log('已生成更新包：');
console.log('  ' + zipPath);
console.log('  ' + path.join(dist, manifestName));
console.log('SHA-256: ' + sha256);
console.log('清单已经包含 downloadUrl，可直接上传。');
