import { icon } from './icons.js';
import { openModal, toast, confirmDialog, setAvatar } from './components.js';
import { escapeHtml, plainText, formatNumber, formatDate, formatPlayTime, relativeTime } from './utils.js';

const LOADER_META = {
  vanilla: { label: '原版', desc: '原汁原味的 Minecraft' },
  fabric: { label: 'Fabric', desc: '轻量 · 更新快 · 生态活跃' },
  forge: { label: 'Forge', desc: '经典 · 大型整合包首选' },
  neoforge: { label: 'NeoForge', desc: 'Forge 社区的新分支' },
  quilt: { label: 'Quilt', desc: 'Fabric 的开放分支' },
};

const LOADER_LABELS = { fabric: 'Fabric', forge: 'Forge', quilt: 'Quilt', vanilla: '原版', neoforge: 'NeoForge' };
const CATEGORY_LABELS = {
  adventure: '冒险', optimization: '优化', technology: '科技', magic: '魔法', combat: '战斗',
  quests: '任务', library: '前置', utility: '实用', worldgen: '地形', mobs: '生物',
  visual: '视觉', lightweight: '轻量', multiplayer: '多人', rpg: '角色扮演', furniture: '装饰',
  storage: '存储', equipment: '装备', food: '食物', management: '管理', transportation: '交通',
  challenging: '挑战', 'kitchen-sink': '综合', pvp: 'PvP', parkour: '跑酷', building: '建筑',
  decoration: '装饰', economy: '经济', 'game-mechanics': '机制', datapack: '数据包',
};

async function getLatestRelease(api) {
  const data = await api.listVersions();
  return data.latest?.release || data.versions.find((item) => item.type === 'release')?.id || data.versions[0]?.id;
}

export async function openLatestInstall(ctx) {
  await openInstallModal(ctx, {});
}

export async function openInstallModal(ctx, options = {}) {
  const selected = {
    loader: LOADER_META[options.loader] ? options.loader : 'vanilla',
    loaderVersion: '',
  };
  let mcVersion = options.mcVersion || '';
  let versionType = options.type || 'release';
  let allVersions = null;
  let latest = null;
  let loadersData = null;
  let versionsLoading = true;
  let loadersLoading = false;
  let installing = false;
  let instanceName = '';
  let installToken = 0;

  const modal = openModal({
    title: '安装 Minecraft',
    subtitle: '选择任意正式版或快照，再决定加载器',
    size: 'modal-md',
    body: `<div class="loading-block"><span class="spinner"></span> 正在获取 Minecraft 版本列表…</div>`,
    footer: `<span class="foot-note">游戏文件会安装到当前游戏目录</span>
      <button class="btn btn-secondary btn-sm" data-modal-close>取消</button>
      <button class="btn btn-primary btn-sm" data-install disabled>开始安装</button>`,
    onMount: (root) => {
      root.addEventListener('click', async (event) => {
        const browseButton = event.target.closest('[data-browse-versions]');
        if (browseButton) {
          modal.close();
          ctx.navigate('versions', { versionTab: 'library' });
          return;
        }
        const retryButton = event.target.closest('[data-retry-versions]');
        if (retryButton) {
          loadVersions();
          return;
        }
        const loaderCard = event.target.closest('[data-loader]');
        if (loaderCard) {
          selected.loader = loaderCard.dataset.loader;
          const group = loadersData?.[selected.loader];
          selected.loaderVersion = group?.recommended || group?.versions?.[0]?.version || '';
          renderLoaderSection();
          return;
        }
        const installButton = event.target.closest('[data-install]');
        if (installButton && !installing) {
          if (!mcVersion || versionsLoading || loadersLoading) return;
          installing = true;
          installButton.disabled = true;
          installButton.innerHTML = `<span class="spinner" style="width:13px;height:13px"></span> 正在准备`;
          const nameInput = root.querySelector('[data-instance-name]');
          const typedName = nameInput ? nameInput.value.trim() : instanceName;
          try {
            await ctx.api.startInstall({
              mcVersion,
              loader: selected.loader,
              loaderVersion: selected.loaderVersion,
              instanceName: typedName,
            });
            modal.close();
            toast({
              title: '已开始安装',
              message: `${mcVersion} · ${LOADER_META[selected.loader].label} 已加入下载队列`,
              type: 'info',
            });
          } catch (error) {
            installing = false;
            installButton.disabled = false;
            installButton.innerHTML = '开始安装';
            toast({ title: '启动安装失败', message: error.message, type: 'error' });
          }
        }
      });
      root.addEventListener('change', (event) => {
        if (event.target.matches('[data-mc-version]')) {
          mcVersion = event.target.value;
          versionType = allVersions?.find((item) => item.id === mcVersion)?.type || 'release';
          selected.loaderVersion = '';
          loadersData = null;
          const banner = root.querySelector('[data-banner-version]');
          if (banner) banner.textContent = `Minecraft ${mcVersion}`;
          updateVersionMeta();
          loadLoaders();
        }
      });
      root.addEventListener('input', (event) => {
        if (event.target.matches('[data-instance-name]')) instanceName = event.target.value;
      });
      setTimeout(() => loadVersions(), 0);
    },
  });

  function updateVersionMeta() {
    if (!modal.root) return;
    const meta = allVersions?.find((item) => item.id === mcVersion);
    const countEl = modal.root.querySelector('[data-version-count]');
    if (countEl) countEl.textContent = allVersions ? `共 ${allVersions.length} 个版本可选` : '';
    const dateEl = modal.root.querySelector('[data-version-date]');
    if (dateEl) {
      dateEl.textContent = meta ? `${meta.type === 'release' ? '正式版' : meta.type === 'snapshot' ? '快照' : meta.type} · ${new Date(meta.releaseTime).toLocaleDateString('zh-CN')}` : '';
    }
    const typeBadge = modal.root.querySelector('[data-version-badge]');
    if (typeBadge) typeBadge.textContent = versionType === 'release' ? '正式版' : '快照';
    const nameInput = modal.root.querySelector('[data-instance-name]');
    if (nameInput) nameInput.placeholder = `${mcVersion} · ${LOADER_META[selected.loader].label}`;
    const installButton = modal.footer?.querySelector('[data-install]');
    if (installButton) {
      installButton.disabled = versionsLoading || loadersLoading || !loadersData || (selected.loader !== 'vanilla' && !selected.loaderVersion);
    }
  }

  function selectOptions() {
    if (!allVersions) return '';
    const releases = allVersions.filter((item) => item.type === 'release');
    const snapshots = allVersions.filter((item) => item.type !== 'release');
    const option = (item) =>
      `<option value="${escapeHtml(item.id)}" ${item.id === mcVersion ? 'selected' : ''}>${escapeHtml(item.id)} · ${new Date(item.releaseTime).toLocaleDateString('zh-CN')}</option>`;
    return `<optgroup label="正式版">${releases.map(option).join('')}</optgroup>
      ${snapshots.length ? `<optgroup label="快照 / 旧版本">${snapshots.map(option).join('')}</optgroup>` : ''}`;
  }

  function renderLoading(message) {
    modal.body.innerHTML = `<div class="loading-block"><span class="spinner"></span> ${escapeHtml(message)}</div>`;
  }

  function renderVersionError(error) {
    modal.body.innerHTML = `
      <div class="notice warn">${icon('alert-triangle', 15)}<span>无法获取 Minecraft 版本列表：${escapeHtml(error.message)}<br>请检查网络连接，或在设置中切换下载源后重试。</span></div>
      <div style="margin-top:14px;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" data-retry-versions>${icon('refresh', 13)} 重试</button>
        <button class="btn btn-ghost btn-sm" data-browse-versions>${icon('layers', 13)} 前往版本库</button>
      </div>
    `;
    const button = modal.footer?.querySelector('[data-install]');
    if (button) button.disabled = true;
  }

  function renderForm() {
    modal.body.innerHTML = `
      <div class="install-layout">
        <div class="field">
          <div class="field-label">
            <span>Minecraft 版本</span>
            <button class="section-link" data-browse-versions>浏览全部版本 ${icon('arrow-right', 11)}</button>
          </div>
          <div class="select-wrap">
            <select class="select" data-mc-version>${selectOptions()}</select>
            ${icon('chevron-down', 13)}
          </div>
          <div class="field-hint" style="display:flex;justify-content:space-between;gap:10px">
            <span data-version-count>${allVersions ? `共 ${allVersions.length} 个版本可选` : ''}</span>
            <span data-version-date></span>
          </div>
        </div>
        <div class="install-version-banner">
          <div class="install-version-mark">${icon('cube', 22)}</div>
          <div>
            <strong data-banner-version>Minecraft ${escapeHtml(mcVersion)}</strong>
            <span>Java 版 · 版本隔离 · 独立 mods / 存档 · 默认使用 ${ctx.state.settings.memoryMb / 1024} GB 内存</span>
          </div>
          <span class="badge badge-accent" data-version-badge style="margin-left:auto">${versionType === 'release' ? '正式版' : '快照'}</span>
        </div>
        <div data-loader-section>
          <div class="loading-block" style="padding:24px"><span class="spinner"></span> 正在获取加载器版本…</div>
        </div>
        <div class="install-form-row">
          <div class="field">
            <div class="field-label">实例名称 <span class="field-hint" style="font-weight:400">可选</span></div>
            <input class="input" data-instance-name maxlength="64" value="${escapeHtml(instanceName)}" placeholder="${escapeHtml(mcVersion)} · ${LOADER_META[selected.loader].label}">
          </div>
          <div class="field">
            <div class="field-label">下载源</div>
            <input class="input" value="${ctx.state.settings.downloadSource === 'official' ? 'Mojang 官方' : 'BMCLAPI 镜像'}" disabled>
          </div>
        </div>
        <div class="notice">
          ${icon('info', 15)}
          <span>首次安装会下载游戏核心、依赖与资源文件。实际大小取决于版本，通常为 250–500 MB。${selected.loader === 'forge' ? ' Forge 安装器会在下载完成后自动运行。' : ''}${selected.loader !== 'vanilla' ? ' 如果加载器没有列出可用版本，可以回到原版安装或更换游戏版本。' : ''}</span>
        </div>
        <div class="install-summary">
          <span>正在安装 <strong>${escapeHtml(mcVersion)}</strong></span>
          <span>Java 路径 <strong>${ctx.state.settings.javaPath ? '自定义' : '自动检测'}</strong></span>
        </div>
      </div>
    `;
    const select = modal.body.querySelector('[data-mc-version]');
    select.value = mcVersion;
    updateVersionMeta();
    renderLoaderSection();
  }

  function loaderVersionOptions() {
    if (!loadersData) return '';
    const group = loadersData[selected.loader];
    const list = group?.versions || [];
    if (!list.length) return '<option value="">暂无可用版本</option>';
    return list
      .map((item) => `<option value="${escapeHtml(item.version)}" ${item.version === selected.loaderVersion ? 'selected' : ''}>${escapeHtml(item.version)}${item.stable ? ' · 推荐' : ''}</option>`)
      .join('');
  }

  function renderLoaderSection() {
    const section = modal.root?.querySelector('[data-loader-section]');
    if (!section) return;
    if (loadersLoading) {
      section.innerHTML = `<div class="loading-block" style="padding:24px"><span class="spinner"></span> 正在获取 ${escapeHtml(mcVersion)} 的加载器列表…</div>`;
      updateVersionMeta();
      return;
    }
    section.innerHTML = `
      <div class="field">
        <div class="field-label">选择模组加载器</div>
        <div class="loader-grid">
          ${Object.entries(LOADER_META)
            .map(
              ([key, meta]) => `<button class="loader-card ${selected.loader === key ? 'active' : ''}" data-loader="${key}" type="button">
                <span class="loader-dot"></span>
                <strong>${meta.label}</strong>
                <span>${meta.desc}</span>
              </button>`,
            )
            .join('')}
        </div>
      </div>
      <div class="install-form-row" style="margin-top:-4px">
        <div class="field">
          <div class="field-label">加载器版本</div>
          ${
            selected.loader === 'vanilla'
              ? '<input class="input" value="无需加载器" disabled>'
              : `<div class="select-wrap"><select class="select" data-loader-version ${loadersData ? '' : 'disabled'}>${loaderVersionOptions()}</select>${icon('chevron-down', 13)}</div>`
          }
        </div>
        <div class="field">
          <div class="field-label">加载器状态</div>
          <input class="input" value="${!loadersData ? '加载失败，可安装原版' : selected.loader !== 'vanilla' && !selected.loaderVersion ? '该版本暂无此加载器' : '可用'}" disabled>
        </div>
      </div>
    `;
    const select = section.querySelector('[data-loader-version]');
    if (select) {
      select.value = selected.loaderVersion;
      select.addEventListener('change', () => {
        selected.loaderVersion = select.value;
        updateVersionMeta();
      });
    }
    updateVersionMeta();
  }

  async function loadLoaders() {
    if (!mcVersion) return;
    const token = ++installToken;
    loadersLoading = true;
    renderLoaderSection();
    try {
      const data = await ctx.api.getLoaders(mcVersion);
      if (token !== installToken) return;
      loadersData = data;
      if (selected.loader !== 'vanilla') {
        const group = loadersData[selected.loader];
        selected.loaderVersion = group?.recommended || group?.versions?.[0]?.version || '';
      }
    } catch (error) {
      if (token !== installToken) return;
      loadersData = { vanilla: { versions: [{ version: '' }], recommended: '' } };
      selected.loader = 'vanilla';
      toast({ title: '加载器列表获取失败', message: '仍可安装原版游戏', type: 'error' });
    }
    if (token !== installToken) return;
    loadersLoading = false;
    renderLoaderSection();
  }

  async function loadVersions() {
    versionsLoading = true;
    renderLoading('正在获取 Minecraft 版本列表…');
    try {
      let data = ctx.state.versionCache;
      if (!data) {
        data = await ctx.api.listVersions();
        ctx.state.versionCache = data;
      }
      allVersions = data.versions || [];
      latest = data.latest || latest;
      if (!mcVersion || !allVersions.some((item) => item.id === mcVersion)) {
        mcVersion = latest?.release || allVersions.find((item) => item.type === 'release')?.id || allVersions[0]?.id;
      }
      versionType = allVersions.find((item) => item.id === mcVersion)?.type || 'release';
      versionsLoading = false;
      renderForm();
      await loadLoaders();
    } catch (error) {
      versionsLoading = false;
      renderVersionError(error);
    }
  }
}

