import { icon } from '../icons.js';
import { escapeHtml, formatDate, relativeTime, formatPlayTime, debounce } from '../utils.js';
import { openMenu, confirmDialog, toast, emptyState } from '../components.js';
import { openInstallModal, openLatestInstall, launchInstance, openLogsModal } from '../flows.js';

const TYPE_LABEL = {
  release: '正式版',
  snapshot: '快照',
  old_beta: 'Beta',
  old_alpha: 'Alpha',
};

export async function render(container, ctx) {
  const { state } = ctx;
  const tab = state.ui.versionTab || 'installed';
  const libState = {
    query: '',
    type: state.settings.showSnapshots ? 'all' : 'release',
    limit: 24,
  };

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-eyebrow">LIBRARY</div>
          <h1 class="page-title">游戏库</h1>
          <p class="page-subtitle">管理本地的 Minecraft 实例，或从版本库安装一个新的世界。</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" data-refresh>${icon('refresh', 15)} 刷新</button>
          <button class="btn btn-primary" data-download>${icon('download', 15)} 下载游戏</button>
        </div>
      </div>

      <div class="page-toolbar">
        <div class="tabs">
          <button class="tab ${tab === 'installed' ? 'active' : ''}" data-tab="installed">${icon('layers', 13)} 已安装 <span class="tab-count">${state.instances.length}</span></button>
          <button class="tab ${tab === 'library' ? 'active' : ''}" data-tab="library">${icon('cloud-download', 13)} 版本库</button>
        </div>
        <div class="toolbar-spacer"></div>
      </div>

      <div id="versions-body"></div>
    </div>
  `;

  const body = container.querySelector('#versions-body');

  container.querySelector('[data-download]').addEventListener('click', () => openLatestInstall(ctx));
  container.querySelector('[data-refresh]').addEventListener('click', async () => {
    state.versionCache = null;
    if ((state.ui.versionTab || 'installed') === 'library') {
      await loadLibrary(true);
    } else {
      await ctx.refreshState();
      toast({ title: '游戏库已刷新' });
      ctx.rerender();
    }
  });
  container.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.ui.versionTab = button.dataset.tab;
      ctx.saveUi();
      ctx.rerender();
    });
  });

  function instanceMenu(instance, anchor) {
    const running = state.activeGame && state.activeGame.instanceId === instance.id;
    openMenu(anchor, [
      {
        label: running ? '停止游戏' : '启动游戏',
        icon: running ? 'stop' : 'play',
        onClick: () => {
          if (running) {
            confirmDialog({
              title: '停止游戏',
              message: `确定要关闭 ${instance.name} 吗？`,
              confirmText: '停止游戏',
              danger: true,
            }).then((ok) => {
              if (ok) ctx.api.stopGame();
            });
          } else {
            launchInstance(ctx, instance, null);
          }
        },
      },
      { label: '实例管理', icon: 'sliders', onClick: () => ctx.openInstanceManager(instance) },
      { label: '打开实例目录', icon: 'folder', onClick: () => ctx.api.openInstanceFolder(instance.id) },
      { label: '启动诊断', icon: 'activity', onClick: () => ctx.openDiagnostics(instance) },
      { label: '查看启动日志', icon: 'terminal', onClick: () => openLogsModal(ctx, instance) },
      {
        label: '复制实例路径',
        icon: 'copy',
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(instance.gameDir);
            toast({ title: '路径已复制' });
          } catch {
            toast({ title: '复制失败', type: 'error' });
          }
        },
      },
      { separator: true },
      {
        label: '删除实例',
        icon: 'trash',
        danger: true,
        onClick: async () => {
          const ok = await confirmDialog({
            title: '删除游戏实例',
            message: `将删除「${instance.name}」的存档、Mod 与配置。共享的游戏版本文件不会受到影响。此操作不可撤销。`,
            confirmText: '删除实例',
            danger: true,
          });
          if (!ok) return;
          try {
            await ctx.api.deleteInstance(instance.id);
            await ctx.refreshState();
            toast({ title: '实例已删除', message: instance.name });
            ctx.rerender();
          } catch (error) {
            toast({ title: '删除失败', message: error.message, type: 'error' });
          }
        },
      },
    ]);
  }

  function renderInstalled() {
    const instances = state.instances;
    body.innerHTML = `
      <div class="instance-section">
        ${
          instances.length
            ? `<div class="instance-grid">
                ${instances
                  .map((instance) => {
                    const running = state.activeGame && state.activeGame.instanceId === instance.id;
                    return `<div class="instance-card ${running ? 'running' : ''}" data-instance="${escapeHtml(instance.id)}">
                      <div class="instance-thumb ${instance.modpack?.iconUrl ? 'modpack' : escapeHtml(instance.loader)}">
                        ${instance.modpack?.iconUrl ? `<img src="${escapeHtml(instance.modpack.iconUrl)}" alt="">` : ''}
                      </div>
                      <div class="instance-main">
                        <div class="instance-name">
                          ${running ? '<span class="running-dot"></span>' : ''}
                          ${escapeHtml(instance.name)}
                        </div>
                        <div class="instance-meta">
                          <span class="badge badge-outline">${escapeHtml(instance.loaderLabel || '原版')}</span>
                          <span class="badge">${escapeHtml(instance.baseVersion)}</span>
                          <span>${instance.modsCount || 0} 个 Mod</span>
                          <span>·</span>
                          <span>${running ? '正在运行' : relativeTime(instance.lastPlayedAt)}</span>
                        </div>
                        <div class="instance-meta" style="margin-top:4px">
                          <span>${formatPlayTime(instance.playSeconds)}</span>
                          ${instance.modpack ? `<span>·</span><span>${escapeHtml(instance.modpack.title)}</span>` : ''}
                        </div>
                      </div>
                      <div class="instance-action">
                        ${
                          running
                            ? `<span class="badge badge-accent badge-dot">运行中</span>`
                            : `<button class="play-circle" data-play="${escapeHtml(instance.id)}" title="启动游戏">${icon('play', 13)}</button>`
                        }
                        <button class="instance-more" data-more="${escapeHtml(instance.id)}" aria-label="更多操作">${icon('more-horizontal', 15)}</button>
                      </div>
                    </div>`;
                  })
                  .join('')}
              </div>`
            : emptyState({
                iconName: 'cube',
                title: '游戏库还是空的',
                message: '下载一个 Minecraft 版本，或安装一个整合包，让第一个世界出现在这里。',
                action: `<div style="display:flex;gap:8px"><button class="btn btn-primary btn-sm" data-empty-download>${icon('download', 13)} 下载游戏</button><button class="btn btn-secondary btn-sm" data-empty-packs>${icon('package', 13)} 浏览整合包</button></div>`,
              })
        }
      </div>
      ${
        instances.length
          ? `<div class="notice">${icon('info', 15)}<span>每个实例拥有独立的存档、Mod 与设置。删除实例不会删除共享的游戏资源，重新安装会更快。</span></div>`
          : ''
      }
    `;
    body.querySelectorAll('[data-instance]').forEach((card) => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('button, a, input, select')) return;
        const instance = instances.find((item) => item.id === card.dataset.instance);
        if (instance) ctx.openInstanceManager(instance);
      });
    });
    body.querySelectorAll('[data-play]').forEach((button) => {
      button.addEventListener('click', () => {
        const instance = instances.find((item) => item.id === button.dataset.play);
        if (instance) launchInstance(ctx, instance, button);
      });
    });
    body.querySelectorAll('[data-more]').forEach((button) => {
      button.addEventListener('click', () => {
        const instance = instances.find((item) => item.id === button.dataset.more);
        if (instance) instanceMenu(instance, button);
      });
    });
    body.querySelector('[data-empty-download]')?.addEventListener('click', () => openLatestInstall(ctx));
    body.querySelector('[data-empty-packs]')?.addEventListener('click', () => ctx.navigate('resources', { type: 'modpack' }));
  }

  function typeBadge(type) {
    return `<span class="badge ${type === 'release' ? 'badge-accent' : 'badge-outline'}">${TYPE_LABEL[type] || '版本'}</span>`;
  }

  function renderVersionRows() {
    const listEl = body.querySelector('[data-version-list]');
    if (!listEl) return;
    const all = state.versionCache?.versions || [];
    const filtered = all.filter((item) => {
      if (libState.type === 'snapshot' && item.type !== 'snapshot') return false;
      if (libState.type === 'release' && item.type !== 'release') return false;
      if (libState.query && !item.id.toLowerCase().includes(libState.query.toLowerCase())) return false;
      return true;
    });
    const shown = filtered.slice(0, libState.limit);
    if (!shown.length) {
      listEl.innerHTML = `<div style="padding:28px 16px">${emptyState({ iconName: 'search', title: '没有找到版本', message: '换个筛选条件或关键词试试。' })}</div>`;
      const moreWrap = body.querySelector('[data-load-more-wrap]');
      if (moreWrap) moreWrap.innerHTML = '';
      return;
    }
    const baseVersions = new Set(state.instances.map((item) => item.baseVersion));
    listEl.innerHTML = shown
      .map(
        (version) => `<div class="version-row">
          <div class="version-id-wrap">
            <span class="version-id">${escapeHtml(version.id)}</span>
            <span class="version-date">${formatDate(version.releaseTime)}</span>
          </div>
          <div class="version-type">${typeBadge(version.type)}</div>
          <div class="version-desc">${version.type === 'release' ? 'Minecraft Java Edition · 稳定版本' : '开发中的快照版本'}${
            baseVersions.has(version.id) ? ' · 已在本地实例中使用' : ''
          }</div>
          <div class="version-actions">
            ${state.versionCache?.latest?.release === version.id ? '<span class="badge">最新</span>' : ''}
            <button class="btn btn-secondary" data-install-version="${escapeHtml(version.id)}" data-kind="${escapeHtml(version.type)}">${icon('download', 12)} 安装</button>
          </div>
        </div>`,
      )
      .join('');
    body.querySelectorAll('[data-install-version]').forEach((button) => {
      button.addEventListener('click', () =>
        openInstallModal(ctx, { mcVersion: button.dataset.installVersion, type: button.dataset.kind }),
      );
    });
    const moreWrap = body.querySelector('[data-load-more-wrap]');
    if (moreWrap) {
      if (filtered.length > libState.limit) {
        moreWrap.innerHTML = `<div class="load-more-row"><button class="btn btn-secondary btn-sm" data-load-more>加载更多版本（${filtered.length - libState.limit}）</button></div>`;
        moreWrap.querySelector('[data-load-more]').addEventListener('click', () => {
          libState.limit += 24;
          renderVersionRows();
        });
      } else {
        moreWrap.innerHTML = '';
      }
    }
  }

  async function loadLibrary(force = false) {
    body.innerHTML = `
      <div class="version-panel">
        <div class="version-toolbar">
          <div class="search-box">${icon('search', 15)}<input class="input input-sm" placeholder="搜索版本号，例如 1.20.1" data-search value="${escapeHtml(libState.query)}"></div>
          <div class="segmented">
            <button data-filter-type="release" class="${libState.type === 'release' ? 'active' : ''}">正式版</button>
            <button data-filter-type="snapshot" class="${libState.type === 'snapshot' ? 'active' : ''}">快照</button>
            <button data-filter-type="all" class="${libState.type === 'all' ? 'active' : ''}">全部</button>
          </div>
        </div>
        <div class="version-loading">
          ${Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join('')}
        </div>
      </div>
    `;
    if (force || !state.versionCache) {
      try {
        state.versionCache = await ctx.api.listVersions();
      } catch (error) {
        if (ctx.signal?.aborted) return;
        body.innerHTML = `<div class="version-panel"><div style="padding:26px">
          <div class="notice warn">${icon('alert-triangle', 15)}<span>无法获取版本列表：${escapeHtml(error.message)}<br>请检查网络，或在设置中切换下载源。</span></div>
          <div style="margin-top:12px"><button class="btn btn-secondary btn-sm" data-retry>${icon('refresh', 13)} 重试</button></div>
        </div></div>`;
        body.querySelector('[data-retry]')?.addEventListener('click', () => loadLibrary(true));
        return;
      }
    }
    if (ctx.signal?.aborted) return;
    body.innerHTML = `
      <div class="version-panel">
        <div class="version-toolbar">
          <div class="search-box">${icon('search', 15)}<input class="input input-sm" placeholder="搜索版本号，例如 1.20.1" data-search value="${escapeHtml(libState.query)}"></div>
          <div class="segmented">
            <button data-filter-type="release" class="${libState.type === 'release' ? 'active' : ''}">正式版</button>
            <button data-filter-type="snapshot" class="${libState.type === 'snapshot' ? 'active' : ''}">快照</button>
            <button data-filter-type="all" class="${libState.type === 'all' ? 'active' : ''}">全部</button>
          </div>
          <div class="toolbar-spacer"></div>
          <span class="badge">共 ${state.versionCache.versions.length} 个版本</span>
        </div>
        <div class="version-table" data-version-list></div>
        <div data-load-more-wrap></div>
      </div>
    `;
    const searchInput = body.querySelector('[data-search]');
    const onSearch = debounce(() => {
      libState.query = searchInput.value;
      libState.limit = 24;
      renderVersionRows();
    }, 130);
    searchInput.addEventListener('input', onSearch);
    body.querySelectorAll('[data-filter-type]').forEach((button) => {
      button.addEventListener('click', () => {
        libState.type = button.dataset.filterType;
        body.querySelectorAll('[data-filter-type]').forEach((item) => item.classList.toggle('active', item === button));
        libState.limit = 24;
        renderVersionRows();
      });
    });
    renderVersionRows();
  }

  if (tab === 'library') {
    await loadLibrary();
  } else {
    renderInstalled();
  }
}
