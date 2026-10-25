import { icon, hydrateIcons } from './icons.js';
import { escapeHtml } from './utils.js';

const toastRoot = document.getElementById('toast-root');
const modalRoot = document.getElementById('modal-root');
let activeMenu = null;

export function toast({ title, message = '', type = 'success', duration = 3800 } = {}) {
  if (!toastRoot) return () => {};
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const iconName = type === 'error' ? 'alert-triangle' : type === 'info' ? 'info' : 'check';
  el.innerHTML = `
    <div class="toast-icon">${icon(iconName, 14)}</div>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
    </div>
    <button class="toast-close" aria-label="关闭">${icon('close', 12)}</button>
  `;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector('.toast-close').addEventListener('click', close);
  toastRoot.appendChild(el);
  while (toastRoot.children.length > 4) {
    toastRoot.firstElementChild.remove();
  }
  if (duration > 0) setTimeout(close, duration);
  return close;
}

export function closeMenu() {
  if (!activeMenu) return;
  activeMenu.remove();
  activeMenu = null;
  document.removeEventListener('mousedown', onDocumentMouseDown, true);
  window.removeEventListener('resize', closeMenu);
  window.removeEventListener('scroll', closeMenu, true);
}

function onDocumentMouseDown(event) {
  if (activeMenu && !activeMenu.contains(event.target)) closeMenu();
}

export function openMenu(anchor, items, options = {}) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items
    .map((item, index) => {
      if (item.separator) return '<div class="menu-sep"></div>';
      return `<button class="menu-item ${item.danger ? 'danger' : ''}" data-menu-index="${index}" ${item.disabled ? 'disabled' : ''}>
        ${item.icon ? icon(item.icon, 14) : ''}
        <span>${escapeHtml(item.label)}</span>
      </button>`;
    })
    .join('');
  menu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-menu-index]');
    if (!button) return;
    const item = items[Number(button.dataset.menuIndex)];
    if (!item || item.disabled) return;
    closeMenu();
    if (typeof item.onClick === 'function') item.onClick();
  });
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const width = menuRect.width;
  const height = menuRect.height;
  let left = options.align === 'left' ? rect.left : rect.right - width;
  let top = rect.bottom + 6;
  if (top + height > window.innerHeight - 10) top = rect.top - height - 6;
  left = Math.max(10, Math.min(window.innerWidth - width - 10, left));
  top = Math.max(10, top);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  activeMenu = menu;
  setTimeout(() => {
    document.addEventListener('mousedown', onDocumentMouseDown, true);
  }, 0);
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);
  return menu;
}

export function openModal({
  title = '',
  subtitle = '',
  body = '',
  footer = '',
  size = '',
  header = '',
  className = '',
  closeOnBackdrop = true,
  onMount = null,
  onClose = null,
} = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = `modal ${size} ${className}`.trim();
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    ${
      header ||
      `<div class="modal-head">
        <div class="modal-head-main">
          <h2 class="modal-title">${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="modal-subtitle">${escapeHtml(subtitle)}</p>` : ''}
        </div>
        <button class="modal-close" aria-label="关闭">${icon('close', 16)}</button>
      </div>`
    }
    <div class="modal-body"></div>
    ${footer ? '<div class="modal-foot"></div>' : ''}
  `;
  const bodyEl = modal.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body instanceof Node) bodyEl.appendChild(body);
  const footerEl = modal.querySelector('.modal-foot');
  if (footerEl) {
    if (typeof footer === 'string') footerEl.innerHTML = footer;
    else if (footer instanceof Node) footerEl.appendChild(footer);
  }
  backdrop.appendChild(modal);
  modalRoot.appendChild(backdrop);
  hydrateIcons(modal);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    modal.classList.add('closing');
    backdrop.style.animation = 'fade-in .16s ease reverse both';
    setTimeout(() => {
      backdrop.remove();
      if (typeof onClose === 'function') onClose();
    }, 150);
    document.removeEventListener('keydown', onKeydown);
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeydown);
  modal.querySelectorAll('.modal-close, [data-modal-close]').forEach((button) => {
    button.addEventListener('click', close);
  });
  if (closeOnBackdrop) {
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) close();
    });
  }
  if (typeof onMount === 'function') onMount(modal, close);
  return { root: modal, backdrop, close, body: bodyEl, footer: footerEl };
}

export function confirmDialog({
  title = '确认操作',
  message = '',
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value, close) => {
      if (settled) return;
      settled = true;
      resolve(value);
      close();
    };
    const { root, close } = openModal({
      title,
      size: '',
      body: `<p style="margin:0;color:var(--muted-strong);font-size:12px;line-height:1.7">${escapeHtml(message)}</p>`,
      footer: `<button class="btn btn-secondary btn-sm" data-cancel>${escapeHtml(cancelText)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" data-confirm>${escapeHtml(confirmText)}</button>`,
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    });
    root.querySelector('[data-cancel]').addEventListener('click', () => finish(false, close));
    root.querySelector('[data-confirm]').addEventListener('click', () => finish(true, close));
  });
}

export function skeletonCards(count = 6, className = 'resource-skeleton') {
  return Array.from({ length: count }, () => `<div class="skeleton ${className}"></div>`).join('');
}

export function emptyState({ iconName = 'box', title, message, action = '' }) {
  return `<div class="empty-state">
    <div class="empty-art">${icon(iconName, 27)}</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(message)}</p>
    ${action}
  </div>`;
}

export function setAvatar(element, dataUrl) {
  if (!element) return;
  element.replaceChildren();
  if (!dataUrl) return;
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = '';
  img.className = 'avatar-crop-img';
  img.decoding = 'async';
  element.appendChild(img);
}

export function applyThemeDom(theme, accent) {
  const actual = theme === 'system'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.body.dataset.theme = actual;
  document.body.dataset.themeMode = theme;
  document.body.dataset.accent = accent || 'mint';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', actual === 'dark' ? '#0b1015' : '#f4f6f8');
  document.dispatchEvent(new CustomEvent('tycl:theme-changed', { detail: { theme: actual } }));
}

export function ensureThemeColorMeta() {
  if (!document.querySelector('meta[name="theme-color"]')) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
}
