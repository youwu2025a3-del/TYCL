import { icon } from '../icons.js';
import { escapeHtml } from '../utils.js';

const PAGE_SIZE = 9;

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'java', label: 'Java 版' },
  { key: 'bedrock', label: '基岩版' },
  { key: 'dungeons', label: '地牢' },
  { key: 'legends', label: '传奇' },
];

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function formatUpdated(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function editionChips(entry) {
  return (entry.editions || [])
    .slice(0, 2)
    .map((edition) => `<span class="news-edition ${escapeHtml(edition.key)}">${escapeHtml(edition.label)}</span>`)
    .join('');
}

function cardMarkup(entry, index) {
  return `<article class="news-card" data-news-index="${index}" tabindex="0" style="--i:${Math.min(index, 12)}">
    <div class="news-card-media">
      ${entry.image ? `<img src="${escapeHtml(entry.image)}" alt="" loading="lazy" draggable="false">` : '<span class="news-media-placeholder">NEWS</span>'}
      <span class="news-card-arrow">${icon('arrow-up-right', 14)}</span>
    </div>
    <div class="news-card-body">
      <div class="news-card-meta">
        <span class="news-category">${escapeHtml(entry.category)}</span>
        <span>${formatDate(entry.date)}</span>
      </div>
      <h3>${escapeHtml(entry.title)}</h3>
      <p>${escapeHtml(entry.text)}</p>
      <div class="news-card-foot">${editionChips(entry)}<span class="news-read">查看简介 ${icon('arrow-right', 12)}</span></div>
    </div>
  </article>`;
}

function heroMarkup(entry) {
  if (!entry) return '';
  return `<article class="news-hero" data-news-index="0" tabindex="0">
    <div class="news-hero-media">
      ${entry.image ? `<img src="${escapeHtml(entry.image)}" alt="" draggable="false">` : ''}
      <div class="news-hero-shade"></div>
      <span class="news-hero-badge">${icon('sparkles', 12)} LATEST · ${escapeHtml(entry.category)}</span>
    </div>
    <div class="news-hero-copy">
      <div class="news-card-meta">
        <span class="news-category">${escapeHtml(entry.category)}</span>
        <span>${formatDate(entry.date)}</span>
      </div>
      <h2>${escapeHtml(entry.title)}</h2>
      <p>${escapeHtml(entry.text)}</p>
      <div class="news-hero-foot">
        <div class="news-editions">${editionChips(entry)}</div>
        <span class="news-read strong">查看简介 ${icon('arrow-right', 13)}</span>
      </div>
    </div>
  </article>`;
}

export async function render(container, ctx) {
  container.innerHTML = `
    <div class="page news-page">
      <div class="page-header">
        <div>
          <div class="page-eyebrow">MINECRAFT NEWS</div>
          <h1 class="page-title">新闻</h1>
          <p class="page-subtitle">来自 Minecraft 官方的全部消息。点击卡片查看简介，并可一键翻译成中文。</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" data-news-refresh>${icon('refresh', 13)} 刷新</button>
          <button class="btn btn-dark btn-sm" data-news-site>${icon('globe', 13)} 官网新闻</button>
        </div>
      </div>
      <div class="news-shell">
        <div class="news-loading" data-news-loading>
          <div class="news-skeleton hero"></div>
          <div class="news-skeleton-grid">
            ${Array.from({ length: 3 }).map(() => '<div class="news-skeleton card"></div>').join('')}
          </div>
        </div>
        <div class="news-content" data-news-content hidden></div>
      </div>
    </div>
  `;

  const shell = container.querySelector('.news-shell');
  const loading = container.querySelector('[data-news-loading]');
  const content = container.querySelector('[data-news-content]');
  const refreshButton = container.querySelector('[data-news-refresh]');
  let data = null;
  let activeFilter = 'all';
  let query = '';
  let visible = PAGE_SIZE;

  container.querySelector('[data-news-site]').addEventListener('click', () => {
    ctx.api.openExternal('https://www.minecraft.net/zh-hans/news');
  });

  const filteredEntries = () => {
    if (!data) return [];
    const search = query.trim().toLowerCase();
    return data.entries.filter((entry) => {
      if (activeFilter !== 'all' && entry.primary !== activeFilter) return false;
      if (search && !`${entry.title} ${entry.text} ${entry.category}`.toLowerCase().includes(search)) return false;
      return true;
    });
  };

  const counts = () => {
    const all = data?.entries || [];
    return {
      all: all.length,
      java: all.filter((entry) => entry.primary === 'java').length,
      bedrock: all.filter((entry) => entry.primary === 'bedrock').length,
      dungeons: all.filter((entry) => entry.primary === 'dungeons').length,
      legends: all.filter((entry) => entry.primary === 'legends').length,
    };
  };

  const renderContent = () => {
    if (!data) return;
    const entries = filteredEntries();
    const hero = entries[0];
    const filterCounts = counts();
    content.hidden = false;
    loading.hidden = true;
    content.innerHTML = `
      <div class="news-toolbar">
        <div class="news-filters">
          ${FILTERS.filter((filter) => filter.key === 'all' || (filterCounts[filter.key] || 0) > 0).map((filter) => `<button class="news-filter ${activeFilter === filter.key ? 'active' : ''}" data-news-filter="${filter.key}">
            ${filter.label}<span>${filterCounts[filter.key] || 0}</span>
          </button>`).join('')}
        </div>
        <label class="news-search">
          ${icon('search', 14)}
          <input type="search" placeholder="搜索新闻标题…" data-news-search value="${escapeHtml(query)}" spellcheck="false">
        </label>
      </div>
      ${hero ? heroMarkup(hero) : ''}
      <div class="news-section-head">
        <div>
          <h2 class="section-title">${query ? '搜索结果' : activeFilter === 'all' ? '最新消息' : `${FILTERS.find((item) => item.key === activeFilter)?.label}新闻`}</h2>
          <p>${entries.length} 条${query ? '匹配' : ''}新闻${data.updatedAt ? ` · 更新于 ${formatUpdated(data.updatedAt)}` : ''}</p>
        </div>
        <span class="news-source">${icon('wifi', 12)} ${escapeHtml(data.source || 'Minecraft 官方')}</span>
      </div>
      ${entries.length ? `<div class="news-grid">${entries.slice(1, visible).map((entry, index) => cardMarkup(entry, index + 1)).join('')}</div>` : ''}
      ${!entries.length ? `<div class="news-empty">${icon('search', 30)}<strong>没有找到相关新闻</strong><span>换一个关键词，或切换分类看看。</span></div>` : ''}
      ${entries.length > visible ? `<div class="news-more"><button class="btn btn-secondary btn-sm" data-news-more>加载更多 ${icon('chevron-down', 12)}</button><span>已显示 ${Math.min(visible, entries.length)} / ${entries.length}</span></div>` : ''}
      <div class="news-footnote">${icon('info', 14)} 新闻内容来自 Minecraft 官方启动器内容接口，保持官方英文原文。配图版权归 Mojang Studios 所有。</div>
    `;

    content.querySelectorAll('[data-news-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        activeFilter = button.dataset.newsFilter;
        visible = PAGE_SIZE;
        renderContent();
      });
    });
    const searchInput = content.querySelector('[data-news-search]');
    let searchTimer = null;
    searchInput?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        query = searchInput.value;
        visible = PAGE_SIZE;
        renderContent();
        const nextInput = content.querySelector('[data-news-search]');
        nextInput?.focus();
        nextInput?.setSelectionRange(nextInput.value.length, nextInput.value.length);
      }, 180);
    });
    content.querySelector('[data-news-more]')?.addEventListener('click', () => {
      visible += PAGE_SIZE;
      renderContent();
    });
    content.querySelectorAll('[data-news-index]').forEach((card) => {
      const index = Number(card.dataset.newsIndex);
      const entry = entries[index];
      const activate = () => {
        if (!entry) return;
        if (typeof ctx.openNews === 'function') ctx.openNews(entry);
        else if (entry.link) ctx.api.openExternal(entry.link);
      };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
    });
  };

  const load = async (force = false) => {
    refreshButton.disabled = true;
    refreshButton.innerHTML = `<span class="spinner" style="width:12px;height:12px"></span> 刷新中`;
    try {
      data = await ctx.api.getMinecraftNews({ force });
      if (ctx.signal?.aborted) return;
      activeFilter = 'all';
      query = '';
      visible = PAGE_SIZE;
      renderContent();
    } catch (error) {
      if (ctx.signal?.aborted) return;
      loading.hidden = true;
      content.hidden = false;
      content.innerHTML = `<div class="page-error" style="padding:64px 20px">${icon('wifi', 32)}<strong>新闻加载失败</strong><span>${escapeHtml(error.message || '请检查网络后重试')}</span><button class="btn btn-secondary btn-sm" data-news-retry style="margin-top:12px">重新加载</button></div>`;
      content.querySelector('[data-news-retry]')?.addEventListener('click', () => load(true));
    } finally {
      if (!ctx.signal?.aborted) {
        refreshButton.disabled = false;
        refreshButton.innerHTML = `${icon('refresh', 13)} 刷新`;
      }
    }
  };

  refreshButton.addEventListener('click', () => load(true));
  await load(false);
  shell.classList.add('ready');
}
