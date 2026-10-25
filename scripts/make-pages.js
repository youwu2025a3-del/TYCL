'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const dist = path.join(root, 'dist');
const baseUrl = (process.env.PAGES_BASE_URL || 'https://tycl-updates-a3y8.youwu2025a3.workers.dev').replace(/\/+$/, '');
const zipName = `TYCL-update-${pkg.version}.zip`;
const zipPath = path.join(dist, zipName);
const installerName = `TYCL-Setup-${pkg.version}.exe`;
const installerPath = path.join(dist, installerName);
const outDir = path.join(dist, 'pages-upload');
const partSize = 20 * 1024 * 1024;

if (!fs.existsSync(zipPath)) {
  console.error(`找不到更新包：${zipPath}`);
  console.error('请先运行 npm run update:pack');
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const sha256 = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
const manifest = {
  version: pkg.version,
  channel: 'stable',
  notes: 'TYCL 更新：联机稳定性、Mod 指纹校验与性能优化。',
  downloadUrl: `${baseUrl}/${zipName}`,
  sha256,
  publishedAt: new Date().toISOString(),
  mandatory: false,
};

let installerInfo = null;
if (fs.existsSync(installerPath)) {
  const data = fs.readFileSync(installerPath);
  const parts = [];
  for (let offset = 0, index = 1; offset < data.length; offset += partSize, index += 1) {
    const name = `installer.part${String(index).padStart(2, '0')}`;
    const chunk = data.subarray(offset, Math.min(offset + partSize, data.length));
    fs.writeFileSync(path.join(outDir, name), chunk);
    parts.push({ name, size: chunk.length });
  }
  installerInfo = {
    name: installerName,
    size: data.length,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    parts,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, 'installer.json'), JSON.stringify(installerInfo, null, 2), 'utf8');
  console.log(`安装器已拆分：${installerName} (${(data.length / 1024 / 1024).toFixed(1)} MB, ${parts.length} 个分卷)`);
} else {
  console.warn(`没有找到安装器：${installerPath}`);
  console.warn('请先运行 npm run installer:pack，再重新运行 pages:pack。');
}

const headers = `/update.json
  Cache-Control: no-cache, no-store, must-revalidate
  Content-Type: application/json; charset=utf-8

/installer.json
  Cache-Control: no-cache, no-store, must-revalidate
  Content-Type: application/json; charset=utf-8

/*.part*
  Cache-Control: public, max-age=31536000, immutable

/*.zip
  Cache-Control: public, max-age=31536000, immutable
`;

const instructions = `Cloudflare 上传说明

1. 在 Cloudflare Workers & Pages 中打开项目：tycl-updates-a3y8
2. 选择 Create new deployment / 创建新部署
3. 上传这个文件夹里的所有文件（不要上传外层文件夹）
4. 部署完成后，首页地址：
   ${baseUrl}/
5. 更新源地址：
   ${baseUrl}/update.json

以后发布新版本：
  npm run package:win
  npm run installer:pack
  npm run update:pack
  npm run pages:pack
然后重新上传 pages-upload 里的内容。
生产地址不会变化。

注意：安装器被拆成多个 20 MB 分卷，网页会自动下载并合并成 ${installerName}。
`;

