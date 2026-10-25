import { icon } from '../icons.js';
import { escapeHtml, formatNumber, formatPlayTime, relativeTime, greeting, timestampText } from '../utils.js';
import { openLatestInstall, openProjectModal, launchInstance } from '../flows.js';
import { setAvatar } from '../components.js';

export async function render(container, ctx) {
  const { state } = ctx;
  const instances = state.instances || [];
  const activeGame = state.activeGame;
  const selectedId = state.ui.selectedInstanceId;
  const selected = instances.find((item) => item.id === selectedId) || instances[0] || null;
  if (selected) state.ui.selectedInstanceId = selected.id;
  const playerName = ctx.displayName?.() || state.player.name;
  const microsoft = state.account?.mode === 'microsoft';
  const running = activeGame && selected && activeGame.instanceId === selected.id;
  const anyRunning = Boolean(activeGame);
  const totalMods = instances.reduce((sum, item) => sum + (item.modsCount || 0), 0);
  const totalSeconds = instances.reduce((sum, item) => sum + (item.playSeconds || 0), 0);
  const lastPlayed = instances
    .filter((item) => item.lastPlayedAt)
    .sort((a, b) => String(b.lastPlayedAt).localeCompare(String(a.lastPlayedAt)))[0];

  const versionOptions = instances
    .map((item) => `<option value="${escapeHtml(item.id)}" ${selected && item.id === selected.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`)
    .join('');

  const recent = [...instances]
    .sort((a, b) => String(b.lastPlayedAt || '').localeCompare(String(a.lastPlayedAt || '')))
    .slice(0, 3);

  container.innerHTML = `
    <div class="page home-page">
      <div class="home-greeting">
        <div class="greeting-main">
          <h1>${greeting()}，${escapeHtml(playerName)} <span class="wave">👋</span></h1>
          <p>${escapeHtml(timestampText())} · 今天想回到哪个世界？</p>
        </div>
        <div class="greeting-side">
          <div class="status-pill">
            <i style="${anyRunning ? '' : 'background:var(--faint);box-shadow:none'}"></i>
            ${anyRunning ? '游戏运行中' : microsoft ? 'Microsoft 正版 · 已连接' : '离线账户 · 就绪'}
          </div>
        </div>
      </div>

      <section class="hero">
        <div class="hero-copy">
          <div class="hero-kicker">${icon('sparkles', 12)} MINECRAFT · JAVA EDITION</div>
          <h2>世界，就在<br><span class="accent-serif">下一次点击</span></h2>
          <p>从熟悉的方块开始，去往没有边界的远方。TYCL 已经为你准备好一切，只差一次出发。</p>
          <div class="hero-launch">
            ${
              instances.length
                ? `<div class="hero-select">
                    <div class="select-wrap">
                      <select class="select" data-hero-version aria-label="选择实例">
                        ${versionOptions}
                        <option value="__download">＋ 下载新版本…</option>
                      </select>
                      ${icon('chevron-down', 13)}
                    </div>
                  </div>`
                : ''
            }
            <button class="btn btn-dark hero-play" data-hero-play>
              ${instances.length ? (running ? icon('stop', 16) : icon('play', 16)) : icon('download', 16)}
              <span>${instances.length ? (running ? '停止游戏' : '启动游戏') : '下载游戏'}</span>
            </button>
          </div>
          <div class="hero-meta">
            <span>${icon('shield', 12)} ${microsoft ? 'Microsoft 正版' : '离线账户'}</span>
            <span>${icon('cloud-download', 12)} ${state.settings.downloadSource === 'official' ? '官方下载源' : 'BMCLAPI 镜像'}</span>
            <span>${icon('box', 12)} ${instances.length} 个实例</span>
            <button class="hero-meta-link" data-all-versions-link>全部版本 ${icon('arrow-right', 11)}</button>
          </div>
        </div>

        <div class="hero-art"><img src="./assets/hero-island.svg" alt=""></div>
        <div class="hero-float-card one">
          <div class="hero-float-icon">${icon('layers', 15)}</div>
          <div><strong>${instances.length} 个游戏实例</strong><span>${totalMods} 个 Mod 已就绪</span></div>
        </div>
        <div class="hero-float-card two">
          <div class="hero-float-avatar" data-hero-avatar></div>
          <div><strong>${escapeHtml(playerName)}</strong><span>${escapeHtml(state.activeSkin?.name || '云杉')} · 皮肤</span></div>
        </div>
      </section>

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-icon accent">${icon('layers', 16)}</div>
          <div class="stat-info">
            <div class="stat-value">${instances.length}<small>个</small></div>
            <div class="stat-label">已安装实例</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">${icon('package', 16)}</div>
          <div class="stat-info">
            <div class="stat-value">${totalMods}<small>个</small></div>
            <div class="stat-label">已安装 Mod</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">${icon('clock', 16)}</div>
          <div class="stat-info">
            <div class="stat-value">${Math.floor(totalSeconds / 3600)}<small>小时</small></div>
            <div class="stat-label">累计游戏时长</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">${icon('zap', 16)}</div>
          <div class="stat-info">
            <div class="stat-value" style="font-size:14px">${lastPlayed ? formatPlayTime(lastPlayed.playSeconds) : '尚未出发'}</div>
            <div class="stat-label">${lastPlayed ? `上次游玩 ${relativeTime(lastPlayed.lastPlayedAt)}` : '还没有游戏记录'}</div>
          </div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>最近游玩</h3>
              <p>从上次停下的地方继续</p>
            </div>
            <button class="section-link" data-all-versions>全部实例 ${icon('arrow-right', 12)}</button>
          </div>
          <div class="panel-body">
            ${
              recent.length
                ? `<div class="recent-list">
                    ${recent
                      .map(
                        (item) => `<div class="recent-item">
                          <div class="recent-icon ${item.modpack ? 'modpack' : escapeHtml(item.loader)}">
                            ${item.modpack?.iconUrl ? `<img src="${escapeHtml(item.modpack.iconUrl)}" alt="">` : ''}
                          </div>
                          <div class="recent-info">
                            <div class="recent-name">${escapeHtml(item.name)}</div>
                            <div class="recent-meta">
                              <span>${escapeHtml(item.loaderLabel || '原版')}</span>
                              <span class="dot"></span>
                              <span>${escapeHtml(item.baseVersion)}</span>
                              <span class="dot"></span>
                              <span>${item.modsCount || 0} 个 Mod</span>
                              <span class="dot"></span>
                              <span>${relativeTime(item.lastPlayedAt)}</span>
                            </div>
                          </div>
                          ${
                            activeGame && activeGame.instanceId === item.id
                              ? `<span class="badge badge-accent">运行中</span>`
                              : `<button class="recent-play" data-quick-play="${escapeHtml(item.id)}" title="启动">${icon('play', 13)}</button>`
                          }
                        </div>`,
                      )
                      .join('')}
                  </div>`
                : `<div class="empty-recent">
                    <div class="mini-orbit">${icon('cube', 22)}</div>
                    <strong>还没有游戏实例</strong>
                    <p>下载一个 Minecraft 版本，开始你的第一段旅程。</p>
                    <button class="btn btn-primary btn-sm" data-empty-download>${icon('download', 13)} 下载游戏</button>
                  </div>`
            }
            <div class="quick-actions" style="margin-top:12px">
              <button class="quick-action" data-quick="download">
                <span class="quick-action-icon">${icon('cloud-download', 14)}</span>
                <strong>下载游戏</strong>
                <span>原版 · Fabric · Forge</span>
              </button>
              <button class="quick-action" data-quick="mods">
                <span class="quick-action-icon">${icon('compass', 14)}</span>
                <strong>发现 Mod</strong>
                <span>来自 Modrinth 社区</span>
              </button>
              <button class="quick-action" data-quick="packs">
                <span class="quick-action-icon">${icon('package', 14)}</span>
                <strong>整合包</strong>
                <span>一键安装完整世界</span>
              </button>
              <button class="quick-action" data-quick="skin">
                <span class="quick-action-icon">${icon('shirt', 14)}</span>
                <strong>更换皮肤</strong>
                <span>导入并实时预览</span>
              </button>
            </div>
          </div>
        </div>

        <div class="home-side">
          <div class="panel" style="padding:15px">
            <div class="section-head" style="margin-bottom:10px">
              <h3 class="section-title">编辑推荐 <span class="muted">WEEKLY</span></h3>
              <button class="section-link" data-all-packs>更多 ${icon('arrow-right', 12)}</button>
            </div>
            <button class="featured-pack" data-feature-pack>
              <img class="bg" src="./assets/covers/prominence-2-fabric-banner.webp" alt="">
              <div class="featured-pack-content">
                <span class="featured-pack-kicker">${icon('star', 9)} 剧情 · RPG</span>
                <h4>Prominence II: Hasturian Era</h4>
                <p>在虚空入侵之前，写下属于你的终章。</p>
                <div class="featured-pack-meta">
                  <span>1.20.1</span>
                  <span>·</span>
                  <span>Fabric</span>
                  <span>·</span>
                  <span>${formatNumber(2217267)} 下载</span>
                </div>
              </div>
            </button>
          </div>

          <div class="tip-card">
            <div class="tip-card-head">${icon('sparkles', 14)} 小提示</div>
            <p>安装 Mod 前，先确认实例的加载器与游戏版本。TYCL 会自动筛选兼容的版本，并补齐必需的前置模组。</p>
          </div>
        </div>
      </div>
    </div>
  `;

  setAvatar(container.querySelector('[data-hero-avatar]'), state.activeSkin?.dataUrl);

  const versionSelect = container.querySelector('[data-hero-version]');
  versionSelect?.addEventListener('change', async () => {
    if (versionSelect.value === '__download') {
      versionSelect.value = selected?.id || '';
      await openLatestInstall(ctx);
      return;
    }
    state.ui.selectedInstanceId = versionSelect.value;
    ctx.saveUi();
    ctx.rerender();
  });

  container.querySelector('[data-hero-play]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!selected) {
      await openLatestInstall(ctx);
      return;
    }
    if (running) {
      const confirmed = await ctx.confirm({
        title: '停止游戏',
        message: `确定要关闭 ${selected.name} 吗？未保存的进度可能会丢失。`,
        confirmText: '停止游戏',
        danger: true,
      });
      if (!confirmed) return;
      await ctx.api.stopGame();
      return;
    }
    await launchInstance(ctx, selected, button);
  });

  container.querySelectorAll('[data-quick-play]').forEach((button) => {
    button.addEventListener('click', () => {
      const instance = instances.find((item) => item.id === button.dataset.quickPlay);
      if (instance) launchInstance(ctx, instance, button);
    });
  });

  container.querySelector('[data-all-versions]')?.addEventListener('click', () => ctx.navigate('versions'));
  container.querySelector('[data-all-versions-link]')?.addEventListener('click', () => ctx.navigate('versions', { versionTab: 'library' }));
  container.querySelectorAll('[data-empty-download]').forEach((button) => button.addEventListener('click', () => openLatestInstall(ctx)));
  container.querySelector('[data-all-packs]')?.addEventListener('click', () => ctx.navigate('resources', { type: 'modpack' }));
  container.querySelector('[data-feature-pack]')?.addEventListener('click', () => openProjectModal(ctx, 'prominence-2-fabric'));
  container.querySelectorAll('[data-quick]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.quick;
      if (action === 'download') openLatestInstall(ctx);
      if (action === 'mods') ctx.navigate('resources', { type: 'mod' });
      if (action === 'packs') ctx.navigate('resources', { type: 'modpack' });
      if (action === 'skin') ctx.navigate('skins');
    });
  });
}