export function openAccountModal(ctx) {
  const { player, activeSkin } = ctx.state;
  const accountState = ctx.state.account || { mode: 'offline', account: null };
  const microsoft = accountState.mode === 'microsoft' && accountState.account;
  const currentName = microsoft ? accountState.account.name : player.name;
  const uuid = microsoft ? accountState.account.uuid : '';
  const modeLabel = microsoft ? 'Microsoft 正版账户' : '离线账户';
  const modal = openModal({
    title: '账户与角色',
    subtitle: microsoft ? '正版账户已连接，可用于正版服务器与官方皮肤' : '离线账户无需登录，适合单人与局域网游戏',
    size: 'modal-md',
    body: `
      <div class="account-preview ${microsoft ? 'microsoft' : ''}">
        <div class="account-avatar-lg" data-account-avatar></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:7px">
            <strong data-account-name>${escapeHtml(currentName)}</strong>
            ${microsoft ? '<span class="account-verified">正版</span>' : ''}
          </div>
          <span>${modeLabel}${uuid ? ` · ${escapeHtml(uuid.slice(0, 8))}…` : ` · ${escapeHtml(activeSkin?.name || '默认皮肤')}`}</span>
        </div>
        ${microsoft ? `<div class="ms-logo ms-logo-sm">${microsoftLogo()}</div>` : ''}
      </div>

      ${
        microsoft
          ? `<div class="notice">${icon('shield', 15)}<span>启动游戏时会使用该 Microsoft 账户完成 Xbox Live 验证。正版服务器、官方皮肤与披风会正常工作。</span></div>
            <div class="account-actions">
              <button class="btn btn-secondary btn-sm" data-ms-login>${icon('refresh', 13)} 重新登录</button>
              <button class="btn btn-ghost btn-sm" data-ms-logout>${icon('logout', 13)} 退出正版账户</button>
            </div>`
          : `<div class="ms-login-card">
              <div class="ms-logo">${microsoftLogo()}</div>
              <div class="ms-login-copy">
                <strong>使用 Microsoft 账户登录</strong>
                <span>加入正版服务器，自动使用你的官方皮肤与披风。</span>
              </div>
              <button class="btn btn-primary btn-sm" data-ms-login>登录</button>
            </div>
            <div class="account-or"><span>或者继续使用离线账户</span></div>
            <div class="field">
              <div class="field-label">离线游戏内用户名</div>
              <input class="input" data-player-name maxlength="16" value="${escapeHtml(player.name)}" autocomplete="off" spellcheck="false">
              <div class="field-hint">3–16 位，仅支持英文字母、数字与下划线。离线 UUID 会根据用户名在本地生成。</div>
              <div class="field-hint" data-name-error style="color:#c43a48"></div>
            </div>
            <div class="notice" style="margin-top:14px">
              ${icon('info', 15)}
              <span>离线模式适合单人游戏与局域网联机。需要正版验证的服务器无法加入。</span>
            </div>`
      }
    `,
    footer: `<button class="btn btn-secondary btn-sm" data-goto-skin>${icon('shirt', 13)} 皮肤工坊</button>
      <span class="foot-note">${microsoft ? '账户令牌只保存在本机' : '正版登录需要能访问 Microsoft 与 Xbox Live 的网络'}</span>
      <button class="btn btn-secondary btn-sm" data-modal-close>${microsoft ? '完成' : '取消'}</button>
      ${microsoft ? '' : '<button class="btn btn-primary btn-sm" data-save>保存离线角色</button>'}`,
  });
  const avatar = modal.root.querySelector('[data-account-avatar]');
  setAvatar(avatar, activeSkin?.dataUrl);
  const input = modal.root.querySelector('[data-player-name]');
  if (input) {
    input.focus();
    input.select();
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') modal.root.querySelector('[data-save]')?.click();
    });
  }
  modal.root.querySelector('[data-goto-skin]').addEventListener('click', () => {
    modal.close();
    ctx.navigate('skins');
  });

  const saveButton = modal.root.querySelector('[data-save]');
  saveButton?.addEventListener('click', async () => {
    const name = input.value.trim();
    const errorEl = modal.root.querySelector('[data-name-error]');
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
      errorEl.textContent = '用户名需要 3–16 位，且只能包含英文字母、数字和下划线。';
      input.focus();
      return;
    }
    try {
      const result = await ctx.api.updatePlayer({ name });
      ctx.applyBootstrap(result);
      modal.close();
      ctx.rerender?.();
      toast({ title: '离线角色已更新', message: `游戏内用户名：${name}` });
    } catch (error) {
      errorEl.textContent = error.message;
    }
  });

  async function beginMicrosoftLogin(button) {
    if (button) {
      button.disabled = true;
      button.innerHTML = `<span class="spinner" style="width:13px;height:13px"></span> 正在打开`;
    }
    const login = openModal({
      title: '登录 Microsoft',
      subtitle: '安全登录 · TYCL 不会接触你的密码',
      size: '',
      closeOnBackdrop: false,
      body: `
        <div class="ms-waiting">
          <div class="ms-logo ms-logo-lg">${microsoftLogo()}</div>
          <div class="spinner" style="width:22px;height:22px"></div>
          <strong>请在登录窗口中完成 Microsoft 登录</strong>
          <p>登录窗口已经打开。完成账户验证后会自动返回 TYCL，请稍候…</p>
          <div class="notice" style="width:100%;text-align:left">
            ${icon('shield', 15)}
            <span>登录页由 Microsoft 官方提供。验证码、密码等信息不会经过 TYCL 的服务器。账户令牌仅保存在本机。</span>
          </div>
        </div>
      `,
      footer: `<button class="btn btn-secondary btn-sm" data-cancel-login>取消登录</button>`,
    });
    login.root.querySelector('[data-cancel-login]').addEventListener('click', async () => {
      await ctx.api.cancelMicrosoftLogin?.();
      login.close();
      if (button) {
        button.disabled = false;
        button.innerHTML = '登录';
      }
    });
    try {
      const result = await ctx.api.microsoftLogin();
      login.close();
      ctx.applyBootstrap(result);
      modal.close();
      toast({ title: 'Microsoft 登录成功', message: `欢迎回来，${result.account?.account?.name || result.account?.name || ''}` });
      ctx.rerender?.();
    } catch (error) {
      if (/取消|关闭/.test(error.message || '')) {
        login.close();
        if (button) {
          button.disabled = false;
          button.innerHTML = '登录';
        }
        return;
      }
      login.body.innerHTML = `
        <div class="page-error" style="padding:24px 0">
          ${icon('alert-triangle', 32)}
          <strong>登录失败</strong>
          <span style="max-width:360px">${escapeHtml(error.message || '请稍后重试')}</span>
          <div class="notice warn" style="margin-top:8px;width:100%;text-align:left">${icon('info', 15)}<span>请确认网络可以访问 login.live.com 与 xboxlive.com。也可以尝试在设置中更换 Microsoft Client ID。</span></div>
        </div>`;
      login.footer.innerHTML = `<button class="btn btn-secondary btn-sm" data-close>关闭</button>`;
      login.footer.querySelector('[data-close]').addEventListener('click', () => login.close());
      if (button) {
        button.disabled = false;
        button.innerHTML = '登录';
      }
    }
  }

  modal.root.querySelectorAll('[data-ms-login]').forEach((button) => {
    button.addEventListener('click', () => beginMicrosoftLogin(button));
  });
  modal.root.querySelector('[data-ms-logout]')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: '退出 Microsoft 账户',
      message: '退出后将切换为离线账户。保存在本机的登录令牌会被清除，需要重新登录才能再次使用正版服务器。',
      confirmText: '退出登录',
      danger: true,
    });
    if (!confirmed) return;
    try {
      const result = await ctx.api.logoutMicrosoft();
      ctx.applyBootstrap(result);
      modal.close();
      ctx.rerender?.();
      toast({ title: '已退出正版账户', message: '当前使用离线账户' });
    } catch (error) {
      toast({ title: '退出失败', message: error.message, type: 'error' });
    }
  });
  input?.focus();
}