const index = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f4f8f5">
  <title>TYCL — 下载</title>
  <style>
    :root {
      --ink: #15231c;
      --muted: #687a70;
      --line: #dfe9e3;
      --mint: #17a77c;
      --mint-deep: #0d7b5a;
      --soft: #eaf7f1;
      --bg: #f5f9f6;
      --card: rgba(255,255,255,.86);
      --shadow: 0 24px 70px rgba(24, 78, 55, .1);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(900px 480px at 85% -10%, rgba(54, 205, 157, .16), transparent 64%),
        radial-gradient(600px 380px at 0% 25%, rgba(126, 190, 255, .1), transparent 70%),
        var(--bg);
      min-height: 100vh;
    }
    a { color: inherit; }
    .shell { max-width: 1120px; margin: 0 auto; padding: 0 28px; }
    header { height: 82px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .brand { display: flex; align-items: center; gap: 11px; text-decoration: none; }
    .brand img { width: 34px; height: 34px; border-radius: 9px; }
    .brand strong { font-size: 15px; letter-spacing: -.02em; }
    .brand span { color: var(--muted); font-size: 9px; font-weight: 700; letter-spacing: .16em; }
    .nav { display: flex; gap: 18px; color: var(--muted); font-size: 12px; }
    .nav a { text-decoration: none; }
    .nav a:hover { color: var(--mint-deep); }
    .hero { display: grid; grid-template-columns: 1.08fr .92fr; gap: 46px; align-items: center; padding: 46px 0 60px; }
    .eyebrow { display: inline-flex; align-items: center; gap: 7px; color: var(--mint-deep); font-size: 10px; font-weight: 750; letter-spacing: .16em; text-transform: uppercase; }
    .eyebrow::before { content: ""; width: 18px; height: 1px; background: var(--mint); }
    h1 { margin: 14px 0 16px; font-size: clamp(42px, 6vw, 70px); line-height: 1.02; letter-spacing: -.065em; font-weight: 780; }
    h1 em { display: block; color: var(--mint); font-style: normal; }
    .lead { color: var(--muted); font-size: 15px; line-height: 1.8; max-width: 520px; margin: 0 0 24px; }
    .badges { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 24px; }
    .badge { display: inline-flex; align-items: center; height: 25px; padding: 0 9px; border: 1px solid var(--line); border-radius: 7px; background: rgba(255,255,255,.66); color: var(--muted); font-size: 10px; font-weight: 650; }
    .badge strong { color: var(--mint-deep); margin-left: 4px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .download { appearance: none; border: 0; display: inline-flex; align-items: center; gap: 9px; height: 51px; padding: 0 22px; border-radius: 13px; background: var(--ink); color: #fff; font-size: 13px; font-weight: 700; box-shadow: 0 12px 30px rgba(19, 45, 32, .18); cursor: pointer; transition: transform .2s ease, background .2s ease, opacity .2s ease; }
    .download:hover { transform: translateY(-2px); background: #20372b; }
    .download:disabled { opacity: .55; cursor: wait; transform: none; }
    .download svg { width: 18px; height: 18px; }
    .secondary { display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 12px; border-radius: 9px; color: var(--muted); font-size: 11px; text-decoration: none; }
    .secondary:hover { background: rgba(255,255,255,.7); color: var(--ink); }
    .meta { margin-top: 14px; color: #8a9990; font-size: 10px; line-height: 1.6; }
    .progress-wrap { display: none; margin-top: 16px; width: min(100%, 440px); }
    .progress-wrap.on { display: block; }
    .progress-head { display: flex; justify-content: space-between; color: var(--muted); font-size: 10px; margin-bottom: 6px; }
    .progress { height: 7px; border-radius: 99px; background: #e6eee9; overflow: hidden; }
    .progress i { display: block; height: 100%; width: 0; border-radius: 99px; background: linear-gradient(90deg, #1cb487, #54d3a7); transition: width .2s ease; }
    .art-wrap { position: relative; min-height: 390px; display: grid; place-items: center; }
    .art-glow { position: absolute; width: 380px; height: 380px; border-radius: 50%; background: radial-gradient(circle, rgba(39, 190, 142, .2), transparent 68%); }
    .preview { position: relative; width: 100%; border: 1px solid rgba(255,255,255,.9); border-radius: 20px; overflow: hidden; box-shadow: var(--shadow); transform: rotate(1.2deg); background: #fff; }
    .preview img { display: block; width: 100%; height: auto; }
    .float { position: absolute; right: -4px; bottom: 26px; display: flex; align-items: center; gap: 8px; padding: 10px 13px; border-radius: 12px; background: rgba(255,255,255,.9); border: 1px solid rgba(255,255,255,.95); box-shadow: 0 16px 34px rgba(20, 70, 48, .15); font-size: 10px; color: var(--muted); backdrop-filter: blur(10px); }
    .float strong { display: block; color: var(--ink); font-size: 11px; }
    .float i { width: 26px; height: 26px; border-radius: 7px; background: var(--soft); display: grid; place-items: center; color: var(--mint-deep); }
    .features { padding: 20px 0 54px; }
    .section-title { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 16px; }
    .section-title h2 { margin: 0; font-size: 21px; letter-spacing: -.035em; }
    .section-title span { color: var(--muted); font-size: 11px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 11px; }
    .feature { background: var(--card); border: 1px solid var(--line); border-radius: 15px; padding: 16px; box-shadow: 0 4px 18px rgba(24, 78, 55, .03); }
    .feature i { display: grid; place-items: center; width: 29px; height: 29px; border-radius: 8px; background: var(--soft); color: var(--mint-deep); margin-bottom: 12px; }
    .feature strong { display: block; font-size: 12px; margin-bottom: 4px; }
    .feature p { margin: 0; color: var(--muted); font-size: 10px; line-height: 1.6; }
    .update-box { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; margin-bottom: 45px; }
    .update-card { background: var(--card); border: 1px solid var(--line); border-radius: 15px; padding: 18px; }
    .update-card .label { color: var(--muted); font-size: 10px; }
    .update-card h3 { margin: 6px 0 8px; font-size: 17px; letter-spacing: -.03em; }
    .update-card p { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.7; white-space: pre-line; }
    .update-card a { display: inline-flex; margin-top: 12px; color: var(--mint-deep); font-size: 11px; font-weight: 650; text-decoration: none; }
    footer { border-top: 1px solid var(--line); padding: 22px 0 30px; color: #8a9990; font-size: 10px; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    footer a { color: var(--mint-deep); text-decoration: none; }
    @media (max-width: 900px) {
      .hero { grid-template-columns: 1fr; padding-top: 18px; gap: 20px; }
      .art-wrap { min-height: 280px; order: -1; }
      .preview { max-width: 560px; }
      .grid { grid-template-columns: repeat(2, 1fr); }
      .update-box { grid-template-columns: 1fr; }
      .nav { display: none; }
    }
    @media (max-width: 560px) {
      .shell { padding: 0 18px; }
      h1 { font-size: 45px; }
      .grid { grid-template-columns: 1fr; }
      .actions { align-items: stretch; flex-direction: column; }
      .download { justify-content: center; }
      .secondary { justify-content: center; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { transition-duration: .01ms !important; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <a class="brand" href="./">
        <img src="./icon-128.png" alt="TYCL">
        <div><strong>TYCL</strong><br><span>MINECRAFT LAUNCHER</span></div>
      </a>
      <nav class="nav">
        <a href="#features">功能</a>
        <a href="#updates">更新</a>
        <a href="./update.json">更新源</a>
      </nav>
    </header>

    <main>
      <section class="hero">
        <div>
          <div class="eyebrow">SIMPLE · CLEAN · READY</div>
          <h1>把世界，<em>装进下一次点击。</em></h1>
          <p class="lead">TYCL 是一个简洁、轻盈的 Minecraft Java 版启动器。安装、Mod、整合包、正版登录和官方新闻，都在一个安静的地方。</p>
          <div class="badges">
            <span class="badge">最新版本 <strong id="version">加载中</strong></span>
            <span class="badge">Windows 10 / 11 x64</span>
            <span class="badge">安装器 <span id="installer-size">—</span></span>
          </div>
          <div class="actions">
            <button class="download" id="download" type="button" disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v11"/><path d="m7.5 10 4.5 4.5 4.5-4.5"/><path d="M4.5 17v2.5h15V17"/></svg>
              <span id="download-label">正在准备安装器…</span>
            </button>
            <a class="secondary" href="./${zipName}">只有更新包？下载 zip</a>
          </div>
          <div class="progress-wrap" id="progress-wrap">
            <div class="progress-head"><span id="progress-status">准备下载</span><span id="progress-pct">0%</span></div>
            <div class="progress"><i id="progress-bar"></i></div>
          </div>
          <div class="meta" id="download-note">安装器未签名，首次运行 Windows 可能显示 SmartScreen 提示，选择“仍要运行”即可。<br><strong>下载完成后，请右键安装器，选择“以管理员身份运行”再安装。</strong><br>安装后会创建开始菜单和桌面快捷方式，可在系统设置中卸载。</div>
        </div>
        <div class="art-wrap">
          <div class="art-glow"></div>
          <div class="preview"><img src="./preview.png" alt="TYCL 首页预览"></div>
          <div class="float"><i><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v18M3 12h18"/></svg></i><div><strong>一键安装</strong>游戏、Mod、整合包</div></div>
        </div>
      </section>

      <section class="features" id="features">
        <div class="section-title"><h2>少一点折腾，多一点游戏。</h2><span>TYCL ${pkg.version}</span></div>
        <div class="grid">
          <article class="feature"><i>▣</i><strong>Microsoft 正版登录</strong><p>官方登录流程，正版服务器与官方皮肤。</p></article>
          <article class="feature"><i>◇</i><strong>任意版本安装</strong><p>正式版、快照、旧版本，选择后直接安装。</p></article>
          <article class="feature"><i>⌘</i><strong>Mod 与整合包</strong><p>Modrinth 资源搜索、一键安装与汉化。</p></article>
          <article class="feature"><i>↻</i><strong>自动更新</strong><p>每次启动自动检查，发现新版本直接提示。</p></article>
        </div>
      </section>

      <section id="updates">
        <div class="section-title"><h2>最新版本</h2><a class="secondary" href="./update.json">查看 update.json</a></div>
        <div class="update-box">
          <div class="update-card">
            <div class="label">CURRENT RELEASE</div>
            <h3 id="update-version">加载中…</h3>
            <p id="update-notes">正在读取更新清单。</p>
            <a href="./${zipName}">下载手动更新包 →</a>
          </div>
          <div class="update-card">
            <div class="label">INSTALLER</div>
            <h3>Windows 安装器</h3>
            <p>推荐使用安装器。下载完成后请右键安装器，选择「以管理员身份运行」。安装器会创建快捷方式，并保留游戏存档、皮肤和账户数据。</p>
            <a href="#top" id="installer-link">从顶部下载安装器 →</a>
          </div>
        </div>
      </section>
    </main>

    <footer>
      <span>TYCL · 制作者 A3Y8 · <a href="mailto:tianyi76@yeah.net">tianyi76@yeah.net</a></span>
      <span>不隶属于 Mojang Studios 或 Microsoft</span>
    </footer>
  </div>

  <script>
    (function () {
      var versionEl = document.getElementById('version');
      var updateVersionEl = document.getElementById('update-version');
      var updateNotesEl = document.getElementById('update-notes');
      var installerSizeEl = document.getElementById('installer-size');
      var button = document.getElementById('download');
      var label = document.getElementById('download-label');
      var progressWrap = document.getElementById('progress-wrap');
      var progressStatus = document.getElementById('progress-status');
      var progressPct = document.getElementById('progress-pct');
      var progressBar = document.getElementById('progress-bar');
      var installerInfo = null;

      function formatSize(bytes) {
        if (!bytes) return '—';
        if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
      }

      function setProgress(done, total) {
        var pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
        progressWrap.classList.add('on');
        progressBar.style.width = pct + '%';
        progressPct.textContent = pct + '%';
        progressStatus.textContent = '正在下载 ' + formatSize(done) + ' / ' + formatSize(total);
      }

      function showStatus(text) {
        progressWrap.classList.add('on');
        progressStatus.textContent = text;
      }

      async function loadMeta() {
        try {
          var response = await fetch('./update.json', { cache: 'no-store' });
          if (response.ok) {
            var data = await response.json();
            versionEl.textContent = 'v' + data.version;
            updateVersionEl.textContent = 'TYCL v' + data.version;
            updateNotesEl.textContent = data.notes || '已是最新版本。';
          }
        } catch (error) {
          versionEl.textContent = '未知';
          updateVersionEl.textContent = '读取失败';
          updateNotesEl.textContent = '暂时无法读取更新清单，请稍后刷新。';
        }
        try {
          var response2 = await fetch('./installer.json', { cache: 'no-store' });
          if (!response2.ok) throw new Error('no installer');
          installerInfo = await response2.json();
          installerSizeEl.textContent = formatSize(installerInfo.size);
          button.disabled = false;
          label.textContent = '下载安装器 · ' + formatSize(installerInfo.size);
        } catch (error) {
          button.disabled = true;
          label.textContent = '安装器尚未准备';
          installerSizeEl.textContent = '—';
        }
      }

      async function saveWithPicker(fileName) {
        var handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: 'Windows 安装器', accept: { 'application/octet-stream': ['.exe'] } }]
        });
        var writable = await handle.createWritable();
        var received = 0;
        for (var i = 0; i < installerInfo.parts.length; i += 1) {
          var part = installerInfo.parts[i];
          var response = await fetch('./' + part.name, { cache: 'no-store' });
          if (!response.ok) throw new Error('分卷下载失败：' + part.name);
          var buffer = await response.arrayBuffer();
          await writable.write(buffer);
          received += buffer.byteLength;
          setProgress(received, installerInfo.size);
        }
        await writable.close();
      }

      async function saveWithBlob(fileName) {
        var chunks = [];
        var received = 0;
        for (var i = 0; i < installerInfo.parts.length; i += 1) {
          var part = installerInfo.parts[i];
          var response = await fetch('./' + part.name, { cache: 'no-store' });
          if (!response.ok) throw new Error('分卷下载失败：' + part.name);
          var buffer = await response.arrayBuffer();
          chunks.push(buffer);
          received += buffer.byteLength;
          setProgress(received, installerInfo.size);
        }
        var blob = new Blob(chunks, { type: 'application/octet-stream' });
        var url = URL.createObjectURL(blob);
        var anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 15000);
      }

      button.addEventListener('click', async function () {
        if (!installerInfo) return;
        button.disabled = true;
        label.textContent = '正在下载安装器…';
        try {
          if (window.showSaveFilePicker) {
            try {
              await saveWithPicker(installerInfo.name);
            } catch (error) {
              if (error && error.name === 'AbortError') {
                showStatus('已取消保存');
                return;
              }
              await saveWithBlob(installerInfo.name);
            }
          } else {
            await saveWithBlob(installerInfo.name);
          }
          showStatus('下载完成，请右键安装器 → 以管理员身份运行');
          progressBar.style.width = '100%';
          progressPct.textContent = '100%';
        } catch (error) {
          showStatus('下载失败：' + (error.message || '请重试'));
        } finally {
          button.disabled = false;
          label.textContent = '重新下载安装器';
        }
      });

      document.getElementById('installer-link').addEventListener('click', function (event) {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(function () { button.focus(); }, 350);
      });

      loadMeta();
    })();
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(outDir, 'update.json'), JSON.stringify(manifest, null, 2), 'utf8');
fs.copyFileSync(zipPath, path.join(outDir, zipName));
fs.writeFileSync(path.join(outDir, '_headers'), headers, 'utf8');
fs.writeFileSync(path.join(outDir, 'index.html'), index, 'utf8');
fs.writeFileSync(path.join(outDir, 'README.txt'), instructions, 'utf8');

const icon = path.join(root, 'src', 'assets', 'icon-128.png');
if (fs.existsSync(icon)) fs.copyFileSync(icon, path.join(outDir, 'icon-128.png'));
const preview = path.join(root, 'screenshots', 'home.png');
if (fs.existsSync(preview)) fs.copyFileSync(preview, path.join(outDir, 'preview.png'));

console.log('Cloudflare 上传目录已生成：');
console.log('  ' + outDir);
console.log('  ' + path.join(outDir, zipName));
console.log('  ' + path.join(outDir, 'update.json'));
if (installerInfo) {
  console.log('  ' + path.join(outDir, 'installer.json'));
  console.log('  ' + installerInfo.parts.length + ' 个安装器分卷');
}
console.log('更新源地址： ' + baseUrl + '/update.json');
console.log('SHA-256: ' + sha256);
