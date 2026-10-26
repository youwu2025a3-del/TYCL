import { icon } from '../icons.js';
import { escapeHtml } from '../utils.js';
import { setAvatar, toast } from '../components.js';

const THEMES = [
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
  { value: 'system', label: '跟随系统', icon: 'monitor' },
];

const ACCENTS = [
  { value: 'mint', label: '薄荷', color: '#19a97f' },
  { value: 'sky', label: '远空', color: '#3878e0' },
  { value: 'violet', label: '紫藤', color: '#7a62d8' },
  { value: 'amber', label: '琥珀', color: '#d68a25' },
  { value: 'rose', label: '玫瑰', color: '#d75c76' },
];

function themePreview(theme) {
  return `<div class="theme-preview ${theme}">
    <div class="tp-side"></div>
    <div class="tp-content"><div class="tp-line"></div><div class="tp-line short"></div><div class="tp-box"></div></div>
  </div>`;
}

export async function render(container, ctx) {
  const { state } = ctx;
  const settings = state.settings;
  const microsoft = state.account?.mode === 'microsoft';
  const displayName = ctx.displayName?.() || state.player.name;
  const totalMemory = state.system?.totalMemoryMb || 16384;
  const maxMemory = Math.min(65536, Math.max(4096, Math.floor(totalMemory / 512) * 512));
  const memory = Math.min(maxMemory, Math.max(1024, settings.memoryMb || 4096));
  let javaList = [];

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-eyebrow">PREFERENCES</div>
          <h1 class="page-title">设置</h1>
          <p class="page-subtitle">把 TYCL 调整成你喜欢的样子。所有设置都会自动保存在本机。</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" data-open-dir>${icon('folder', 15)} 打开游戏目录</button>
        </div>
      </div>

      <div class="settings-grid">
        <div class="settings-col">
        <section class="settings-card">
          <div class="settings-card-head">
            <div class="settings-icon">${icon('palette', 15)}</div>
            <div><h3>外观</h3><p>选择你习惯的明暗与强调色</p></div>
          </div>
          <div class="settings-card-body">
            <div class="field">
              <div class="field-label">主题</div>
              <div class="theme-grid" data-theme-grid>
                ${THEMES.map(
                  (theme) => `<button class="theme-option ${settings.theme === theme.value ? 'active' : ''}" data-theme-choice="${theme.value}">
                    ${themePreview(theme.value)}
                    <div class="theme-option-label"><span>${theme.label}</span>${icon(theme.icon, 12)}</div>
                  </button>`,
                ).join('')}
              </div>
            </div>
            <div class="field">
              <div class="field-label">强调色</div>
              <div class="accent-row" data-accent-row>
                ${ACCENTS.map(
                  (accent) => `<button class="accent-swatch ${settings.accent === accent.value ? 'active' : ''}" data-accent-choice="${accent.value}" title="${accent.label}" style="background:${accent.color}"></button>`,
                ).join('')}
                <span class="field-hint" data-accent-label style="margin-left:4px">${ACCENTS.find((item) => item.value === settings.accent)?.label || '薄荷'}</span>
              </div>
            </div>
          </div>
        </section>
        <section class="settings-card">
          <div class="settings-card-head">
            <div class="settings-icon">${icon('cloud-download', 15)}</div>
            <div><h3>下载</h3><p>选择游戏文件的下载来源</p></div>
          </div>
          <div class="settings-card-body">
            <div class="field">
              <div class="field-label">下载源 <button class="section-link" data-speedtest>${icon('activity', 11)} 测速</button></div>
              <div class="source-options">
                <button class="source-option ${settings.downloadSource === 'bmclapi' ? 'active' : ''}" data-source="bmclapi">
                  <strong>${icon('globe', 13)} BMCLAPI 镜像</strong>
                  <span>国内访问更快 · 推荐</span>
                </button>
                <button class="source-option ${settings.downloadSource === 'official' ? 'active' : ''}" data-source="official">
                  <strong>${icon('cloud-download', 13)} Mojang 官方</strong>
                  <span>直连官方服务器</span>
                </button>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-copy">
                <strong>在版本库中显示快照</strong>
                <span>默认只展示稳定版本，开启后可安装预览版。</span>
              </div>
              <button class="switch ${settings.showSnapshots ? 'on' : ''}" data-snapshots aria-label="显示快照"></button>
            </div>
            <div class="notice">
              ${icon('info', 15)}
              <span>CurseForge 通过内置代理访问，无需填写 API Key。</span>
            </div>
            <div class="notice">
              ${icon('info', 15)}
              <span>下载源只影响游戏文件。安装 Mod 与整合包时始终从 Modrinth 获取内容。</span>
            </div>
          </div>
        </section>
        <section class="settings-card">
          <div class="settings-card-head">
            <div class="settings-icon">${icon('megaphone', 15)}</div>
            <div><h3>更新与公告</h3><p>无需重下整个启动器</p></div>
          </div>
          <div class="settings-card-body">
            <div class="setting-row">
              <div class="setting-copy">
                <strong>当前版本 v${escapeHtml(state.system?.appVersion || '1.4.3')}</strong>
                <span>${microsoft ? '正版账户已连接。' : ''}支持检查更新、导入本地更新包并在后台替换应用资源。</span>
              </div>
              <button class="btn btn-primary btn-sm" data-open-updates>${icon('megaphone', 12)} 更新公告</button>
            </div>
            <div class="setting-row">
              <div class="setting-copy">
                <strong>启动时自动检查更新</strong>
                <span>关闭后只在点击「检查」时访问更新源，适合流量受限或使用代理的环境。</span>
              </div>
              <button class="switch ${settings.autoCheckUpdates !== false ? 'on' : ''}" data-auto-check aria-label="自动检查更新"></button>
            </div>
            <div class="field">
              <div class="field-label">更新通道</div>
              <select class="input input-sm" data-update-channel>
                <option value="stable" ${(settings.updateChannel || 'stable') === 'stable' ? 'selected' : ''}>稳定版 Stable</option>
                <option value="beta" ${settings.updateChannel === 'beta' ? 'selected' : ''}>测试版 Beta</option>
              </select>
              <div class="field-hint">测试版会读取同目录下的 beta-update.json；没有配置时回退到稳定版地址。</div>
            </div>
            <div class="field">
              <div class="field-label">更新源地址 <span class="field-hint" style="font-weight:400">可选</span></div>
              <div class="path-field">
                <input class="input input-sm" data-update-feed value="${escapeHtml(settings.updateFeedUrl || '')}" placeholder="https://example.com/tycl/update.json" spellcheck="false">
                <button class="btn btn-secondary btn-sm" data-check-update>${icon('refresh', 12)} 检查</button>
                <button class="btn btn-secondary btn-sm" data-import-update>${icon('upload', 12)} 导入</button>
              </div>
              <div class="field-hint" data-update-status>没有配置更新源时，也可以把 update.json 放到 TYCL.exe 同目录，或直接导入 .zip/.asar 更新包。</div>
            </div>
            <div class="notice">
              ${icon('info', 15)}
              <span>更新包只替换应用的 app.asar，不会删除游戏、存档、皮肤和账户数据。安装完成后 TYCL 会自动重启。</span>
            </div>
          </div>
        </section>
        </div>
        <div class="settings-col">
        <section class="settings-card">
          <div class="settings-card-head">
            <div class="settings-icon">${icon('cpu', 15)}</div>
            <div><h3>游戏与性能</h3><p>内存分配与 Java 运行环境</p></div>
          </div>
          <div class="settings-card-body">
            <div class="field">
              <div class="field-label">游戏目录</div>
              <div class="path-field">
                <input class="input input-sm" readonly value="${escapeHtml(settings.gameDir)}" data-game-dir>
                <button class="btn btn-secondary btn-sm" data-game-dir-browse>${icon('folder', 12)} 选择</button>
                <button class="btn btn-secondary btn-sm" data-game-dir-open title="打开目录">${icon('external-link', 12)}</button>
              </div>
              <div class="field-hint">游戏版本、资源与实例都存放在这里。切换目录后，游戏库会显示对应目录中的实例。</div>
            </div>
            <div class="field">
              <div class="field-label">分配内存 <span class="memory-value" data-memory-value>${(memory / 1024).toFixed(memory % 1024 === 0 ? 0 : 1)} GB</span></div>
              <input class="range" type="range" min="1024" max="${maxMemory}" step="512" value="${memory}" data-memory>
              <div class="memory-scale"><span>1 GB</span><span>系统内存 ${(totalMemory / 1024).toFixed(0)} GB</span><span>${(maxMemory / 1024).toFixed(0)} GB</span></div>
              <div class="field-hint">建议 4–8 GB。大型整合包可以适当增加。</div>
            </div>
            <div class="setting-row">
              <div class="setting-copy">
                <strong>版本隔离</strong>
                <span>每个实例拥有独立的 mods、存档、资源包和日志，互不污染。</span>
              </div>
              <span class="badge badge-accent">默认开启</span>
            </div>
            <div class="divider"></div>
            <div class="field">
              <div class="field-label">Java 路径 <button class="section-link" data-java-refresh>${icon('refresh', 11)} 重新检测</button> <button class="section-link" data-java-install>${icon('download', 11)} 自动安装 Java 21</button></div>
              <div class="path-field">
                <input class="input input-sm" readonly value="${escapeHtml(settings.javaPath || '自动选择最合适的 Java')}" data-java-path>
                <button class="btn btn-secondary btn-sm" data-java-browse>${icon('folder', 12)} 浏览</button>
              </div>
              <div class="java-list" data-java-list>
                <div class="loading-block" style="padding:12px"><span class="spinner"></span> 正在检测 Java…</div>
              </div>
              <div class="field-hint">游戏启动时会优先使用这里的 Java。未指定时按版本自动匹配；缺少对应版本时，TYCL 会在首次启动前自动下载 Microsoft OpenJDK（Windows x64）。</div>
            </div>
          </div>
        </section>
        <section class="settings-card">
          <div class="settings-card-head">
            <div class="settings-icon">${icon('user', 15)}</div>
            <div><h3>账户</h3><p>Microsoft 正版或本地离线账户</p></div>
          </div>
          <div class="settings-card-body">
            <div class="setting-row">
              <div style="display:flex;align-items:center;gap:11px;min-width:0">
                <span class="player-avatar" data-settings-avatar style="width:42px;height:42px;flex-basis:42px"></span>
                <div class="setting-copy">
                  <strong style="font-size:13px">${escapeHtml(displayName)} ${microsoft ? '<span class="account-verified" style="margin-left:4px">正版</span>' : ''}</strong>
                  <span>${microsoft ? 'Microsoft 正版账户' : '离线账户'} · ${escapeHtml(state.activeSkin?.name || '云杉')}</span>
                </div>
              </div>
              <button class="btn btn-secondary btn-sm" data-edit-account>${icon('sliders', 12)} 管理</button>
            </div>
            <div class="divider"></div>
            <div class="setting-row">
              <div class="setting-copy">
                <strong>皮肤与角色外观</strong>
                <span>导入新的皮肤，调整经典或纤细模型。</span>
              </div>
              <button class="btn btn-soft btn-sm" data-goto-skins>${icon('shirt', 12)} 皮肤工坊</button>
            </div>
            <div class="divider"></div>
            <div class="field">
              <div class="field-label">Microsoft Client ID <span class="field-hint" style="font-weight:400">高级</span></div>
              <input class="input input-sm" data-ms-client-id value="${escapeHtml(settings.microsoftClientId || '00000000402b5328')}" spellcheck="false">
              <div class="field-hint">用于 Microsoft 登录的公共客户端 ID。默认值适用于大多数用户，登录异常时再修改。</div>
            </div>
          </div>
        </section>
        </div>
        <section class="settings-card full">
          <div class="settings-card-head">
            <div class="settings-icon">${icon('cube', 15)}</div>
            <div><h3>关于 TYCL</h3><p>制作者、反馈与开源信息</p></div>
          </div>
          <div class="settings-card-body">
            <div class="about-box">
              <div class="about-logo"><img src="./assets/icon-128.png" alt="TYCL"></div>
              <div style="flex:1">
                <div class="about-title">TYCL <span>LAUNCHER</span></div>
                <p class="about-desc">简洁、安静、专注的 Minecraft 启动器。游戏、Mod、整合包、正版登录与皮肤，在一个地方恰到好处地相遇。</p>
                <div class="creator-line">制作者 <strong>A3Y8</strong> · 反馈 BUG：<button class="inline-link" data-feedback>tianyi76@yeah.net</button></div>
              </div>
              <div style="display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end">
                <button class="btn btn-secondary btn-sm" data-about>更多信息 ${icon('arrow-right', 12)}</button>
                <button class="btn btn-ghost btn-sm" data-copy-feedback>${icon('copy', 12)} 复制邮箱</button>
              </div>
            </div>
            <div class="about-meta">
              <span>${icon('package', 11)} 版本 ${escapeHtml(state.system?.appVersion || '1.4.3')}</span>
              <span>${icon('cpu', 11)} ${escapeHtml(state.system?.platform || 'win32')} / ${escapeHtml(state.system?.arch || 'x64')}</span>
              <span>${icon('terminal', 11)} Electron</span>
              <span>${icon('file-text', 11)} MIT License</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  setAvatar(container.querySelector('[data-settings-avatar]'), state.activeSkin?.dataUrl);

  const memoryInput = container.querySelector('[data-memory]');
  const memoryValue = container.querySelector('[data-memory-value]');
  const updateMemoryFill = () => {
    const value = Number(memoryInput.value);
    const pct = ((value - 1024) / (maxMemory - 1024)) * 100;
    memoryInput.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`);
    memoryValue.textContent = `${(value / 1024).toFixed(value % 1024 === 0 ? 0 : 1)} GB`;
  };
  updateMemoryFill();
  memoryInput.addEventListener('input', updateMemoryFill);
  memoryInput.addEventListener('change', async () => {
    try {
      await ctx.saveSettings({ memoryMb: Number(memoryInput.value) });
      toast({ title: '内存设置已保存', message: `最大 ${memoryValue.textContent}` });
    } catch (error) {
      toast({ title: '保存失败', message: error.message, type: 'error' });
    }
  });

  container.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.addEventListener('click', async () => {
      const theme = button.dataset.themeChoice;
      container.querySelectorAll('[data-theme-choice]').forEach((item) => item.classList.toggle('active', item === button));
      await ctx.setTheme(theme);
    });
  });

  container.querySelectorAll('[data-accent-choice]').forEach((button) => {
    button.addEventListener('click', async () => {
      const accent = button.dataset.accentChoice;
      container.querySelectorAll('[data-accent-choice]').forEach((item) => item.classList.toggle('active', item === button));
      const label = container.querySelector('[data-accent-label]');
      if (label) label.textContent = ACCENTS.find((item) => item.value === accent)?.label || '';
      await ctx.setAccent(accent);
    });
  });

  container.querySelector('[data-speedtest]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = '<span class="spinner" style="width:11px;height:11px"></span> 测速中';
    try {
      const result = await ctx.api.testNetwork();
      const rows = result.results.map((item) => `${item.name} ${item.ok ? `${item.ms}ms` : '不可用'}`).join(' · ');
      const best = result.results.find((item) => item.ok);
      toast({ title: best ? `最快：${best.name}` : '测速完成', message: rows, type: 'info', duration: 7000 });
    } catch (error) {
      toast({ title: '测速失败', message: error.message, type: 'error' });
    } finally {
      button.disabled = false;
      button.innerHTML = `${icon('activity', 11)} 测速`;
    }
  });
  container.querySelectorAll('[data-source]').forEach((button) => {
    button.addEventListener('click', async () => {
      container.querySelectorAll('[data-source]').forEach((item) => item.classList.toggle('active', item === button));
      try {
        await ctx.saveSettings({ downloadSource: button.dataset.source });
        toast({ title: '下载源已更新', message: button.dataset.source === 'official' ? 'Mojang 官方源' : 'BMCLAPI 镜像' });
      } catch (error) {
        toast({ title: '保存失败', message: error.message, type: 'error' });
      }
    });
  });

  const snapshotsSwitch = container.querySelector('[data-snapshots]');
  snapshotsSwitch.addEventListener('click', async () => {
    const next = !snapshotsSwitch.classList.contains('on');
    snapshotsSwitch.classList.toggle('on', next);
    ctx.state.settings.showSnapshots = next;
    try {
      await ctx.saveSettings({ showSnapshots: next });
    } catch (error) {
      toast({ title: '保存失败', message: error.message, type: 'error' });
    }
  });

  container.querySelector('[data-open-dir]').addEventListener('click', () => ctx.api.openPath(settings.gameDir));
  container.querySelector('[data-game-dir-open]').addEventListener('click', () => ctx.api.openPath(ctx.state.settings.gameDir));
  container.querySelector('[data-game-dir-browse]').addEventListener('click', async () => {
    try {
      const result = await ctx.api.chooseDirectory({ title: '选择 Minecraft 游戏目录', defaultPath: ctx.state.settings.gameDir });
      if (result.canceled || !result.path) return;
      const updated = await ctx.saveSettings({ gameDir: result.path });
      ctx.applyBootstrap(updated);
      toast({ title: '游戏目录已更新', message: result.path });
      ctx.rerender();
    } catch (error) {
      toast({ title: '切换目录失败', message: error.message, type: 'error' });
    }
  });
  container.querySelector('[data-edit-account]').addEventListener('click', () => ctx.openAccount());
  container.querySelector('[data-goto-skins]').addEventListener('click', () => ctx.navigate('skins'));
  container.querySelector('[data-about]').addEventListener('click', () => ctx.openAbout());
  container.querySelector('[data-open-updates]').addEventListener('click', () => ctx.openUpdates());

  const clientIdInput = container.querySelector('[data-ms-client-id]');  clientIdInput?.addEventListener('change', async () => {
    const value = clientIdInput.value.trim();
    if (!value) {
      clientIdInput.value = ctx.state.settings.microsoftClientId || '00000000402b5328';
      return;
    }
    try {
      await ctx.saveSettings({ microsoftClientId: value });
      toast({ title: 'Microsoft Client ID 已保存', message: '下次登录时生效' });
    } catch (error) {
      toast({ title: '保存失败', message: error.message, type: 'error' });
    }
  });

  const feedInput = container.querySelector('[data-update-feed]');
  const updateStatus = container.querySelector('[data-update-status]');
  feedInput?.addEventListener('change', async () => {
    try {
      await ctx.saveSettings({ updateFeedUrl: feedInput.value.trim() });
      toast({ title: '更新源已保存' });
    } catch (error) {
      toast({ title: '保存失败', message: error.message, type: 'error' });
    }
  });
  container.querySelector('[data-update-channel]')?.addEventListener('change', async (event) => {
    try {
      await ctx.saveSettings({ updateChannel: event.target.value });
      toast({ title: event.target.value === 'beta' ? '已切换到测试版通道' : '已切换到稳定版通道' });
    } catch (error) {
      toast({ title: '保存失败', message: error.message, type: 'error' });
    }
  });
  container.querySelector('[data-auto-check]')?.addEventListener('click', async (event) => {
    try {
      const next = !event.currentTarget.classList.contains('on');
      event.currentTarget.classList.toggle('on', next);
      await ctx.saveSettings({ autoCheckUpdates: next });
      toast({ title: next ? '已开启自动检查更新' : '已关闭自动检查更新' });
    } catch (error) {
      toast({ title: '保存失败', message: error.message, type: 'error' });
    }
  });
  container.querySelector('[data-check-update]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = `<span class="spinner" style="width:12px;height:12px"></span> 检查中`;
    try {
      if (feedInput.value.trim() !== (ctx.state.settings.updateFeedUrl || '')) {
        await ctx.saveSettings({ updateFeedUrl: feedInput.value.trim() });
      }
      const result = await ctx.api.checkUpdates();
      if (result.hasUpdate) {
        updateStatus.textContent = `发现新版本 v${result.latestVersion}，可在更新公告中下载或导入更新包。`;
        toast({ title: `发现新版本 v${result.latestVersion}`, message: '打开更新公告即可安装', type: 'info' });
      } else if (result.error) {
        updateStatus.textContent = result.error;
      } else if (!result.configured) {
        updateStatus.textContent = '未配置更新源。可填写 update.json 地址，或直接导入本地更新包。';
      } else {
        updateStatus.textContent = `已是最新版本 v${result.currentVersion}`;
      }
    } catch (error) {
      updateStatus.textContent = '检查更新失败：' + error.message;
    } finally {
      button.disabled = false;
      button.innerHTML = `${icon('refresh', 12)} 检查`;
    }
  });
  container.querySelector('[data-import-update]').addEventListener('click', async () => {
    try {
      const prepared = await ctx.api.chooseUpdatePackage();
      if (!prepared || prepared.canceled) return;
      const confirmed = await ctx.confirm({
        title: '安装本地更新',
        message: `更新包已准备就绪${prepared.version ? `（v${prepared.version}）` : ''}。安装后 TYCL 会自动重启，是否继续？`,
        confirmText: '安装并重启',
      });
      if (!confirmed) return;
      await ctx.api.installUpdate({ packagePath: prepared.packagePath });
      toast({ title: '正在安装更新', message: 'TYCL 即将重启' });
    } catch (error) {
      toast({ title: '更新失败', message: error.message, type: 'error', duration: 7000 });
    }
  });
  container.querySelector('[data-feedback]').addEventListener('click', () => ctx.api.openExternal('mailto:tianyi76@yeah.net'));
  container.querySelector('[data-copy-feedback]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('tianyi76@yeah.net');
      toast({ title: '反馈邮箱已复制' });
    } catch {
      toast({ title: '复制失败', type: 'error' });
    }
  });

  async function refreshJavaList() {
    const listEl = container.querySelector('[data-java-list]');
    listEl.innerHTML = `<div class="loading-block" style="padding:12px"><span class="spinner"></span> 正在检测 Java…</div>`;
    try {
      const result = await ctx.api.detectJava();
      if (ctx.signal?.aborted) return;
      javaList = result.javas || [];
      renderJavaList();
    } catch (error) {
      if (ctx.signal?.aborted) return;
      listEl.innerHTML = `<div class="notice warn" style="margin:0">${icon('alert-triangle', 15)}<span>检测失败：${escapeHtml(error.message)}</span></div>`;
    }
  }

  function renderJavaList() {
    const listEl = container.querySelector('[data-java-list]');
    if (!listEl) return;
    if (!javaList.length) {
      listEl.innerHTML = `<div class="notice warn" style="margin:0">${icon('alert-triangle', 15)}<span>没有检测到 Java。请安装 Java 21 或手动选择 java.exe。</span></div>`;
      return;
    }
    const current = ctx.state.settings.javaPath;
    listEl.innerHTML = javaList
      .map(
        (java) => `<div class="java-item ${current === java.path ? 'active' : ''}" data-java-path-choice="${escapeHtml(java.path)}" title="${escapeHtml(java.path)}">
          <span class="java-ver">Java ${java.major}</span>
          <span class="java-path">${escapeHtml(java.path)}</span>
          ${current === java.path ? '<span class="badge badge-accent">已选择</span>' : ''}
        </div>`,
      )
      .join('');
    listEl.querySelectorAll('[data-java-path-choice]').forEach((item) => {
      item.addEventListener('click', async () => {
        try {
          await ctx.saveSettings({ javaPath: item.dataset.javaPathChoice });
          listEl.querySelectorAll('.java-item').forEach((row) => row.classList.toggle('active', row === item));
          const pathInput = container.querySelector('[data-java-path]');
          if (pathInput) pathInput.value = item.dataset.javaPathChoice;
          renderJavaList();
          toast({ title: 'Java 路径已保存' });
        } catch (error) {
          toast({ title: '保存失败', message: error.message, type: 'error' });
        }
      });
    });
  }

  container.querySelector('[data-curseforge-key]')?.addEventListener('change', async (event) => {
    try {
      await ctx.saveSettings({ curseForgeApiKey: event.target.value.trim() });
      toast({ title: 'CurseForge API Key 已保存' });
    } catch (error) {
      toast({ title: '保存失败', message: error.message, type: 'error' });
    }
  });
  container.querySelector('[data-java-refresh]').addEventListener('click', refreshJavaList);
  container.querySelector('[data-java-install]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = '<span class="spinner" style="width:11px;height:11px"></span> 下载中';
    try {
      const result = await ctx.api.installJava(21);
      await ctx.saveSettings({ javaPath: result.path });
      toast({ title: 'Java 已安装', message: result.path, duration: 6000 });
      ctx.rerender();
    } catch (error) {
      button.disabled = false;
      button.innerHTML = `${icon('download', 11)} 自动安装 Java 21`;
      toast({ title: 'Java 安装失败', message: error.message, type: 'error', duration: 7000 });
    }
  });
  container.querySelector('[data-java-browse]').addEventListener('click', async () => {
    try {
      const result = await ctx.api.chooseFile({
        title: '选择 Java 可执行文件',
        filters: [{ name: 'Java', extensions: ['exe'] }, { name: '所有文件', extensions: ['*'] }],
      });
      if (!result.canceled && result.path) {
        await ctx.saveSettings({ javaPath: result.path });
        container.querySelector('[data-java-path]').value = result.path;
        toast({ title: 'Java 路径已保存' });
      }
    } catch (error) {
      toast({ title: '选择失败', message: error.message, type: 'error' });
    }
  });

  refreshJavaList();
}
