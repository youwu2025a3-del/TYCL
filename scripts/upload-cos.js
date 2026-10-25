'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function loadConfig() {
  const configPath = arg('config', process.env.COS_CONFIG || path.join(__dirname, '..', 'cos.config.json'));
  if (!fs.existsSync(configPath)) {
    throw new Error(`缺少 COS 配置文件：${configPath}\n请复制 cos.config.example.json 为 cos.config.json 并填写。`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  for (const key of ['secretId', 'secretKey', 'bucket', 'region']) {
    if (!config[key]) throw new Error(`COS 配置缺少 ${key}`);
  }
  config.prefix = String(config.prefix || 'tycl').replace(/^\/+|\/+$/g, '');
  return config;
}

function encodePath(key) {
  return '/' + key.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function sha1(text) {
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex');
}

function hmacSha1(key, text) {
  return crypto.createHmac('sha1', key).update(text, 'utf8').digest('hex');
}

function upload(config, key, file, contentType, cacheControl, dryRun) {
  const host = `${config.bucket}.cos.${config.region}.myqcloud.com`;
  const pathname = encodePath(key);
  const now = Math.floor(Date.now() / 1000);
  const signTime = `${now};${now + 3600}`;
  const headers = {
    host,
    'content-type': contentType,
    'cache-control': cacheControl,
    'x-cos-acl': 'public-read',
  };
  const headerList = Object.keys(headers).sort().join(';');
  const httpHeaders = Object.keys(headers).sort().map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(headers[name])}`).join('&');
  const httpString = `put\n${pathname}\n\n${httpHeaders}\n`;
  const stringToSign = `sha1\n${signTime}\n${signTime}\n${sha1(httpString)}`;
  const signature = hmacSha1(config.secretKey, stringToSign);
  const authorization = [
    'q-sign-algorithm=sha1',
    `q-ak=${config.secretId}`,
    `q-sign-time=${signTime}`,
    `q-key-time=${signTime}`,
    `q-header-list=${headerList}`,
    'q-url-param-list=',
    `q-signature=${signature}`,
  ].join('&');
  const url = `https://${host}${pathname}`;
  const size = fs.statSync(file).size;
  console.log(`${dryRun ? '[dry-run] ' : ''}PUT ${url} (${size} bytes)`);
  if (dryRun) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const request = https.request({
      method: 'PUT',
      hostname: host,
      path: pathname,
      headers: {
        Host: host,
        Authorization: authorization,
        'Content-Type': contentType,
        'Content-Length': size,
        'Cache-Control': cacheControl,
        'x-cos-acl': 'public-read',
      },
    }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve();
        else reject(new Error(`COS ${key} 上传失败：${response.statusCode} ${body.slice(0, 300)}`));
      });
    });
    request.on('error', reject);
    fs.createReadStream(file).pipe(request);
  });
}

(async () => {
  const config = loadConfig();
  const version = arg('version');
  if (!version) throw new Error('缺少 --version');
  const manifest = arg('manifest', path.join(__dirname, '..', 'dist', `COS-update-${version}.json`));
  const installer = arg('installer', path.join(__dirname, '..', 'dist', `TYCL-Setup-${version}.exe`));
  const updateZip = arg('update', path.join(__dirname, '..', 'dist', `TYCL-update-${version}.zip`));
  const serverZip = arg('server', path.join(__dirname, '..', 'dist', `TYCL-Update-Server-${version}.zip`));
  const dryRun = process.argv.includes('--dry-run');
  for (const file of [manifest, installer, updateZip]) {
    if (!fs.existsSync(file)) throw new Error(`文件不存在：${file}`);
  }
  const prefix = config.prefix ? `${config.prefix}/` : '';
  await upload(config, `${prefix}TYCL-update-${version}.zip`, updateZip, 'application/zip', 'public, max-age=31536000', dryRun);
  await upload(config, `${prefix}TYCL-Setup-${version}.exe`, installer, 'application/octet-stream', 'public, max-age=31536000', dryRun);
  if (fs.existsSync(serverZip)) {
    await upload(config, `${prefix}TYCL-Update-Server-${version}.zip`, serverZip, 'application/zip', 'public, max-age=31536000', dryRun);
  }
  await upload(config, `${prefix}update.json`, manifest, 'application/json; charset=utf-8', 'no-cache', dryRun);
  console.log(`完成：https://${config.bucket}.cos.${config.region}.myqcloud.com/${prefix}update.json`);
})().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
