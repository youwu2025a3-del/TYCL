import { icon } from '../icons.js';
import { escapeHtml, formatNumber, debounce } from '../utils.js';
import { skeletonCards, emptyState, openModal, toast } from '../components.js';
import { openProjectModal } from '../flows.js';

const CATEGORY_LABELS = {
  adventure: '冒险',
  optimization: '优化',
  technology: '科技',
  magic: '魔法',
  combat: '战斗',
  quests: '任务',
  library: '前置',
  utility: '实用',
  worldgen: '地形',
  mobs: '生物',
  visual: '视觉',
  lightweight: '轻量',
  multiplayer: '多人',
  rpg: '角色扮演',
  furniture: '装饰',
  storage: '存储',
  equipment: '装备',
  food: '食物',
  management: '管理',
  transportation: '交通',
  challenging: '挑战',
  'kitchen-sink': '综合',
  pvp: 'PvP',
  parkour: '跑酷',
  building: '建筑',
  decoration: '装饰',
  economy: '经济',
  'game-mechanics': '机制',
  datapack: '数据包',
};

const FILTER_CATEGORIES = [
  { value: '', label: '全部' },
  { value: 'adventure', label: '冒险' },
  { value: 'optimization', label: '优化' },
  { value: 'technology', label: '科技' },
  { value: 'magic', label: '魔法' },
  { value: 'combat', label: '战斗' },
  { value: 'quests', label: '任务' },
];

function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category;
}

function resourceCard(item) {
  const initial = escapeHtml((item.title || '?').slice(0, 1));
  return `<article class="resource-card" data-project="${escapeHtml(item.id || item.slug)}">
    <div class="resource-top">
      <div class="resource-icon">
        ${item.iconUrl ? `<img src="${escapeHtml(item.iconUrl)}" alt="" loading="lazy">` : ''}
        <div class="resource-icon-fallback" style="${item.iconUrl ? 'display:none' : ''}">${initial}</div>
      </div>
      <div class="resource-title-wrap">
        <div class="resource-title">${escapeHtml(item.title)}</div>
        <div class="resource-author">by ${escapeHtml(item.author || 'Modrinth 作者')}</div>
      </div>
    </div>
    <div class="resource-desc">${escapeHtml(item.description || '')}</div>
    <div class="resource-footer">
      <div class="resource-tags">
        ${(item.categories || []).slice(0, 2).map((tag) => `<span class="tag">${escapeHtml(categoryLabel(tag))}</span>`).join('')}
      </div>
      <span class="resource-stat">${icon('download', 11)} ${formatNumber(item.downloads)}</span>
      <button class="resource-install-btn" data-open-project="${escapeHtml(item.id || item.slug)}" title="查看并安装">${icon('plus', 12)}</button>
    </div>
  </article>`;
}

function openCurseForge(ctx, state, filters = {}) {
  const key = state.settings.curseForgeApiKey;
  if (!key) {
    toast({ title: '需要 CurseForge API Key', message: '请先在设置 → 下载源中填写 API Key', type: 'info', duration: 6000 });
    ctx.navigate('settings');
    return;
  }
  let instanceId = state.ui.selectedInstanceId || state.instances[0]?.id || '';
  const modal = openModal({
    title: 'CurseForge',
    subtitle: '搜索并安装 CurseForge Mod',
    size: 'modal-lg',
    body: `
      <div class="cf-toolbar">
        <input class="input" data-cf-query placeholder="搜索 CurseForge Mod…" spellcheck="false">
        <button class="btn btn-primary" data-cf-search>${icon('search', 13)} 搜索</button>
      </div>
      <div class="field" style="margin-top:10px">
        <div class="field-label">安装到实例</div>
        <div class="select-wrap"><select class="select" data-cf-instance>${state.instances.map((instance) => `<option value="${escapeHtml(instance.id)}" ${instance.id === instanceId ? 'selected' : ''}>${escapeHtml(instance.name)} · ${escapeHtml(instance.baseVersion)} · ${escapeHtml(instance.loaderLabel)}</option>`).join('')}</select></div>
      </div>
      <div class="cf-list" data-cf-list><div class="manager-empty">输入关键词搜索 CurseForge</div></div>
    `,
    footer: `<button class="btn btn-secondary btn-sm" data-modal-close>关闭</button>`,
  });
  const list = modal.body.querySelector('[data-cf-list]');
  const query = modal.body.querySelector('[data-cf-query]');
  const instanceSelect = modal.body.querySelector('[data-cf-instance]');
  instanceSelect?.addEventListener('change', () => { instanceId = instanceSelect.value; });
  const search = async () => {
    const text = query.value.trim();
    if (!text) return;
    list.innerHTML = `<div class="loading-block"><span class="spinner"></span> 搜索中…</div>`;
    try {
      const result = await ctx.api.searchCurseForge({ query: text, type: 'mod', gameVersion: filters.gameVersion || '', loader: filters.loader || '' });
      if (!result.hits?.length) {
        list.innerHTML = `<div class="manager-empty">没有找到结果</div>`;
        return;
      }
      list.innerHTML = result.hits.map((item) => `<div class="cf-row">
        <div class="cf-icon">${item.iconUrl ? `<img src="${escapeHtml(item.iconUrl)}" alt="">` : icon('package', 18)}</div>
        <div class="cf-main"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.author || 'CurseForge')} · ${formatNumber(item.downloads)} 次下载</span><small>${escapeHtml(item.summary || '')}</small></div>
        <button class="btn btn-primary btn-xs" data-cf-install="${item.id}" data-cf-title="${escapeHtml(item.name)}">安装</button>
      </div>`).join('');
      list.querySelectorAll('[data-cf-install]').forEach((button) => {
        button.addEventListener('click', async () => {
          if (!instanceId) return toast({ title: '没有可用实例', type: 'error' });
          button.disabled = true;
          try {
            await ctx.api.installCurseForge({ instanceId, modId: Number(button.dataset.cfInstall), title: button.dataset.cfTitle });
            toast({ title: '开始安装 CurseForge Mod', message: button.dataset.cfTitle });
          } catch (error) {
            button.disabled = false;
            toast({ title: '安装失败', message: error.message, type: 'error' });
          }
        });
      });
    } catch (error) {
      list.innerHTML = `<div class="manager-empty">${escapeHtml(error.message)}</div>`;
    }
  };
  modal.body.querySelector('[data-cf-search]').addEventListener('click', search);
  query.addEventListener('keydown', (event) => { if (event.key === 'Enter') search(); });
  query.focus();
}

