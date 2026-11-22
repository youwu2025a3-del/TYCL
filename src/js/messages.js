import { openModal, toast } from './components.js';
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function badgeElement() {
  return document.getElementById('message-badge');
}

export function updateMessageBadge(count) {
  const badge = badgeElement();
  if (!badge) return;
  const value = Number(count) || 0;
  badge.textContent = value > 99 ? '99+' : String(value);
  badge.classList.toggle('visible', value > 0);
  badge.setAttribute('aria-label', value ? `${value} 条未读消息` : '没有未读消息');
}

export async function refreshMessages(api, { notify = false, remote = false } = {}) {
  try {
    const data = remote ? await api.refreshMessages() : await api.listMessages();
    updateMessageBadge(data.unread);
    if (notify && data.unread) {
      const unread = data.messages.find((item) => !(data.read || []).includes(item.id));
      if (unread) {
        const last = localStorage.getItem('tycl-last-message-toast') || '';
        if (last !== unread.id) {
          localStorage.setItem('tycl-last-message-toast', unread.id);
          toast({
            title: unread.title,
            message: unread.message || '打开消息中心查看。',
            type: 'info',
            duration: 8000,
          });
        }
      }
    }
    return data;
  } catch {
    return null;
  }
}

export async function openMessageCenter(ctx) {
  if (document.querySelector('.message-center-modal')) return;
  let data = await ctx.api.listMessages().catch(() => ({ messages: [], read: [], unread: 0 }));
  let loading = false;
  const modal = openModal({
    title: '消息中心',
    subtitle: '祝福和公告会保存在这里，不需要更新启动器',
    size: 'modal-md',
    className: 'message-center-modal',
    body: '<div class="message-center-loading"><span class="spinner"></span> 正在读取消息…</div>',
    footer: '<button class="btn btn-secondary btn-sm" data-msg-refresh>刷新</button><button class="btn btn-primary btn-sm" data-modal-close>关闭</button>',
  });

  const render = async (fresh = false) => {
    if (loading) return;
    loading = true;
    const body = modal.body;
    body.innerHTML = '<div class="message-center-loading"><span class="spinner"></span> 正在读取消息…</div>';
    try {
      data = fresh ? await ctx.api.refreshMessages() : await ctx.api.listMessages();
      updateMessageBadge(data.unread);
      const read = new Set(data.read || []);
      const messages = data.messages || [];
      body.innerHTML = `
        <div class="message-toolbar">
          <span>共 ${messages.length} 条消息${data.unread ? ` · ${data.unread} 条未读` : ''}</span>
          <button class="btn btn-ghost btn-xs" data-msg-read-all ${data.unread ? '' : 'disabled'}>全部已读</button>
        </div>
        ${data.error ? `<div class="notice warn">${icon('alert-triangle', 14)}<span>${escapeHtml(data.error)}，当前显示本地保存的消息。</span></div>` : ''}
        <div class="message-list">
          ${messages.length ? messages.map((message) => `
            <article class="message-card ${read.has(message.id) ? '' : 'unread'}">
              <div class="message-card-top">
                <span class="message-type ${message.type}">${message.type === 'notice' ? '公告' : '祝福'}</span>
                <span class="message-date">${escapeHtml(formatDate(message.date))}</span>
              </div>
              <h3>${escapeHtml(message.title)}</h3>
              <p>${escapeHtml(message.message)}</p>
              <div class="message-card-foot">
                <span>${escapeHtml(message.author || 'A3Y8')}</span>
                ${message.link ? `<a href="${escapeHtml(message.link)}" target="_blank" rel="noreferrer">查看链接 ${icon('external-link', 11)}</a>` : ''}
              </div>
            </article>
          `).join('') : '<div class="message-empty">还没有消息。以后会在这里收到祝福和公告。</div>'}
        </div>
        <div class="message-center-foot">${icon('info', 13)}<span>消息保存在本机，刷新只会新增和更新，不会删除旧消息。</span></div>
      `;
      body.querySelector('[data-msg-read-all]')?.addEventListener('click', async () => {
        await ctx.api.markMessagesRead();
        await render(false);
      });
    } catch (error) {
      body.innerHTML = `<div class="message-empty">读取失败：${escapeHtml(error.message)}</div>`;
    } finally {
      loading = false;
    }
  };

  modal.root.querySelector('[data-msg-refresh]')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = '<span class="spinner" style="width:11px;height:11px"></span> 刷新中';
    render(true).finally(() => {
      button.disabled = false;
      button.innerHTML = `${icon('refresh', 13)} 刷新`;
    });
  });

  await render(false);
  // 打开消息中心即视为阅读；卡片仍保留“未读”视觉，直到下次刷新。
  if (data?.unread) {
    await ctx.api.markMessagesRead().then(() => updateMessageBadge(0)).catch(() => {});
  }
}
