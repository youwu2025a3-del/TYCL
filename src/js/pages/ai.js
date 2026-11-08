import { icon } from '../icons.js';
import { escapeHtml, formatNumber } from '../utils.js';
import { toast } from '../components.js';

const STORAGE_KEY = 'tycl.ai.chat.v2';
const WELCOME = '我是 TYCL 助手。可以帮你找整合包、判断 Java 和内存、分析崩溃，或者一起规划一个能联机的实例。你想玩什么？';

function loadMessages() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Array.isArray(saved) && saved.length) return saved.filter((item) => item && (item.role === 'user' || item.role === 'assistant'));
  } catch { /* ignore */ }
  return [{ role: 'assistant', content: WELCOME }];
}

function formatText(text) {
  return escapeHtml(String(text || ''))
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

export async function render(container, ctx) {
  const state = ctx.state;
  let messages = loadMessages();
  let busy = false;

  const save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30))); } catch { /* ignore */ }
  };

  container.innerHTML = `
    <div class="ai-page">
      <div class="ai-head">
        <div>
          <div class="page-eyebrow">TYCL AI</div>
          <h1 class="page-title">AI 助手</h1>
          <p class="page-subtitle">找包、配 Java、看崩溃，都可以直接问。</p>
        </div>
        <div class="ai-head-actions">
          <label class="ai-switch" title="使用本地 Ollama / llama.cpp"><input type="checkbox" data-ai-toggle-local ${state.settings.aiLocalEnabled !== false ? 'checked' : ''}> 本地</label>
          <label class="ai-switch" title="使用云端 OpenAI 兼容 API"><input type="checkbox" data-ai-toggle-cloud ${state.settings.aiCloudEnabled !== false ? 'checked' : ''}> 云端</label>
          <label class="ai-switch" title="识别到整合包后自动下载"><input type="checkbox" data-ai-toggle-auto ${state.settings.aiAutoDownload === true ? 'checked' : ''}> 自动下载</label>
          <div class="ai-model" data-ai-model>${icon('sparkles', 13)} ${escapeHtml(state.settings.aiLocalEnabled === false && state.settings.aiCloudEnabled === false ? '内置意图' : state.settings.aiLocalEnabled === false ? '云端' : '自动')}</div>
          <button class="btn btn-ghost btn-xs" data-ai-settings>${icon('settings', 12)} 设置</button>
          <button class="btn btn-ghost btn-xs" data-ai-clear>清空</button>
        </div>
      </div>
      <div class="ai-scroll" data-ai-scroll>
        <div class="ai-thread" data-ai-thread></div>
      </div>
      <div class="ai-composer">
        <div class="ai-suggestions" data-ai-suggestions>
          <button data-ai-suggest="想玩轻量、有科技感、能联机的生存整合包">轻量科技生存包</button>
          <button data-ai-suggest="1.20.1 Fabric 适合多少内存？">Java 和内存怎么配</button>
          <button data-ai-suggest="联机时朋友 Mod 不一致怎么办？">联机 Mod 不一致</button>
          <button data-ai-suggest="游戏启动就崩，帮我判断原因">启动崩溃排查</button>
        </div>
        <div class="ai-input-wrap">
          <textarea data-ai-input rows="1" placeholder="问点什么，或者直接说你想玩什么…" spellcheck="false"></textarea>
          <button class="btn btn-primary ai-send" data-ai-send title="发送">${icon('arrow-up', 15)}</button>
        </div>
        <div class="ai-foot">AI 可能会出错，安装/开房/改实例前请确认。 <span data-ai-kb>内置知识库</span></div>
      </div>
    </div>
  `;

  const thread = container.querySelector('[data-ai-thread]');
  const input = container.querySelector('[data-ai-input]');
  const scroll = container.querySelector('[data-ai-scroll]');
  const sendButton = container.querySelector('[data-ai-send]');

  function renderMessages() {
    thread.innerHTML = messages.map((message, index) => {
      if (message.role === 'user') {
        return `<div class="ai-msg user"><div class="ai-bubble">${formatText(message.content)}</div></div>`;
      }
      const hits = message.hits || [];
      return `<div class="ai-msg assistant">
        <div class="ai-avatar">${icon('sparkles', 14)}</div>
        <div class="ai-content">
          <div class="ai-bubble">${formatText(message.content)}</div>
          ${hits.length ? `<div class="ai-hits">${hits.map((hit) => `<div class="ai-hit"><div><strong>${escapeHtml(hit.title)}</strong><span>${formatNumber(hit.downloads)} 次下载 · ${escapeHtml((hit.categories || []).slice(0, 2).join(' / '))}</span></div><button class="btn btn-secondary btn-xs" data-ai-view="${escapeHtml(hit.id)}">查看</button><button class="btn btn-primary btn-xs" data-ai-prepare="${escapeHtml(hit.id)}" data-ai-title="${escapeHtml(hit.title)}">一键准备</button></div>`).join('')}</div>` : ''}
          ${(message.actions || []).length ? `<div class="ai-actions">${message.actions.map((action) => `<button class="btn btn-secondary btn-xs" data-ai-action="${escapeHtml(JSON.stringify(action))}">${escapeHtml(action.type === 'diagnostics' ? '打开诊断' : action.type === 'open-mods' ? '打开 Mod 管理' : '打开相关页面')}</button>`).join('')}</div>` : ''}
          <div class="ai-msg-tools"><button class="ai-text-btn" data-ai-copy="${index}">复制</button>${index === messages.length - 1 && !busy ? `<button class="ai-text-btn" data-ai-regenerate>重新生成</button>` : ''}<button class="ai-text-btn" data-ai-support>没解决？诊断</button>${message.mode ? `<span>${escapeHtml(message.mode === 'api' ? '模型回复' : message.mode === 'fallback' ? '本地回退' : '本地检索')}</span>` : ''}</div>
        </div>
      </div>`;
    }).join('');
    thread.querySelectorAll('[data-ai-view]').forEach((button) => button.addEventListener('click', () => ctx.openProject(button.dataset.aiView)));
    thread.querySelectorAll('[data-ai-prepare]').forEach((button) => button.addEventListener('click', async () => {
      if (!ctx.state.settings.disclaimerAccepted) { toast({ title: '请先确认免责声明', message: '重新启动启动器并同意免责声明', type: 'error' }); return; }
      button.disabled = true;
      try {
        await ctx.api.prepareAiPack({ projectId: button.dataset.aiPrepare, title: button.dataset.aiTitle });
        toast({ title: '已开始准备', message: '安装、JVM、开房会在后台完成', duration: 6000 });
      } catch (error) {
        button.disabled = false;
        toast({ title: '准备失败', message: error.message, type: 'error' });
      }
    }));
    thread.querySelectorAll('[data-ai-action]').forEach((button) => button.addEventListener('click', () => {
      try {
        const action = JSON.parse(button.dataset.aiAction);
        if (action.type === 'open-page') ctx.navigate(action.page || 'settings');
        else if (action.type === 'open-mods') {
          const instance = (ctx.state.instances || [])[0];
          if (instance) ctx.openInstanceManager(instance);
          else ctx.navigate('versions');
        } else if (action.type === 'diagnostics') {
          const instance = (ctx.state.instances || []).find((item) => item.id === action.instanceId) || (ctx.state.instances || [])[0];
          if (instance) ctx.openDiagnostics(instance, { crash: true });
        }
      } catch { /* ignore */ }
    }));
    thread.querySelectorAll('[data-ai-copy]').forEach((button) => button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(messages[Number(button.dataset.aiCopy)]?.content || ''); toast({ title: '已复制' }); } catch { /* ignore */ }
    }));
    thread.querySelector('[data-ai-regenerate]')?.addEventListener('click', regenerate);
    thread.querySelectorAll('[data-ai-support]').forEach((button) => button.addEventListener('click', () => {
      const instance = (ctx.state.instances || [])[0];
      if (instance) ctx.openDiagnostics(instance, { crash: true });
      else ctx.navigate('versions');
    }));
    scroll.scrollTop = scroll.scrollHeight;
    save();
  }

  async function ask(history) {
    const payload = history.filter((item) => item.role === 'user' || item.role === 'assistant').slice(-14).map((item) => ({ role: item.role, content: item.content }));
    const pending = { role: 'assistant', content: '正在想…' };
    messages.push(pending);
    busy = true;
    sendButton.disabled = true;
    renderMessages();
    try {
      const result = await ctx.api.aiChat(payload);
      pending.content = result.text || '我没有想好怎么回答。';
      pending.hits = result.hits || [];
      pending.actions = result.actions || [];
      pending.mode = result.mode;
      if (result.warning) pending.content += `\n\n（接口不可用，已回退本地检索：${result.warning}）`;
      const lastUser = [...payload].reverse().find((item) => item.role === 'user')?.content || '';
      const explicitDownload = /(帮我下|下载|装一下|安装)/.test(lastUser);
      const autoWanted = (state.settings.aiAutoDownload === true || explicitDownload)
        && pending.hits.length
        && /(想玩|推荐|帮我下|下载|整合包|轻量|科技|生存|空岛|宝可梦|任务)/.test(lastUser)
        && !/不一致|崩|java|内存/.test(lastUser);
      if (autoWanted) {
        pending.autoPrepared = true;
        pending.content += `\n\n已自动选择「${pending.hits[0].title}」，开始下载安装…`;
        try {
          await ctx.api.prepareAiPack({ projectId: pending.hits[0].id, title: pending.hits[0].title, autoRoom: false });
          pending.content += '\n下载任务已开始，完成后可在实例列表看到。';
        } catch (error) {
          pending.content += `\n自动下载失败：${error.message}`;
        }
      }
    } catch (error) {
      pending.content = `出错了：${error.message}`;
      pending.mode = 'error';
    } finally {
      busy = false;
      sendButton.disabled = false;
      renderMessages();
      input.focus();
    }
  }

  async function send(text) {
    const value = String(text || input.value || '').trim();
    if (!value || busy) return;
    input.value = '';
    input.style.height = 'auto';
    messages.push({ role: 'user', content: value });
    renderMessages();
    await ask(messages);
  }

  async function regenerate() {
    if (busy) return;
    while (messages.length && messages[messages.length - 1].role !== 'user') messages.pop();
    if (!messages.some((item) => item.role === 'user')) return;
    await ask(messages);
  }

  container.querySelector('[data-ai-send]').addEventListener('click', () => send());
  const updateModeBadge = () => {
    const badge = container.querySelector('[data-ai-model]');
    if (!badge) return;
    const local = state.settings.aiLocalEnabled !== false;
    const cloud = state.settings.aiCloudEnabled !== false;
    badge.innerHTML = icon('sparkles', 13) + ' ' + (local && cloud ? '自动' : local ? '本地优先' : cloud ? '云端' : '内置意图');
  };
  container.querySelector('[data-ai-toggle-local]').addEventListener('change', async (event) => {
    state.settings.aiLocalEnabled = event.target.checked;
    updateModeBadge();
    try { await ctx.saveSettings({ aiLocalEnabled: event.target.checked }); } catch (error) { toast({ title: '保存失败', message: error.message, type: 'error' }); }
  });
  container.querySelector('[data-ai-toggle-auto]').addEventListener('change', async (event) => {
    state.settings.aiAutoDownload = event.target.checked;
    try { await ctx.saveSettings({ aiAutoDownload: event.target.checked }); toast({ title: event.target.checked ? '已开启自动下载' : '已关闭自动下载' }); } catch (error) { toast({ title: '保存失败', message: error.message, type: 'error' }); }
  });
  container.querySelector('[data-ai-toggle-cloud]').addEventListener('change', async (event) => {
    state.settings.aiCloudEnabled = event.target.checked;
    updateModeBadge();
    try { await ctx.saveSettings({ aiCloudEnabled: event.target.checked }); } catch (error) { toast({ title: '保存失败', message: error.message, type: 'error' }); }
  });
  container.querySelector('[data-ai-clear]').addEventListener('click', () => {
    messages = [{ role: 'assistant', content: WELCOME }];
    renderMessages();
    toast({ title: '对话已清空' });
  });
  container.querySelector('[data-ai-settings]').addEventListener('click', () => ctx.navigate('settings'));
  container.querySelectorAll('[data-ai-suggest]').forEach((button) => button.addEventListener('click', () => send(button.dataset.aiSuggest)));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(180, input.scrollHeight) + 'px';
  });
  renderMessages();
  ctx.api.aiKnowledge?.().then((result) => {
    const el = container.querySelector('[data-ai-kb]');
    if (el) el.textContent = '内置知识库 ' + (result.count || 0) + ' 条';
  }).catch(() => {});
  ctx.api.aiLocalStatus?.().then((result) => {
    const badge = container.querySelector('[data-ai-model]');
    if (badge && result.available) badge.innerHTML = icon('cpu', 13) + ' 本地 · ' + escapeHtml(result.models?.[0] || state.settings.aiLocalModel || 'model');
  }).catch(() => {});
  input.focus();
}
