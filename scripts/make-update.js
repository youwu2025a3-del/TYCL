'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const dist = path.join(root, 'dist');
const appDir = path.join(dist, `TYCL-win32-x64`);
const asarFile = path.join(appDir, 'resources', 'app.asar');

if (!fs.existsSync(asarFile)) {
  console.error('没有找到 app.asar，请先运行 npm run package:win');
  process.exit(1);
}

const notes =
  '本次更新：修复 Microsoft 正版账户皮肤不显示的问题，自动缓存官方皮肤并识别经典/纤细模型。';

const channel = process.env.UPDATE_CHANNEL === 'beta' ? 'beta' : 'stable';
const updateManifest = {
  version: pkg.version,
  channel,
  notes,
  downloadUrl: '',
  sha256: '',
  publishedAt: new Date().toISOString(),
};

const zipName = channel === 'beta' ? `TYCL-beta-${pkg.version}.zip` : `TYCL-update-${pkg.version}.zip`;
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
console.log('把清单上传到更新源，并填写其中的 downloadUrl 即可使用。');