export async function render(container, ctx) {
  const { state } = ctx;
  if (!state.ui.resourceType) state.ui.resourceType = 'modpack';
  const view = {
    type: state.ui.resourceType,
    query: '',
    gameVersion: '',
    loader: '',
    category: '',
    sort: 'downloads',
    offset: 0,
    total: 0,
    hits: [],
    loading: false,
    token: 0,
  };

  const installedVersions = Array.from(new Set(state.instances.map((item) => item.baseVersion)));
  const versions = Array.from(new Set([...installedVersions, '1.21.4', '1.21.1', '1.20.1', '1.20.4', '1.19.2', '1.18.2', '1.16.5']));

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-eyebrow">DISCOVER</div>
          <h1 class="page-title">资源中心</h1>
          <p class="page-subtitle">从 Modrinth 发现精心制作的整合包与 Mod，选中兼容版本，一键安装到你的实例。</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" data-curseforge>${icon('zap', 13)} CurseForge</button>
          <span class="badge badge-outline" style="height:28px">${icon('globe', 12)} Powered by Modrinth</span>
        </div>
      </div>

      <div class="page-toolbar" style="margin-bottom:14px">
        <div class="tabs">
          <button class="tab ${view.type === 'modpack' ? 'active' : ''}" data-type="modpack">${icon('package', 13)} 整合包</button>
          <button class="tab ${view.type === 'mod' ? 'active' : ''}" data-type="mod">${icon('box', 13)} Mod</button>
        </div>
        <div class="toolbar-spacer"></div>
        <div class="search-box" style="max-width:350px">
          ${icon('search', 15)}
          <input class="input" data-search placeholder="搜索${view.type === 'modpack' ? '整合包' : 'Mod'}…" autocomplete="off" spellcheck="false">
          <button class="search-clear hidden" data-clear>${icon('close', 13)}</button>
        </div>
      </div>

      <div class="resource-toolbar">
        <div class="select-wrap">
          <select class="select select-sm" data-game-version style="min-width:132px">
            <option value="">全部游戏版本</option>
            ${versions.map((version) => `<option value="${escapeHtml(version)}">Minecraft ${escapeHtml(version)}</option>`).join('')}
          </select>
          ${icon('chevron-down', 13)}
        </div>
        <div class="select-wrap">
          <select class="select select-sm" data-loader style="min-width:120px">
            <option value="">全部加载器</option>
            <option value="fabric">Fabric</option>
            <option value="forge">Forge</option>
            <option value="quilt">Quilt</option>
          </select>
          ${icon('chevron-down', 13)}
        </div>
        <div class="select-wrap">
          <select class="select select-sm" data-sort style="min-width:122px">
            <option value="downloads">按下载量</option>
            <option value="relevance">按相关性</option>
            <option value="newest">最新发布</option>
            <option value="updated">最近更新</option>
          </select>
          ${icon('chevron-down', 13)}
        </div>
      </div>

      <div class="filter-chips">
        ${FILTER_CATEGORIES.map(
          (category) => `<button class="filter-chip ${view.category === category.value ? 'active' : ''}" data-category="${category.value}">${category.label}</button>`,
        ).join('')}
      </div>

      <div class="results-count">
        <span data-count>正在寻找${view.type === 'modpack' ? '整合包' : ' Mod'}…</span>
        <span style="color:var(--faint)">内容与下载来自 Modrinth</span>
      </div>

      <div class="resource-grid" data-grid>${skeletonCards(6)}</div>
      <div class="pagination" data-pagination></div>
    </div>
  `;

  const grid = container.querySelector('[data-grid]');
  const countEl = container.querySelector('[data-count]');
  const pagination = container.querySelector('[data-pagination]');
  const searchInput = container.querySelector('[data-search]');
  const clearButton = container.querySelector('[data-clear]');

  async function load({ append = false } = {}) {
    if (!append) {
      view.offset = 0;
      view.hits = [];
      grid.innerHTML = skeletonCards(6);
      pagination.innerHTML = '';
    } else {
      const button = pagination.querySelector('[data-load-more]');
      if (button) {
        button.disabled = true;
        button.innerHTML = '<span class="spinner" style="width:13px;height:13px"></span> 加载中';
      }
    }
    const token = ++view.token;
    view.loading = true;
    try {
      const result = await ctx.api.searchResources({
        query: view.query,
        type: view.type,
        gameVersion: view.gameVersion,
        loader: view.loader,
        category: view.category,
        sort: view.sort,
        offset: view.offset,
        limit: 24,
      });
      if (token !== view.token || ctx.signal?.aborted) return;
      view.total = result.total;
      view.hits = append ? [...view.hits, ...result.hits] : result.hits;
      grid.innerHTML = view.hits.length
        ? view.hits.map(resourceCard).join('')
        : `<div class="resource-empty">${emptyState({
            iconName: 'search',
            title: '没有找到匹配的内容',
            message: '尝试更短的关键词，或更换游戏版本 / 加载器筛选。',
          })}</div>`;
      bindCards();
      countEl.textContent = view.total
        ? `${view.type === 'modpack' ? '整合包' : 'Mod'} · 找到 ${formatNumber(view.total)} 个结果`
        : `没有找到${view.type === 'modpack' ? '整合包' : ' Mod'}`;
      const hasMore = view.hits.length < view.total;
      pagination.innerHTML = hasMore
        ? `<button class="btn btn-secondary btn-sm" data-load-more>加载更多</button>`
        : '';
      pagination.querySelector('[data-load-more]')?.addEventListener('click', () => {
        view.offset = view.hits.length;
        load({ append: true });
      });
    } catch (error) {
      if (token !== view.token || ctx.signal?.aborted) return;
      grid.innerHTML = `<div class="resource-empty">
        <div class="notice warn" style="margin-bottom:16px">${icon('alert-triangle', 15)}<span>无法连接 Modrinth：${escapeHtml(error.message)}<br>请检查网络后重试，或稍后再来。</span></div>
        <button class="btn btn-secondary btn-sm" data-retry>${icon('refresh', 13)} 重新加载</button>
      </div>`;
      grid.querySelector('[data-retry]')?.addEventListener('click', () => load());
      countEl.textContent = '加载失败';
      pagination.innerHTML = '';
    } finally {
      if (token === view.token) view.loading = false;
    }
  }

  function bindCards() {
    grid.querySelectorAll('.resource-icon img').forEach((img) => {
      img.addEventListener('error', () => {
        img.style.display = 'none';
        const fallback = img.nextElementSibling;
        if (fallback) fallback.style.display = 'grid';
      });
    });
    grid.querySelectorAll('[data-project]').forEach((card) => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('[data-open-project]')) return;
        openProjectModal(ctx, card.dataset.project);
      });
    });
    grid.querySelectorAll('[data-open-project]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        openProjectModal(ctx, button.dataset.openProject);
      });
    });
  }

  function updateTypeUI() {
    container.querySelectorAll('[data-type]').forEach((button) => {
      button.classList.toggle('active', button.dataset.type === view.type);
    });
    searchInput.placeholder = `搜索${view.type === 'modpack' ? '整合包' : ' Mod'}…`;
  }

  const onSearchInput = debounce(() => {
    view.query = searchInput.value.trim();
    clearButton.classList.toggle('hidden', !view.query);
    load();
  }, 360);
  searchInput.addEventListener('input', onSearchInput);
  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    view.query = '';
    clearButton.classList.add('hidden');
    load();
    searchInput.focus();
  });

  container.querySelectorAll('[data-type]').forEach((button) => {
    button.addEventListener('click', () => {
      if (view.type === button.dataset.type) return;
      view.type = button.dataset.type;
      state.ui.resourceType = view.type;
      ctx.saveUi();
      updateTypeUI();
      load();
    });
  });

  container.querySelector('[data-game-version]').addEventListener('change', (event) => {
    view.gameVersion = event.target.value;
    load();
  });
  container.querySelector('[data-loader]').addEventListener('change', (event) => {
    view.loader = event.target.value;
    load();
  });
  container.querySelector('[data-sort]').addEventListener('change', (event) => {
    view.sort = event.target.value;
    load();
  });
  container.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      view.category = button.dataset.category;
      container.querySelectorAll('[data-category]').forEach((item) => item.classList.toggle('active', item === button));
      load();
    });
  });

  container.querySelector('[data-curseforge]')?.addEventListener('click', () => openCurseForge(ctx, state, { gameVersion: view.gameVersion, loader: view.loader }));

  updateTypeUI();
  await load();
}