function microsoftLogo() {
  return '<span></span><span></span><span></span><span></span>';
}

let promptedUpdateVersion = '';

export function openAvailableUpdatePrompt(ctx, result) {
  const latest = result?.latestVersion;
  if (!latest || promptedUpdateVersion === latest) return;
  promptedUpdateVersion = latest;
  if (document.querySelector('#modal-root .modal')) {
    toast({ title: `发现新版本 v${latest}`, message: '打开右上角更新公告即可安装。', type: 'info' });
    return;
  }
  const manifest = result.manifest || {};
  const notes = String(manifest.notes || '包含最新修复与改进。')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const modal = openModal({
    title: `发现新版本 v${latest}`,
    subtitle: `当前版本 v${result.currentVersion} · 更新会自动完成，不需要重新下载整个启动器`,
    size: 'modal-md',
    body: `
      <div class="update-hero" style="margin-bottom:14px">
        <div class="update-hero-icon">${icon('cloud-download', 24)}</div>
        <div style="flex:1">
          <strong>TYCL v${escapeHtml(latest)} 已准备好</strong>
          <span>${manifest.size ? `${Math.max(1, Math.round(manifest.size / 1024 / 1024))} MB · ` : ''}应用内更新 · 自动重启</span>
        </div>
        <span class="badge badge-accent">NEW</span>
      </div>
      <div class="release-card latest" style="margin-bottom:12px">
        <div class="release-head">
          <div><span class="release-version">v${escapeHtml(latest)}</span><strong>本次更新</strong></div>
          <span class="release-date">${escapeHtml(String(manifest.publishedAt || '').slice(0, 10).replaceAll('-', '.'))}</span>
        </div>
        <ul>${notes.slice(0, 8).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      </div>
      <div class="notice">${icon('info', 15)}<span data-update-prompt-status>下载完成后 TYCL 会自动退出、替换应用资源并重新打开。</span></div>
    `,
    footer: `<button class="btn btn-secondary btn-sm" data-modal-close>稍后</button>
      <button class="btn btn-ghost btn-sm" data-open-update-notes>更新公告</button>
      <button class="btn btn-primary btn-sm" data-update-now>${icon('download', 13)} 下载并安装</button>`,
  });

  modal.root.querySelector('[data-open-update-notes]')?.addEventListener('click', () => {
    modal.close();
    openUpdatesModal(ctx);
  });

  const button = modal.root.querySelector('[data-update-now]');
  const status = modal.root.querySelector('[data-update-prompt-status]');
  button?.addEventListener('click', async () => {
    if (!manifest.downloadUrl) {
      if (status) status.textContent = '这个更新源没有提供下载地址，请打开更新公告手动处理。';
      toast({ title: '无法自动下载更新', message: '更新清单没有 downloadUrl', type: 'error' });
      return;
    }
    button.disabled = true;
    button.innerHTML = `<span class="spinner" style="width:12px;height:12px"></span> 正在下载`;
    if (status) status.textContent = '正在下载更新包，请保持网络连接…';
    try {
      const prepared = await ctx.api.downloadUpdate({
        url: manifest.downloadUrl,
        sha256: manifest.sha256,
      });
      if (status) status.textContent = '下载完成，正在重启并安装…';
      toast({ title: '更新已下载', message: 'TYCL 即将重启完成安装' });
      await ctx.api.installUpdate({ packagePath: prepared.packagePath });
    } catch (error) {
      button.disabled = false;
      button.innerHTML = `${icon('download', 13)} 重试下载`;
      if (status) status.textContent = `更新失败：${error.message}`;
      toast({ title: '更新失败', message: error.message, type: 'error', duration: 7000 });
    }
  });
}

export function openUpdatesModal(ctx) {
  const version = ctx.state.system?.appVersion || '1.3.4';
  const releases = [
    {
      version: '1.3.4',
      date: '2026.10.25',
      title: '实例交互 · 3D 回退 · 稳定性',
      items: [
        '点击游戏库实例卡片直接打开实例管理，弹窗加宽到 1120px。',
        '3D 皮肤预览失败时自动切换为静态皮肤，不再让页面报错。',
        '联机高级设置、白名单、端口避让和 Mod 指纹校验。',
        'Mod 哈希延迟计算，减少打开实例时的卡顿。',
      ],
    },
    {
      version: '1.3.3',
      date: '2026.10.25',
      title: '联机稳定性 · 性能优化',
      items: [
        '联机房间加入白名单、正版验证、人数、视距和难度高级设置。',
        '自动避让被占用的服务端端口，房间使用实际端口。',
        '服务端 Mod 指纹写入 MOTD，客户端进房前自动检查 Mod 是否一致。',
        'Mod 列表不再在打开实例时同步计算哈希，降低卡顿；只在检查更新时计算。',
        '联机页轮询降低频率，服务端状态与日志分离刷新。',
      ],
    },
    {
      version: '1.3.2',
      date: '2026.10.25',
      title: '资源管理 · NeoForge · 联机修复',
      items: [
        '修复 Microsoft 正版皮肤透明：统一使用 HTTPS 纹理并启动时缓存官方皮肤。',
        '联机加入兼容旧版本，1.20 以下使用 legacy 直连参数。',
        '实例管理新增材质包、光影包、地图的查看、导入和删除。',
        '设置新增独立自动检查更新开关，以及自动安装 Java 21。',
        '资源中心接入 CurseForge，可在设置填写 API Key 后搜索并安装 Mod。',
        '安装器加载器列表支持 NeoForge。',
      ],
    },
    {
      version: '1.3.1',
      date: '2026.10.25',
      title: '自动服务端 · 房间号',
      items: [
        '联机页重做为房间中心：房间号大号显示，一键复制、加入和关闭。',
        '新增自动开服：启动器下载服务端、生成 EULA 与 server.properties，并启动本地服务端。',
        '服务端自动过滤客户端专用 Mod，只把服务端 Mod 复制到服务端目录。',
        '开房后可直接进入自己的房间，朋友输入房间号即可连接。',
        '提示消息改为居中显示，房间状态、服务端日志和 Mod 过滤结果集中展示。',
      ],
    },
    {
      version: '1.3.0',
      date: '2026.10.25',
      title: '联机中心',
      items: [
        '新增联机页面：一键开启公网房间，朋友通过地址直接进入。',
        '内置开源隧道组件 bore，不需要路由器端口映射。',
        '自动发现同一局域网内开放的 Minecraft 世界。',
        '服务器收藏、玩家数、延迟、MOTD 状态检测与一键进入。',
        '启动游戏时使用 Minecraft quickPlay 直接连接服务器。',
      ],
    },
    {
      version: '1.2.1',
      date: '2026.10.25',
      title: '正版皮肤显示修复',
      items: [
        'Microsoft 正版账户登录后会自动读取并缓存官方皮肤。',
        '启动器头像、皮肤工坊和 3D 预览会显示正版皮肤，不再回退到本地默认皮肤。',
        '自动识别正版皮肤的经典 / 纤细模型，并标记为 Microsoft 正版。',
      ],
    },
    {
      version: '1.2.0',
      date: '2026.10.25',
      title: '实例管理 · 下载续传 · 稳定分发',
      items: [
        '下载队列支持暂停、继续与断点续传，失败文件会单独重试。',
        '下载源增加测速，自动比较 BMCLAPI、Mojang 与 Modrinth。',
        '新增实例管理：备份、导出、导入、恢复、一键修复。',
        '每个实例可单独设置 Java 路径与内存，不再共用全局配置。',
        'Mods 页面支持启用/禁用、删除、更新检查和冲突提示。',
        '存档与截图集中管理，单个存档可独立备份。',
        '整合包实例支持直接更新新版本，不必重新创建实例。',
        '更新设置新增稳定版 / 测试版通道。',
      ],
    },
    {
      version: '1.1.7',
      date: '2026.10.25',
      title: '标题栏图标点击修复',
      items: [
        '增大左上角 TYCL 图标的可点击区域，更容易点中。',
        '阻止图标区域的双击事件传给标题栏，连续点击时不会误最大化窗口。',
      ],
    },
    {
      version: '1.1.6',
      date: '2026.10.25',
      title: '诊断 · 下载队列 · 体验修复',
      items: [
        '修复皮肤工坊 3D 底座与人物不随视角同步的问题。',
        '新闻详情可在应用内查看简介，并加入醒目的中文翻译按钮。',
        'Mod 与整合包详情汉化按钮加粗放大，更容易找到。',
        '版本隔离默认开启：每个实例独立 mods、存档、资源包和日志。',
        '新增启动诊断和崩溃分析，游戏异常退出时自动检查最近日志与崩溃报告。',
        '顶部栏新增下载队列和红点数量提示，可查看安装、Mod、整合包进度。',
        '更新完成后第一次进入会自动展示本次更新内容。',
        '提高游戏资源下载并发数，并在任务中显示下载速度。',
      ],
    },
    {
      version: '1.1.5',
      date: '2026.10.25',
      title: 'Windows 安装器 · 自动更新提示',
      items: [
        '新增 Windows 安装器，安装后自动创建开始菜单、桌面快捷方式和卸载入口。',
        '每次启动自动检查更新，发现新版本时直接弹窗提示，可一键下载并安装。',
        '重做更新服务器首页，加入安装器下载、版本信息和更新说明。',
      ],
    },
    {
      version: '1.1.4',
      date: '2026.10.25',
      title: 'Mod 详情 · 一键汉化',
      items: [
        'Mod 与整合包详情页新增「汉化」按钮，点击即可翻译项目标题与介绍。',
        '翻译结果由 Google / MyMemory 提供，并针对 Fabric、Loader、原版等 Minecraft 术语做了修正。',
        '点击「原文」即可恢复官方英文介绍，翻译内容不会修改本地文件。',
        '修复更新重启后偶发卡在启动动画、需要强制结束进程的问题；更新后的首次启动会跳过动画并清理渲染缓存。',
      ],
    },
    {
      version: '1.1.3',
      date: '2026.10.25',
      title: '更新检查 · 代理网络修复',
      items: [
        '更新检查和更新包下载改用 Electron 网络栈，自动跟随系统代理。',
        '修复开启代理后检查更新超时、无法下载更新包的问题。',
        '更新清单仍使用 no-cache 请求，避免拿到旧版本信息。',
      ],
    },
    {
      version: '1.1.2',
      date: '2026.10.25',
      title: '开箱即用的更新源',
      items: [
        '内置 TYCL 官方更新源，安装后会自动检查新版本，不再需要手动填写地址。',
        '设置页仍可修改或清空更新源，方便使用自己的服务器。',
        '启动后的后台更新检查更安静，不会打断正在进行的操作。',
      ],
    },
    {
      version: '1.1.1',
      date: '2026.10.25',
      title: '新闻中心 · 设置排版 · 动效优化',
      items: [
        '新增 Minecraft 官方新闻中心，可浏览、筛选和搜索全部官方消息。',
        '优化设置页双栏排版，移除外观卡片下方多余的空白区域。',
        '移除侧栏重复的更新公告入口，保留右上角喇叭入口。',
        '重新调整页面进入、卡片悬停与新闻加载动效，整体更轻盈顺滑。',
        '减少冗余动画并适配系统“减少动态效果”设置。',
      ],
    },
    {
      version: '1.1.0',
      date: '2026.10.25',
      title: '正版登录 · 本地更新 · 新版本选择',
      items: [
        '新增 Microsoft 正版登录，支持正版服务器、官方皮肤与正版验证。',
        '下载游戏弹窗可直接选择任意正式版、快照或旧版本，不再局限于最新版。',
        '新增 TY 启动动画、更新公告与制作者信息。',
        '支持应用内导入更新包或从更新源检查更新，无需重新下载整个启动器。',
        '修复加载器列表与版本列表的兼容细节，启动前会自动清理错误的 natives。',
      ],
    },
    {
      version: '1.0.0',
      date: '2026.10.25',
      title: 'TYCL 首次发布',
      items: ['简洁白色界面与主题切换', 'Minecraft 下载、Forge / Fabric / Quilt 安装', 'Modrinth Mod 与整合包下载', '3D 皮肤预览与本地皮肤库'],
    },
  ];
  const list = releases
    .map(
      (release, index) => `<article class="release-card ${index === 0 ? 'latest' : ''}">
        <div class="release-head">
          <div>
            <span class="release-version">v${escapeHtml(release.version)}</span>
            <strong>${escapeHtml(release.title)}</strong>
          </div>
          <span class="release-date">${escapeHtml(release.date)}</span>
        </div>
        <ul>${release.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </article>`,
    )
    .join('');
  const modal = openModal({
    title: '更新公告',
    subtitle: `TYCL 当前版本 v${escapeHtml(version)} · 制作者 A3Y8`,
    size: 'modal-lg',
    body: `
      <div class="update-hero">
        <div class="update-hero-icon">${icon('megaphone', 24)}</div>
        <div style="flex:1">
          <strong>把资源、联机和 Java 都收进来。</strong>
          <span>TYCL 1.3.2 修复正版皮肤、加入资源管理、CurseForge 与 NeoForge。</span>
        </div>
        <span class="badge badge-accent">LATEST</span>
      </div>
      <div class="release-list">${list}</div>
      <div class="update-actions-card">
        <div class="update-actions-head">
          <div>
            <strong>软件更新</strong>
            <span data-update-status>可导入本地更新包，或在设置中配置更新源。</span>
          </div>
          <div style="display:flex;gap:7px;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" data-check-update>${icon('refresh', 13)} 检查更新</button>
            <button class="btn btn-primary btn-sm" data-import-update>${icon('upload', 13)} 导入更新包</button>
          </div>
        </div>
        <div data-update-progress></div>
      </div>
      <div class="feedback-card">
        <div class="feedback-icon">${icon('mail', 18)}</div>
        <div style="flex:1">
          <strong>发现问题？给 A3Y8 写封邮件</strong>
          <span>BUG 反馈与建议：<button class="inline-link" data-mail>tianyi76@yeah.net</button></span>
        </div>
        <button class="btn btn-ghost btn-sm" data-copy-mail>${icon('copy', 13)} 复制邮箱</button>
      </div>
    `,
    footer: `<button class="btn btn-secondary btn-sm" data-modal-close>关闭</button>`,
  });

  modal.root.querySelector('[data-mail]')?.addEventListener('click', () => ctx.api.openExternal?.('mailto:tianyi76@yeah.net'));
  modal.root.querySelector('[data-copy-mail]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('tianyi76@yeah.net');
      toast({ title: '邮箱已复制', message: 'tianyi76@yeah.net' });
    } catch {
      toast({ title: '复制失败', type: 'error' });
    }
  });
  const statusEl = modal.root.querySelector('[data-update-status]');
  const progressEl = modal.root.querySelector('[data-update-progress]');
  const setStatus = (text) => {
    if (statusEl) statusEl.textContent = text;
  };
  const showPreparedUpdate = (prepared, from = '本地更新包') => {
    progressEl.innerHTML = `
      <div class="update-ready">
        <div>
          <strong>更新包已准备就绪${prepared.version ? ` · v${escapeHtml(prepared.version)}` : ''}</strong>
          <span>来源：${escapeHtml(from)}。安装后 TYCL 会自动重启，旧版本会保留为 app.asar.bak。</span>
        </div>
        <button class="btn btn-primary btn-sm" data-install-update>安装并重启</button>
      </div>
    `;
    progressEl.querySelector('[data-install-update]').addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: '安装更新并重启',
        message: 'TYCL 将关闭并在后台替换应用资源，随后自动重新启动。请先保存正在进行的操作。',
        confirmText: '安装并重启',
      });
      if (!confirmed) return;
      try {
        await ctx.api.installUpdate({ packagePath: prepared.packagePath });
        toast({ title: '正在安装更新', message: 'TYCL 即将重启完成更新' });
      } catch (error) {
        toast({ title: '更新失败', message: error.message, type: 'error', duration: 7000 });
      }
    });
  };
  modal.root.querySelector('[data-check-update]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = `<span class="spinner" style="width:13px;height:13px"></span> 检查中`;
    progressEl.innerHTML = '';
    try {
      const result = await ctx.api.checkUpdates();
      if (result.hasUpdate) {
        setStatus(`发现新版本 v${result.latestVersion}`);
        progressEl.innerHTML = `
          <div class="update-ready">
            <div>
              <strong>发现新版本 v${escapeHtml(result.latestVersion)}</strong>
              <span>${escapeHtml(result.notes || '建议更新到最新版本以获得修复与新功能。')}</span>
            </div>
            <button class="btn btn-primary btn-sm" data-download-update>下载更新</button>
          </div>
        `;
        progressEl.querySelector('[data-download-update]').addEventListener('click', async (evt) => {
          const downloadButton = evt.currentTarget;
          if (!result.manifest?.downloadUrl) {
            toast({ title: '更新源没有提供下载地址', message: '请使用“导入更新包”，或在更新清单中填写 downloadUrl', type: 'info' });
            return;
          }
          downloadButton.disabled = true;
          downloadButton.innerHTML = `<span class="spinner" style="width:13px;height:13px"></span> 下载中`;
          try {
            const prepared = await ctx.api.downloadUpdate({ url: result.manifest.downloadUrl, sha256: result.manifest.sha256 });
            showPreparedUpdate(prepared, result.manifest.source || '更新源');
          } catch (error) {
            toast({ title: '下载更新失败', message: error.message, type: 'error' });
            downloadButton.disabled = false;
            downloadButton.innerHTML = '下载更新';
          }
        });
      } else if (result.error) {
        setStatus(result.error);
        progressEl.innerHTML = `<div class="notice warn" style="margin-top:12px">${icon('alert-triangle', 15)}<span>${escapeHtml(result.error)}</span></div>`;
      } else if (!result.configured) {
        setStatus('未配置更新源');
        progressEl.innerHTML = `<div class="notice" style="margin-top:12px">${icon('info', 15)}<span>还没有配置更新源。可以在“设置 → 更新与公告”填写 update.json 地址，或把 update.json 放在 TYCL.exe 同目录，也可以直接导入本地更新包。</span></div>`;
      } else {
        setStatus(`已经是最新版本 v${result.currentVersion}`);
        progressEl.innerHTML = `<div class="notice" style="margin-top:12px">${icon('check-circle', 15)}<span>当前版本已经是最新版本。</span></div>`;
      }
    } catch (error) {
      setStatus('检查更新失败：' + error.message);
    } finally {
      button.disabled = false;
      button.innerHTML = `${icon('refresh', 13)} 检查更新`;
    }
  });
  modal.root.querySelector('[data-import-update]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = `<span class="spinner" style="width:13px;height:13px"></span> 处理中`;
    try {
      const prepared = await ctx.api.chooseUpdatePackage();
      if (!prepared || prepared.canceled) return;
      setStatus('本地更新包已就绪');
      showPreparedUpdate(prepared, '本地更新包');
    } catch (error) {
      toast({ title: '无法导入更新包', message: error.message, type: 'error', duration: 6000 });
    } finally {
      button.disabled = false;
      button.innerHTML = `${icon('upload', 13)} 导入更新包`;
    }
  });
  if (ctx.state.settings.updateFeedUrl) setStatus('更新源已配置，可以检查更新。');
}


export function openAboutModal(ctx) {
  const version = ctx.state.system?.appVersion || '1.3.4';
  const modal = openModal({
    title: '关于 TYCL',
    subtitle: '简单、安静、刚刚好的 Minecraft 启动器',
    size: 'modal-md',
    body: `
      <div class="about-box">
        <div class="about-logo"><img src="./assets/icon-128.png" alt="TYCL"></div>
        <div>
          <div class="about-title">TYCL <span>LAUNCHER</span></div>
          <p class="about-desc">为每一次进入世界，保留一点仪式感。<br>游戏、Mod、整合包、正版登录与皮肤，都在一个干净的地方。</p>
        </div>
      </div>
      <div class="about-links">
        <button class="about-link" data-link="https://modrinth.com/minecraft">${icon('compass', 12)} Modrinth 资源</button>
        <button class="about-link" data-link="https://www.minecraft.net/">${icon('globe', 12)} Minecraft 官网</button>
        <button class="about-link" data-link="https://fabricmc.net/">${icon('loader', 12)} Fabric</button>
      </div>
      <div class="about-meta">
        <span>${icon('package', 11)} 版本 ${escapeHtml(version)}</span>
        <span>${icon('user', 11)} 制作者 A3Y8</span>
        <span>${icon('file-text', 11)} MIT License</span>
        <span>${icon('terminal', 11)} 基于开源组件构建</span>
      </div>
      <div class="feedback-card" style="margin-top:16px">
        <div class="feedback-icon">${icon('mail', 18)}</div>
        <div style="flex:1">
          <strong>BUG 反馈</strong>
          <span>遇到问题请发送邮件至 <button class="inline-link" data-feedback>tianyi76@yeah.net</button></span>
        </div>
        <button class="btn btn-ghost btn-sm" data-copy-feedback>${icon('copy', 13)} 复制</button>
      </div>
      <div class="notice" style="margin-top:16px">
        ${icon('sparkles', 15)}
        <span>TYCL 不隶属于 Mojang Studios 或 Microsoft。Minecraft 是 Mojang Studios 的商标。本启动器仅用于管理你已经拥有的游戏。</span>
      </div>
    `,
    footer: `<button class="btn btn-secondary btn-sm" data-open-updates>${icon('megaphone', 13)} 更新公告</button>
      <span class="foot-note">用 Minecraft 的方式，慢慢来。</span>
      <button class="btn btn-primary btn-sm" data-modal-close>好的</button>`,
  });
  modal.root.querySelectorAll('[data-link]').forEach((button) => {
    button.addEventListener('click', () => ctx.api.openExternal(button.dataset.link));
  });
  modal.root.querySelector('[data-feedback]').addEventListener('click', () => ctx.api.openExternal('mailto:tianyi76@yeah.net'));
  modal.root.querySelector('[data-copy-feedback]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('tianyi76@yeah.net');
      toast({ title: '反馈邮箱已复制' });
    } catch {
      toast({ title: '复制失败', type: 'error' });
    }
  });
  modal.root.querySelector('[data-open-updates]').addEventListener('click', () => {
    modal.close();
    openUpdatesModal(ctx);
  });
}

export async function openLogsModal(ctx, instance) {
  const modal = openModal({
    title: '启动日志',
    subtitle: instance ? instance.name : '最近的游戏日志',
    size: 'modal-lg',
    body: `<div class="loading-block"><span class="spinner"></span> 读取日志中…</div>`,
    footer: `<button class="btn btn-secondary btn-sm" data-copy>${icon('copy', 13)} 复制</button>
      <button class="btn btn-secondary btn-sm" data-open-folder>打开日志文件夹</button>
      <button class="btn btn-primary btn-sm" data-modal-close>关闭</button>`,
  });
  let content = '';
  try {
    const logs = await ctx.api.getLogs();
    content = (logs.lines || []).join('\n') || '暂无日志，启动一次游戏后会在这里显示。';
  } catch (error) {
    content = '读取日志失败：' + error.message;
  }
  modal.body.innerHTML = `<pre class="log-view">${escapeHtml(content)}</pre>`;
  modal.root.querySelector('[data-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast({ title: '日志已复制到剪贴板' });
    } catch {
      toast({ title: '复制失败', message: '系统剪贴板不可用', type: 'error' });
    }
  });
  modal.root.querySelector('[data-open-folder]').addEventListener('click', () => {
    const gameDir = ctx.state.settings.gameDir;
    ctx.api.openPath(gameDir + '\\logs').catch(() => {});
  });
}

export async function launchInstance(ctx, instance, button = null) {
  if (!instance) return;
  if (ctx.state.activeGame) {
    toast({
      title: '游戏已经在运行',
      message: ctx.state.activeGame.instanceId === instance.id ? '正在运行当前实例' : '请先关闭当前游戏',
      type: 'info',
    });
    return;
  }
  const oldHtml = button ? button.innerHTML : '';
  if (button) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner" style="width:13px;height:13px;border-color:rgba(255,255,255,.3);border-top-color:#fff"></span> 启动中`;
  }
  try {
    await ctx.api.startLaunch(instance.id);
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.innerHTML = oldHtml;
    }
    toast({ title: '启动失败', message: error.message, type: 'error' });
    setTimeout(() => ctx.openDiagnostics?.(instance, { crash: true }), 500);
  }
}

export async function openNewsDetail(ctx, entry) {
  if (!entry) return;
  let title = entry.title || 'Minecraft 新闻';
  let body = entry.text || '这条新闻暂时没有简介，可以点击下方“阅读原文”查看完整内容。';
  let translated = false;
  let translating = false;
  const date = String(entry.date || '').replaceAll('-', '.');
  const modal = openModal({
    title,
    subtitle: `Minecraft 官方新闻 · ${date}`,
    size: 'modal-lg',
    body: `
      <div class="news-detail-cover">
        ${entry.image ? `<img src="${escapeHtml(entry.image)}" alt="">` : ''}
        <div class="news-detail-cover-shade"></div>
        <span class="news-detail-badge">${icon('sparkles', 12)} ${escapeHtml(entry.category || 'Minecraft')}</span>
      </div>
      <div class="news-detail-meta">
        <span>${icon('calendar', 12)} ${escapeHtml(date)}</span>
        <span>${icon('wifi', 12)} Minecraft 官方</span>
      </div>
      <div class="news-detail-toolbar">
        <div>
          <strong>看不懂英文？</strong>
          <span>可以先把标题和简介翻译成中文。</span>
        </div>
        <div class="news-detail-actions">
          <button class="btn btn-primary btn-sm news-translate" data-news-translate>${icon('languages', 14)} 翻译成中文</button>
          <button class="btn btn-secondary btn-sm" data-news-original>${icon('external-link', 13)} 阅读原文</button>
        </div>
      </div>
      <h2 class="news-detail-title" data-news-title>${escapeHtml(title)}</h2>
      <div class="news-detail-text" data-news-text>${escapeHtml(body).replaceAll('\n', '<br>')}</div>
      <div class="translation-note" data-news-translation-note hidden>${icon('info', 12)} 机器翻译，仅供参考 · 点击「显示原文」恢复官方内容</div>
    `,
    footer: `<button class="btn btn-secondary btn-sm" data-modal-close>关闭</button>`,
  });

  const translateButton = modal.body.querySelector('[data-news-translate]');
  const originalButton = modal.body.querySelector('[data-news-original]');
  const titleEl = modal.body.querySelector('[data-news-title]');
  const textEl = modal.body.querySelector('[data-news-text]');
  const noteEl = modal.body.querySelector('[data-news-translation-note]');

  const update = () => {
    titleEl.textContent = title;
    textEl.innerHTML = escapeHtml(body).replaceAll('\n', '<br>');
    modal.root.querySelector('.modal-title').textContent = title;
    translateButton.innerHTML = translated
      ? `${icon('rotate', 14)} 显示原文`
      : `${icon('languages', 14)} 翻译成中文`;
    translateButton.classList.toggle('active', translated);
    noteEl.hidden = !translated;
  };

  originalButton?.addEventListener('click', () => {
    if (!entry.link) {
      toast({ title: '这条新闻没有外部链接', type: 'info' });
      return;
    }
    ctx.api.openExternal(entry.link);
  });

  translateButton?.addEventListener('click', async () => {
    if (translating) return;
    if (translated) {
      translated = false;
      title = entry.title || title;
      body = entry.text || body;
      update();
      return;
    }
    translating = true;
    translateButton.disabled = true;
    translateButton.innerHTML = `<span class="spinner" style="width:13px;height:13px"></span> 翻译中`;
    try {
      const payload = await ctx.api.translateTexts([entry.title, entry.text], 'zh-CN');
      if (!payload || !Array.isArray(payload.translations) || payload.translations.length < 2) {
        throw new Error('翻译返回结果不完整');
      }
      title = payload.translations[0] || entry.title;
      body = payload.translations[1] || entry.text;
      translated = true;
      update();
      toast({
        title: '新闻已翻译',
        message: payload.partial ? '部分内容保留原文' : `由 ${payload.provider || '机器翻译'} 提供，仅供参考`,
        type: 'info',
      });
    } catch (error) {
      translateButton.disabled = false;
      translateButton.innerHTML = `${icon('languages', 14)} 重试翻译`;
      toast({ title: '翻译失败', message: error.message, type: 'error', duration: 6000 });
    } finally {
      translating = false;
    }
  });

  update();
}

export async function openInstanceManager(ctx, instance) {
  if (!instance) return;
  const modal = openModal({
    title: '实例管理',
    subtitle: instance.name,
    size: 'modal-xl',
    className: 'instance-manager-modal',
    body: `<div class="loading-block"><span class="spinner"></span> 读取实例文件…</div>`,
    footer: `<button class="btn btn-secondary btn-sm" data-manager-folder>${icon('folder', 13)} 打开实例目录</button>
      <button class="btn btn-primary btn-sm" data-modal-close>关闭</button>`,
  });
  let data = null;
  let tab = 'overview';
  let updating = false;

  const formatSize = (bytes) => {
    const n = Number(bytes) || 0;
    if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    if (n > 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${n} B`;
  };

  const load = async () => {
    try {
      data = await ctx.api.getInstanceDetails(instance.id);
      render();
    } catch (error) {
      modal.body.innerHTML = `<div class="notice warn">${icon('alert-triangle', 15)}<span>读取失败：${escapeHtml(error.message)}</span></div>`;
    }
  };

  const tabs = () => [
    ['overview', '概览', 'layers'],
    ['mods', `Mods ${data.mods.mods.length ? `· ${data.mods.mods.length}` : ''}`, 'package'],
    ['worlds', '存档 / 截图', 'image'],
    ['resources', '资源包 / 光影', 'folder'],
    ['backups', '备份', 'harddrive'],
    ['settings', '设置', 'settings'],
  ];

  const bind = () => {
    modal.body.querySelectorAll('[data-manager-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        tab = button.dataset.managerTab;
        render();
      });
    });
    modal.root.querySelector('[data-manager-folder]').onclick = () => ctx.api.openPath(data?.instance?.gameDir || instance.gameDir);
    modal.body.querySelectorAll('[data-manager-folder]').forEach((button) => {
      button.addEventListener('click', () => ctx.api.openPath(data?.instance?.gameDir || instance.gameDir));
    });

    modal.body.querySelector('[data-manager-backup]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.innerHTML = '<span class="spinner" style="width:12px;height:12px"></span> 备份中';
      try {
        const result = await ctx.api.backupInstance(instance.id);
        toast({ title: '实例已备份', message: `${result.name} · ${formatSize(result.size)}` });
        data.backups = await ctx.api.listBackups();
        tab = 'backups';
        render();
      } catch (error) {
        button.disabled = false;
        button.textContent = '立即备份';
        toast({ title: '备份失败', message: error.message, type: 'error' });
      }
    });
    modal.body.querySelector('[data-manager-export]')?.addEventListener('click', async () => {
      try {
        const result = await ctx.api.exportInstance(instance.id);
        if (!result.cancelled) toast({ title: '实例已导出', message: result.file });
      } catch (error) {
        toast({ title: '导出失败', message: error.message, type: 'error' });
      }
    });
    modal.body.querySelector('[data-manager-import]')?.addEventListener('click', async () => {
      try {
        const result = await ctx.api.importInstance();
        if (result.cancelled) return;
        await ctx.refreshState();
        toast({ title: '实例已导入', message: result.instance?.name || '' });
        ctx.rerender();
        modal.close();
      } catch (error) {
        toast({ title: '导入失败', message: error.message, type: 'error' });
      }
    });
    modal.body.querySelector('[data-manager-repair]')?.addEventListener('click', async () => {
      try {
        await ctx.api.repairInstance(instance.id);
        toast({ title: '开始修复实例', message: '缺失的版本文件会在后台补全' });
        modal.close();
      } catch (error) {
        toast({ title: '修复失败', message: error.message, type: 'error' });
      }
    });
    modal.body.querySelector('[data-manager-modpack]')?.addEventListener('click', async () => {
      try {
        await ctx.api.updateModpack(instance.id);
        toast({ title: '开始更新整合包', message: '会在后台同步新版文件' });
        modal.close();
      } catch (error) {
        toast({ title: '更新失败', message: error.message, type: 'error' });
      }
    });
    modal.body.querySelectorAll('[data-mod-toggle]').forEach((button) => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await ctx.api.toggleMod(instance.id, button.dataset.modToggle, button.dataset.enabled !== 'true');
          await load();
          ctx.refreshState();
        } catch (error) {
          toast({ title: '操作失败', message: error.message, type: 'error' });
        }
      });
    });
    modal.body.querySelectorAll('[data-mod-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: '删除 Mod', message: button.dataset.modDelete, confirmText: '删除', danger: true });
        if (!ok) return;
        try {
          await ctx.api.deleteMod(instance.id, button.dataset.modDelete);
          await load();
          ctx.refreshState();
        } catch (error) {
          toast({ title: '删除失败', message: error.message, type: 'error' });
        }
      });
    });
    modal.body.querySelector('[data-mod-check]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.innerHTML = '<span class="spinner" style="width:12px;height:12px"></span> 检查中';
      try {
        const updates = await ctx.api.checkModUpdates(instance.id);
        data.modUpdates = updates;
        render();
        toast({ title: updates.length ? `发现 ${updates.length} 个 Mod 更新` : 'Mod 都是最新的', type: 'info' });
      } catch (error) {
        button.disabled = false;
        button.textContent = '检查更新';
        toast({ title: '检查失败', message: error.message, type: 'error' });
      }
    });
    modal.body.querySelectorAll('[data-mod-update]').forEach((button) => {
      button.addEventListener('click', async () => {
        const update = data.modUpdates.find((item) => item.file === button.dataset.modUpdate);
        if (!update) return;
        button.disabled = true;
        await ctx.api.installMod({ instanceId: instance.id, projectId: update.projectId, versionId: update.versionId, title: update.name });
        toast({ title: '开始更新 Mod', message: update.name });
      });
    });
    modal.body.querySelectorAll('[data-world-backup]').forEach((button) => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const result = await ctx.api.backupWorld(instance.id, button.dataset.worldBackup);
          toast({ title: '存档已备份', message: result.name });
          data.backups = await ctx.api.listBackups();
        } catch (error) {
          button.disabled = false;
          toast({ title: '备份失败', message: error.message, type: 'error' });
        }
      });
    });
    modal.body.querySelectorAll('[data-resource-add]').forEach((button) => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const result = await ctx.api.addResource(instance.id, button.dataset.resourceAdd);
          if (result.cancelled) return;
          data.resources = result.resources;
          render();
          toast({ title: '资源已导入', message: result.name || '' });
        } catch (error) {
          button.disabled = false;
          toast({ title: '导入失败', message: error.message, type: 'error' });
        }
      });
    });
    modal.body.querySelectorAll('[data-resource-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: '删除资源', message: button.dataset.resourceName, confirmText: '删除', danger: true });
        if (!ok) return;
        try {
          const result = await ctx.api.deleteResource(instance.id, button.dataset.resourceDelete, button.dataset.resourceName);
          data.resources = result.resources;
          render();
        } catch (error) {
          toast({ title: '删除失败', message: error.message, type: 'error' });
        }
      });
    });
    modal.body.querySelector('[data-restore-backup]')?.addEventListener('click', async (event) => {
      const file = event.currentTarget.dataset.restoreBackup;
      const ok = await confirmDialog({ title: '恢复实例备份', message: '会导入为一个新实例，不会覆盖当前实例。', confirmText: '导入' });
      if (!ok) return;
      try {
        const result = await ctx.api.restoreBackup(file);
        await ctx.refreshState();
        toast({ title: '备份已恢复', message: result.instance?.name || '' });
        ctx.rerender();
        modal.close();
      } catch (error) {
        toast({ title: '恢复失败', message: error.message, type: 'error' });
      }
    });
    modal.body.querySelector('[data-manager-save]')?.addEventListener('click', async () => {
      const name = modal.body.querySelector('[data-manager-name]')?.value.trim();
      const memory = Number(modal.body.querySelector('[data-manager-memory]')?.value) || 4096;
      const javaPath = modal.body.querySelector('[data-manager-java]')?.value.trim() || '';
      try {
        await ctx.api.updateInstanceSettings(instance.id, { name, javaMemoryMb: memory, javaPath });
        await ctx.refreshState();
        toast({ title: '实例设置已保存' });
        modal.close();
      } catch (error) {
        toast({ title: '保存失败', message: error.message, type: 'error' });
      }
    });
    modal.body.querySelector('[data-manager-java-browse]')?.addEventListener('click', async () => {
      try {
        const result = await ctx.api.chooseFile({ title: '选择 java.exe', filters: [{ name: 'Java', extensions: ['exe'] }] });
        if (result && !result.canceled && !result.cancelled && result.path) {
          const input = modal.body.querySelector('[data-manager-java]');
          if (input) input.value = result.path;
        }
      } catch (error) {
        toast({ title: '选择失败', message: error.message, type: 'error' });
      }
    });
  };

  const render = () => {
    if (!data) return;
    const current = data.instance;
    const activeTab = tabs().map(([key, label, iconName]) => `<button class="manager-tab ${key === tab ? 'active' : ''}" data-manager-tab="${key}">${icon(iconName, 13)} ${escapeHtml(label)}</button>`).join('');
    let content = '';
    if (tab === 'overview') {
      content = `
        <div class="manager-grid">
          <div class="manager-stat"><span>版本</span><strong>${escapeHtml(current.baseVersion)}</strong><small>${escapeHtml(current.loaderLabel)}</small></div>
          <div class="manager-stat"><span>Mods</span><strong>${data.mods.mods.length}</strong><small>${data.mods.conflicts.length ? `${data.mods.conflicts.length} 个冲突` : '无冲突'}</small></div>
          <div class="manager-stat"><span>存档</span><strong>${data.worlds.length}</strong><small>${data.screenshots.length} 张截图</small></div>
          <div class="manager-stat"><span>内存</span><strong>${((current.javaMemoryMb || ctx.state.settings.memoryMb) / 1024).toFixed(1)} GB</strong><small>实例独立设置</small></div>
        </div>
        <div class="manager-actions">
          <button class="manager-action" data-manager-backup>${icon('package', 17)}<strong>立即备份</strong><span>保存当前实例的 Mod、存档和配置</span></button>
          <button class="manager-action" data-manager-export>${icon('upload', 17)}<strong>导出实例</strong><span>生成可分享的 .zip 实例包</span></button>
          <button class="manager-action" data-manager-import>${icon('download', 17)}<strong>导入实例</strong><span>从 TYCL 实例包恢复</span></button>
          <button class="manager-action" data-manager-repair>${icon('settings', 17)}<strong>一键修复</strong><span>补全缺失的游戏版本和依赖</span></button>
          ${current.modpack ? `<button class="manager-action" data-manager-modpack>${icon('refresh', 17)}<strong>更新整合包</strong><span>同步整合包的新版本文件</span></button>` : ''}
        </div>
        ${data.mods.conflicts.length ? `<div class="notice warn">${icon('alert-triangle', 15)}<span>检测到 ${data.mods.conflicts.length} 个 Mod 冲突，请在 Mods 页查看。</span></div>` : ''}
      `;
    } else if (tab === 'mods') {
      content = `
        <div class="manager-toolbar"><span>${data.mods.mods.length} 个 Mod · ${data.mods.conflicts.length} 个冲突</span><div><button class="btn btn-secondary btn-sm" data-mod-check>${icon('refresh', 12)} 检查更新</button></div></div>
        ${data.mods.conflicts.map((conflict) => `<div class="notice warn">${icon('alert-triangle', 14)}<span>${escapeHtml(conflict.name)}：${escapeHtml(conflict.reason)}（${conflict.files.map(escapeHtml).join(', ')}）</span></div>`).join('')}
        <div class="manager-list">
          ${data.mods.mods.map((mod) => {
            const update = (data.modUpdates || []).find((item) => item.file === mod.file);
            return `<div class="manager-row ${mod.enabled ? '' : 'disabled'}">
              <div class="manager-row-main"><strong>${escapeHtml(mod.name)}</strong><span>${escapeHtml(mod.id || mod.file)} · ${escapeHtml(mod.version || '未知版本')} · ${formatSize(mod.size)}</span></div>
              ${update ? `<button class="btn btn-primary btn-xs" data-mod-update="${escapeHtml(mod.file)}">${escapeHtml(update.latestVersion)}</button>` : ''}
              <button class="btn btn-ghost btn-xs" data-mod-toggle="${escapeHtml(mod.file)}" data-enabled="${mod.enabled}">${mod.enabled ? '禁用' : '启用'}</button>
              <button class="btn btn-ghost btn-xs danger" data-mod-delete="${escapeHtml(mod.file)}">删除</button>
            </div>`;
          }).join('') || '<div class="manager-empty">mods 目录为空</div>'}
        </div>
        <div class="notice">${icon('info', 14)}<span>Mod 更新来自 Modrinth 的文件哈希匹配；未收录的 Mod 不会显示更新。</span></div>
      `;
    } else if (tab === 'worlds') {      content = `
        <div class="manager-toolbar"><span>${data.worlds.length} 个存档 · ${data.screenshots.length} 张截图</span><button class="btn btn-secondary btn-sm" data-manager-folder>${icon('folder', 12)} 打开目录</button></div>
        <div class="manager-list">
          ${data.worlds.map((world) => `<div class="manager-row"><div class="manager-row-main"><strong>${escapeHtml(world.name)}</strong><span>最后修改 ${escapeHtml(new Date(world.modifiedAt).toLocaleString('zh-CN'))}</span></div><button class="btn btn-secondary btn-xs" data-world-backup="${escapeHtml(world.name)}">备份</button></div>`).join('') || '<div class="manager-empty">还没有存档</div>'}
        </div>
        <div class="manager-toolbar" style="margin-top:14px"><span>截图</span><button class="btn btn-secondary btn-sm" data-manager-folder>${icon('folder', 12)} 截图目录</button></div>
        <div class="manager-screens">${data.screenshots.slice(0, 12).map((shot) => `<span title="${escapeHtml(shot.name)}">${escapeHtml(shot.name)}</span>`).join('') || '<div class="manager-empty">还没有截图</div>'}</div>
      `;
    } else if (tab === 'resources') {
      const resources = data.resources || { resourcepacks: [], shaderpacks: [], saves: [] };
      const section = (kind, title, items) => `<div class="resource-block">
        <div class="manager-toolbar"><span>${title} · ${items.length}</span><button class="btn btn-secondary btn-sm" data-resource-add="${kind}">${icon('plus', 12)} 导入</button></div>
        <div class="manager-list">
          ${items.map((item) => `<div class="manager-row"><div class="manager-row-main"><strong>${escapeHtml(item.name)}</strong><span>${item.directory ? '文件夹' : formatSize(item.size)}</span></div><button class="btn btn-ghost btn-xs danger" data-resource-delete="${kind}" data-resource-name="${escapeHtml(item.name)}">删除</button></div>`).join('') || '<div class="manager-empty">还没有内容</div>'}
        </div>
      </div>`;
      content = `
        <div class="notice">${icon('info', 14)}<span>资源包和光影包放入实例目录，地图导入到 saves；不会影响其他实例。</span></div>
        ${section('resourcepacks', '材质包', resources.resourcepacks)}
        ${section('shaderpacks', '光影包', resources.shaderpacks)}
        ${section('saves', '地图 / 存档', resources.saves)}
      `;
    } else if (tab === 'backups') {
      content = `
        <div class="manager-toolbar"><span>${data.backups.length} 个备份</span><div><button class="btn btn-secondary btn-sm" data-manager-backup>${icon('package', 12)} 备份当前实例</button><button class="btn btn-secondary btn-sm" data-manager-import>${icon('download', 12)} 导入</button></div></div>
        <div class="manager-list">
          ${data.backups.map((backup) => `<div class="manager-row"><div class="manager-row-main"><strong>${escapeHtml(backup.name)}</strong><span>${formatSize(backup.size)} · ${escapeHtml(new Date(backup.modifiedAt).toLocaleString('zh-CN'))}</span></div><button class="btn btn-secondary btn-xs" data-restore-backup="${escapeHtml(backup.file)}">恢复</button></div>`).join('') || '<div class="manager-empty">还没有备份</div>'}
        </div>
      `;
    } else {
      content = `
        <div class="manager-form">
          <label class="field"><span class="field-label">实例名称</span><input class="input" data-manager-name maxlength="64" value="${escapeHtml(current.name)}"></label>
          <label class="field"><span class="field-label">独立内存（MB）</span><input class="input" type="number" min="1024" max="65536" step="512" data-manager-memory value="${current.javaMemoryMb || ctx.state.settings.memoryMb}"><span class="field-hint">留空或 0 会使用全局内存设置。</span></label>
          <label class="field"><span class="field-label">独立 Java 路径</span><div class="path-field"><input class="input" data-manager-java value="${escapeHtml(current.javaPath || '')}" placeholder="留空使用全局 Java"><button class="btn btn-secondary btn-sm" data-manager-java-browse>${icon('folder', 12)} 浏览</button></div></label>
          <button class="btn btn-primary btn-sm" data-manager-save>${icon('check', 13)} 保存实例设置</button>
        </div>
      `;
    }
    modal.body.innerHTML = `<div class="manager-tabs">${activeTab}</div><div class="manager-body">${content}</div>`;
    bind();
  };

  await load();
}

export async function openDiagnosticsModal(ctx, instance, options = {}) {
  const modal = openModal({
    title: options.crash ? '启动诊断 · 崩溃分析' : '启动诊断',
    subtitle: instance ? instance.name : '检查运行环境与实例文件',
    size: 'modal-lg',
    body: `<div class="loading-block"><span class="spinner"></span> 正在检查 Java、实例文件与最近日志…</div>`,
    footer: `<button class="btn btn-secondary btn-sm" data-diag-copy>${icon('copy', 13)} 复制报告</button>
      <button class="btn btn-secondary btn-sm" data-diag-folder>${icon('folder', 13)} 打开实例目录</button>
      <button class="btn btn-primary btn-sm" data-modal-close>关闭</button>`,
  });

  let data = null;
  const reportText = () => {
    if (!data) return '';
    const lines = [
      `TYCL 启动诊断 v${data.appVersion}`,
      `生成时间：${data.generatedAt}`,
      `系统：${data.system.platform} / ${data.system.arch} · ${data.system.totalMemoryMb} MB`,
      data.instance ? `实例：${data.instance.name} · ${data.instance.baseVersion} · ${data.instance.loaderLabel}` : '实例：无',
      data.instance ? `目录：${data.instance.gameDir}` : '',
      '',
      ...data.checks.map((check) => `[${check.level.toUpperCase()}] ${check.title}：${check.detail}`),
    ];
    if (data.log?.tail) lines.push('', '--- 最近日志 ---', data.log.tail);
    if (data.crash?.excerpt) lines.push('', '--- 崩溃报告 ---', data.crash.excerpt);
    return lines.filter(Boolean).join('\n');
  };

  async function load() {
    const modalBody = modal.body;
    modalBody.innerHTML = `<div class="loading-block"><span class="spinner"></span> 正在检查 Java、实例文件与最近日志…</div>`;
    try {
      data = await ctx.api.getDiagnostics(instance?.id, { code: options.code || 0 });
      const errors = data.checks.filter((check) => check.level === 'error');
      const warnings = data.checks.filter((check) => check.level === 'warn');
      const tone = data.level === 'error' ? 'error' : data.level === 'warn' ? 'warn' : 'ok';
      const label = data.level === 'error' ? '发现需要处理的问题' : data.level === 'warn' ? '有一些提醒' : '环境看起来正常';
      modalBody.innerHTML = `
        <div class="diag-hero ${tone}">
          <div class="diag-orb">${icon(tone === 'ok' ? 'check' : 'alert-triangle', 22)}</div>
          <div style="flex:1">
            <strong>${label}</strong>
            <span>${data.checks.length} 项检查 · ${errors.length} 个错误 · ${warnings.length} 个提醒${options.code ? ` · 退出代码 ${escapeHtml(String(options.code))}` : ''}</span>
          </div>
          <span class="badge ${tone === 'ok' ? 'badge-accent' : ''}">${tone === 'error' ? '需要修复' : tone === 'warn' ? '建议检查' : '正常'}</span>
        </div>
        <div class="diag-grid">
          <div class="diag-cell"><span>TYCL</span><strong>v${escapeHtml(data.appVersion)}</strong><small>${escapeHtml(data.system.platform)} / ${escapeHtml(data.system.arch)}</small></div>
          <div class="diag-cell"><span>实例</span><strong>${escapeHtml(data.instance?.name || '未选择')}</strong><small>${escapeHtml(data.instance ? `${data.instance.baseVersion} · ${data.instance.loaderLabel}` : '选择一个实例后诊断')}</small></div>
          <div class="diag-cell"><span>Java</span><strong>${escapeHtml(data.environment.javaPath ? '已手动指定' : `需要 Java ${data.environment.javaRequired}+`)}</strong><small>${data.environment.javaList.length ? `检测到 ${data.environment.javaList.length} 个 Java` : '没有检测到 Java'}</small></div>
          <div class="diag-cell"><span>内存</span><strong>${(data.environment.memoryMb / 1024).toFixed(1)} GB</strong><small>系统共 ${(data.system.totalMemoryMb / 1024).toFixed(0)} GB</small></div>
        </div>
        <div class="diag-section-title">${icon('activity', 14)} 检查结果</div>
        <div class="diag-checks">
          ${data.checks.map((check) => `<div class="diag-check ${escapeHtml(check.level)}">
            <span class="diag-dot"></span>
            <div><strong>${escapeHtml(check.title)}</strong><p>${escapeHtml(check.detail)}</p></div>
          </div>`).join('')}
        </div>
        ${
          data.crash
            ? `<div class="diag-section-title">${icon('alert-triangle', 14)} 最近崩溃报告</div>
               <div class="diag-crash-file">${escapeHtml(data.crash.name)}</div>
               <pre class="diag-pre">${escapeHtml(data.crash.excerpt.slice(0, 5000))}</pre>`
            : ''
        }
        ${
          data.log?.tail
            ? `<details class="diag-log"><summary>${icon('terminal', 13)} 最近启动日志</summary><pre class="diag-pre">${escapeHtml(data.log.tail.slice(0, 7000))}</pre></details>`
            : ''
        }
        <div class="notice" style="margin-top:14px">${icon('info', 15)}<span>诊断只读取本机文件，不会上传日志。修复建议仅供参考，修改 Mod 或 Java 前建议先备份实例。</span></div>
      `;
    } catch (error) {
      modalBody.innerHTML = `<div class="notice warn">${icon('alert-triangle', 15)}<span>诊断失败：${escapeHtml(error.message)}</span></div>`;
    }
  }

  modal.root.querySelector('[data-diag-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(reportText());
      toast({ title: '诊断报告已复制' });
    } catch {
      toast({ title: '复制失败', message: '系统剪贴板不可用', type: 'error' });
    }
  });
  modal.root.querySelector('[data-diag-folder]').addEventListener('click', () => {
    ctx.api.openPath(instance?.gameDir || ctx.state.settings.gameDir);
  });
  await load();
}

export async function openProjectModal(ctx, id) {
  let project;
  let allVersions = [];
  let currentTargetId = null;
  let currentVersion = null;
  let versionsForTarget = [];
  let busy = false;

  const modal = openModal({
    title: '资源详情',
    subtitle: '正在从 Modrinth 获取信息…',
    size: 'modal-lg',
    body: `<div class="loading-block"><span class="spinner"></span> 正在连接 Modrinth…</div>`,
    footer: `<button class="btn btn-secondary btn-sm" data-modal-close>关闭</button>`,
  });

  try {
    project = await ctx.api.getProject(id);
    allVersions = await ctx.api.getProjectVersions(id);
  } catch (error) {
    modal.body.innerHTML = `<div class="notice warn">${icon('alert-triangle', 15)}<span>无法获取项目详情：${escapeHtml(error.message)}</span></div>`;
    return;
  }
  if (ctx.signal?.aborted) return;

  const isPack = project.projectType === 'modpack';
  const typeLabel = isPack ? '整合包' : 'Mod';
  modal.root.querySelector('.modal-title').textContent = project.title;
  modal.root.querySelector('.modal-subtitle').textContent = `${typeLabel} · 来自 Modrinth`;
  const gallery = (project.gallery || [])
    .map((item) => (typeof item === 'string' ? item : item.url))
    .filter(Boolean)
    .slice(0, 4);
  const tags = (project.categories || []).slice(0, 7);
  const description = plainText(project.body || project.description || '').slice(0, 6000);
  const paragraphs = description.split(/\n{2,}/).filter(Boolean).slice(0, 12);
  const originalParagraphs = paragraphs.length ? paragraphs : [project.description || ''].filter(Boolean);
  let displayTitle = project.title;
  let displayParagraphs = originalParagraphs;
  let translated = false;
  let translating = false;

  function compatibleInstances() {
    if (!ctx.state.instances.length) return [];
    return ctx.state.instances.filter(
      (instance) =>
        project.gameVersions?.includes(instance.baseVersion) &&
        (instance.loader === 'vanilla' || project.loaders?.includes(instance.loader)),
    );
  }

  function pickDefaultTarget() {
    const list = compatibleInstances();
    if (!list.length) return null;
    return list.find((item) => item.id === ctx.state.ui.selectedInstanceId) || list[0];
  }

  function loaderBadges(version) {
    return (version.loaders || [])
      .filter((loader) => LOADER_LABELS[loader])
      .map((loader) => `<span class="badge badge-outline">${LOADER_LABELS[loader]}</span>`)
      .join('');
  }

  async function refreshVersions() {
    if (isPack) {
      versionsForTarget = allVersions;
    } else if (currentTargetId) {
      const target = ctx.state.instances.find((item) => item.id === currentTargetId);
      if (target) {
        try {
          const fetched = await ctx.api.getProjectVersions(id, {
            gameVersion: target.baseVersion,
            loader: target.loader === 'vanilla' ? undefined : target.loader,
          });
          versionsForTarget = fetched.length ? fetched : allVersions.filter((version) => version.gameVersions.includes(target.baseVersion));
        } catch {
          versionsForTarget = allVersions.filter((version) => version.gameVersions.includes(target.baseVersion));
        }
      }
    }
    if (!versionsForTarget.length) versionsForTarget = allVersions;
    currentVersion = versionsForTarget[0] || null;
  }

  async function render() {
    modal.root.querySelector('.modal-title').textContent = displayTitle;
    const targetList = compatibleInstances();
    if (!isPack && !currentTargetId) currentTargetId = targetList[0]?.id || ctx.state.instances[0]?.id || null;
    await refreshVersions();
    const targetInstances = ctx.state.instances;
    if (!isPack) {
      const selectedTarget = ctx.state.instances.find((item) => item.id === currentTargetId);
      if (selectedTarget) {
        const compatible = targetList.some((item) => item.id === selectedTarget.id);
        if (!compatible) {
          // 保留选择，但给出提示
        }
      }
    }
    const versionOptions = versionsForTarget
      .slice(0, 30)
      .map(
        (version, index) =>
          `<option value="${escapeHtml(version.id)}" ${index === 0 ? 'selected' : ''}>${escapeHtml(version.name || version.versionNumber || version.id)} · ${escapeHtml((version.gameVersions || []).join(' / '))}</option>`,
      )
      .join('');
    const selectedVersion = versionsForTarget[0];
    const selectedTarget = ctx.state.instances.find((item) => item.id === currentTargetId);
    const targetCompatible = !isPack && selectedTarget
      ? project.gameVersions?.includes(selectedTarget.baseVersion) &&
        (selectedTarget.loader === 'vanilla' || project.loaders?.includes(selectedTarget.loader))
      : true;
    const canInstall = Boolean(selectedVersion) && (isPack || (Boolean(currentTargetId) && targetCompatible));
    const targetRows = targetInstances
      .map((instance) => {
        const compatible =
          project.gameVersions?.includes(instance.baseVersion) &&
          (instance.loader === 'vanilla' || project.loaders?.includes(instance.loader));
        return `<div class="install-target-row ${instance.id === currentTargetId ? 'active' : ''}" data-target="${escapeHtml(instance.id)}">
          <span class="target-radio"></span>
          <div class="target-info">
            <strong>${escapeHtml(instance.name)}</strong>
            <span>${escapeHtml(instance.loaderLabel)} · ${escapeHtml(instance.baseVersion)} · ${instance.modsCount} 个 Mod</span>
          </div>
          <span class="badge ${compatible ? 'badge-accent' : ''}">${compatible ? '兼容' : '版本不匹配'}</span>
        </div>`;
      })
      .join('');

    modal.body.innerHTML = `
      <div class="detail-head">
        <div class="detail-icon">${project.iconUrl ? `<img src="${escapeHtml(project.iconUrl)}" alt="">` : `<div class="resource-icon-fallback">${escapeHtml(project.title.slice(0, 1))}</div>`}</div>
        <div style="flex:1;min-width:0">
          <div class="detail-title-row">
            <h2 class="detail-title">${escapeHtml(displayTitle)}</h2>
            <span class="badge badge-accent">${typeLabel}</span>
            <button class="detail-translate ${translated ? 'active' : ''}" data-translate title="${translated ? '显示原文' : '把标题和介绍翻译成中文'}">
              ${icon(translated ? 'rotate' : 'languages', 12)} ${translated ? '显示原文' : '汉化介绍'}
            </button>
          </div>
          <div class="detail-author">by ${escapeHtml(project.author || 'Modrinth 作者')} · 更新于 ${formatDate(project.updated)}</div>
          <div class="detail-stats">
            <span>${icon('download', 12)} ${formatNumber(project.downloads)} 次下载</span>
            <span>${icon('star', 12)} ${formatNumber(project.follows)} 关注</span>
            <span>${icon('shield', 12)} ${escapeHtml(project.license || '开源许可')}</span>
          </div>
        </div>
      </div>
      <div class="tags" style="margin-top:12px">${tags.map((tag) => `<span class="tag">${escapeHtml(CATEGORY_LABELS[tag] || tag)}</span>`).join('')}</div>
      ${
        gallery.length
          ? `<div class="detail-gallery ${gallery.length === 1 ? 'single' : ''}" style="margin-top:16px">${gallery.slice(0, 2).map((url) => `<img src="${escapeHtml(url)}" alt="" loading="lazy">`).join('')}</div>`
          : ''
      }
      <div class="detail-body" style="margin-top:16px">
        ${displayParagraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join('') || `<p>${escapeHtml(project.description || '')}</p>`}
      </div>
      ${translated ? `<div class="translation-note">${icon('info', 12)} 机器翻译，仅供参考 · 点击「原文」恢复官方描述</div>` : ''}
      <div class="detail-tabs"><span class="detail-tab active">安装选项</span></div>
      ${
        isPack
          ? `<div class="notice" style="margin-bottom:13px">${icon('package', 15)}
              <span>将创建一个新的独立实例，并自动安装 ${escapeHtml(selectedVersion ? (selectedVersion.gameVersions || []).join('/') : project.version || '')} 与对应加载器。整合包内包含的 Mod 会一并下载。</span>
            </div>`
          : `<div class="field" style="margin-bottom:13px">
              <div class="field-label">安装到实例</div>
              ${
                targetRows
                  ? `<div class="install-target">${targetRows}</div>`
                  : `<div class="notice warn">${icon('alert-triangle', 15)}<span>还没有可用的游戏实例。请先在游戏库中安装一个对应的游戏版本。</span></div>`
              }
            </div>`
      }
      <div class="field">
        <div class="field-label">版本</div>
        ${
          versionOptions
            ? `<div class="select-wrap"><select class="select" data-version-select>${versionOptions}</select>${icon('chevron-down', 13)}</div>`
            : `<div class="notice warn">${icon('alert-triangle', 15)}<span>没有找到与当前实例兼容的版本。</span></div>`
        }
        <div class="field-hint" data-version-hint>${
          selectedVersion
            ? `${escapeHtml((selectedVersion.gameVersions || []).join(', '))} · ${(selectedVersion.loaders || []).map((loader) => LOADER_LABELS[loader] || loader).join(', ')}`
            : '请更换目标实例或 Minecraft 版本。'
        }</div>
      </div>
      ${
        isPack
          ? ''
          : `<div class="notice" style="margin-top:14px">${icon(targetCompatible ? 'info' : 'alert-triangle', 15)}<span>${
              targetCompatible
                ? '安装了必需的前置 Mod 时，TYCL 会自动下载它们。安装完成后重新启动游戏即可生效。'
                : '当前实例与这个 Mod 的加载器或游戏版本不匹配，请选择其他实例。'
            }</span></div>`
      }
    `;

    modal.footer.innerHTML = `
      <button class="btn btn-ghost btn-sm" data-modrinth>${icon('external-link', 13)} 在 Modrinth 查看</button>
      <span class="foot-note"></span>
      <button class="btn btn-secondary btn-sm" data-modal-close>关闭</button>
      <button class="btn btn-primary btn-sm" data-install-resource ${canInstall ? '' : 'disabled'}>${icon('download', 13)} ${isPack ? '安装整合包' : '安装 Mod'}</button>
    `;
    const versionSelect = modal.body.querySelector('[data-version-select]');
    if (versionSelect) {
      versionSelect.addEventListener('change', () => {
        const found = versionsForTarget.find((version) => version.id === versionSelect.value);
        currentVersion = found || null;
        const hint = modal.body.querySelector('[data-version-hint]');
        if (hint && currentVersion) {
          hint.textContent = `${(currentVersion.gameVersions || []).join(', ')} · ${(currentVersion.loaders || []).map((loader) => LOADER_LABELS[loader] || loader).join(', ')}`;
        }
      });
    }
    modal.body.querySelector('[data-translate]')?.addEventListener('click', async (event) => {
      if (translating) return;
      if (translated) {
        translated = false;
        displayTitle = project.title;
        displayParagraphs = originalParagraphs;
        await render();
        return;
      }
      translating = true;
      const button = event.currentTarget;
      button.disabled = true;
      button.innerHTML = `<span class="spinner" style="width:12px;height:12px"></span> 翻译中`;
      try {
        const payload = await ctx.api.translateTexts([project.title, ...originalParagraphs], 'zh-CN');
        if (!payload || !Array.isArray(payload.translations) || payload.translations.length !== originalParagraphs.length + 1) {
          throw new Error('翻译返回结果不完整');
        }
        displayTitle = payload.translations[0] || project.title;
        displayParagraphs = payload.translations.slice(1);
        translated = true;
        await render();
        toast({
          title: '项目介绍已汉化',
          message: payload.partial ? '部分段落翻译失败，已保留原文' : `由 ${payload.provider || '机器翻译'} 提供，仅供参考`,
          type: payload.partial ? 'info' : 'success',
        });
      } catch (error) {
        button.disabled = false;
        button.innerHTML = `${icon('languages', 12)} 汉化介绍`;
        toast({ title: '汉化失败', message: error.message, type: 'error', duration: 6000 });
      } finally {
        translating = false;
      }
    });
    modal.body.querySelectorAll('[data-target]').forEach((row) => {
      row.addEventListener('click', async () => {
        currentTargetId = row.dataset.target;
        await render();
      });
    });
    modal.footer.querySelector('[data-modrinth]')?.addEventListener('click', () => {
      ctx.api.openExternal(`https://modrinth.com/${isPack ? 'modpack' : 'mod'}/${project.slug || project.id}`);
    });
    modal.footer.querySelector('[data-install-resource]')?.addEventListener('click', async (event) => {
      if (busy) return;
      busy = true;
      const button = event.currentTarget;
      button.disabled = true;
      button.innerHTML = `<span class="spinner" style="width:13px;height:13px"></span> 正在准备`;
      try {
        if (isPack) {
          await ctx.api.installModpack({
            projectId: project.id,
            versionId: currentVersion?.id,
            title: project.title,
            iconUrl: project.iconUrl,
          });
        } else {
          await ctx.api.installMod({
            projectId: project.id,
            versionId: currentVersion?.id,
            instanceId: currentTargetId,
            title: project.title,
          });
        }
        modal.close();
        toast({ title: isPack ? '整合包已加入安装队列' : 'Mod 已加入安装队列', message: project.title, type: 'info' });
      } catch (error) {
        busy = false;
        button.disabled = false;
        button.innerHTML = icon('download', 13) + (isPack ? ' 安装整合包' : ' 安装 Mod');
        toast({ title: '安装失败', message: error.message, type: 'error' });
      }
    });
  }

  await render();
}
