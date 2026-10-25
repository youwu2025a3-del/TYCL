import { icon } from '../icons.js';
import { escapeHtml } from '../utils.js';
import { toast } from '../components.js';
import { createSkinViewer } from '../skin3d.js';

export async function render(container, ctx) {
  const { state } = ctx;
  const skins = state.skins || [];
  let activeId = state.activeSkin?.id || skins[0]?.id;
  let activeModel = state.player.model || 'classic';
  let selectedId = activeId;
  let selectedModel = activeModel;
  let viewer = null;

  function selectedSkin() {
    return skins.find((skin) => skin.id === selectedId) || skins[0];
  }

  function libraryMarkup() {
    return skins
      .map(
        (skin) => `<button class="skin-thumb ${skin.id === selectedId ? 'active' : ''}" data-skin="${escapeHtml(skin.id)}" title="${escapeHtml(skin.name)}">
          <span class="skin-thumb-head" style="background-image:url(&quot;${skin.dataUrl}&quot;)"></span>
          <span>${escapeHtml(skin.name)}</span>
        </button>`,
      )
      .join('');
  }

  function infoMarkup() {
    const skin = selectedSkin();
    return `
      <div class="skin-name-row">
        <div>
          <h2>${escapeHtml(skin.name)}</h2>
          <p class="skin-desc">${escapeHtml(skin.description || '本地导入的皮肤')}</p>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          ${skin.official ? `<span class="badge badge-accent">Microsoft 正版</span>` : ''}
          <span class="skin-model-pill">${selectedModel === 'slim' ? '纤细' : '经典'}模型</span>
        </div>
      </div>
      <div class="skin-field">
        <div class="field-label">手臂模型 <span class="field-hint" style="font-weight:400">保存后生效</span></div>
        <div class="skin-model-toggle">
          <button class="skin-model-option ${selectedModel === 'classic' ? 'active' : ''}" data-model="classic">
            <span><strong>经典</strong><br><span style="font-size:9.5px">4px 手臂</span></span>
            ${icon('user', 15)}
          </button>
          <button class="skin-model-option ${selectedModel === 'slim' ? 'active' : ''}" data-model="slim">
            <span><strong>纤细</strong><br><span style="font-size:9.5px">3px 手臂</span></span>
            ${icon('user', 15)}
          </button>
        </div>
      </div>
      <div class="skin-actions">
        <button class="btn btn-secondary btn-sm" data-upload-button style="flex:1">${icon('upload', 13)} 导入皮肤</button>
        <button class="btn btn-primary btn-sm" data-apply style="flex:1">${icon('check', 13)} 应用皮肤</button>
      </div>
      <div class="upload-zone" data-dropzone>
        <div class="upload-zone-icon">${icon('image', 15)}</div>
        <div style="flex:1">
          <strong>拖入 PNG 皮肤文件</strong>
          <span>64×64 或 64×32 · 支持经典与纤细模型</span>
        </div>
      </div>
      <div class="notice" style="margin-top:12px">
        ${icon('info', 15)}
        <span>${ctx.state.account?.mode === 'microsoft' ? '正版皮肤来自 Microsoft 账户，启动器会显示你当前的官方皮肤。本地导入的皮肤只用于启动器预览，不会自动上传到 Mojang。' : '皮肤保存在本机，仅由 TYCL 展示。离线账户无法在官方服务器同步皮肤。'}</span>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-eyebrow">WARDROBE</div>
          <h1 class="page-title">皮肤工坊</h1>
          <p class="page-subtitle">为你的角色挑一身新衣服。拖动预览、导入自己的皮肤，让每次出发都更像你。</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" data-account>${icon('user', 15)} ${escapeHtml(ctx.displayName?.() || state.player.name)}</button>
        </div>
      </div>

      <div class="skin-layout">
        <div class="skin-stage-card">
          <div class="skin-stage-top">
            <span class="status-pill"><i></i> 实时预览</span>
            <span class="badge badge-outline" style="background:rgba(255,255,255,.55)">3D VIEW</span>
          </div>
          <div class="skin-figure-wrap" data-skin-stage></div>
          <div class="skin-stage-hint">拖动旋转 · 双击复位</div>
          <div class="skin-controls">
            <button class="skin-control-btn" data-reset title="复位视角">${icon('rotate', 14)}</button>
            <button class="skin-control-btn" data-spin title="暂停 / 继续旋转">${icon('eye', 14)}</button>
          </div>
        </div>

        <div class="skin-panel">
          <div class="skin-info-card" data-skin-info>${infoMarkup()}</div>
          <div class="skin-library-card">
            <div class="section-head" style="margin-bottom:10px">
              <h3 class="section-title">皮肤库 <span class="muted">${skins.length} 款</span></h3>
              <button class="section-link" data-upload-link>${icon('plus', 12)} 导入</button>
            </div>
            <div class="skin-library-grid" data-skin-library>${libraryMarkup()}</div>
          </div>
        </div>
      </div>
    </div>
    <input type="file" accept="image/png" hidden data-file-input>
  `;

  const stage = container.querySelector('[data-skin-stage]');
  viewer = createSkinViewer(stage, {
    dataUrl: selectedSkin().dataUrl,
    model: selectedModel,
  });

  const fileInput = container.querySelector('[data-file-input]');

  function updateInfo() {
    const skin = selectedSkin();
    container.querySelector('[data-skin-info]').innerHTML = infoMarkup();
    bindInfoEvents();
    container.querySelector('[data-skin-library]').innerHTML = libraryMarkup();
    bindLibraryEvents();
    viewer.setSkin(skin.dataUrl, selectedModel);
    const applyButton = container.querySelector('[data-apply]');
    if (applyButton) {
      const applied = selectedId === activeId && selectedModel === activeModel;
      applyButton.disabled = applied;
      applyButton.innerHTML = applied ? `${icon('check', 13)} 已应用` : `${icon('check', 13)} ${selectedSkin().official ? '使用正版皮肤' : '应用皮肤'}`;
    }
  }

  function bindLibraryEvents() {
    container.querySelectorAll('[data-skin]').forEach((button) => {
      button.addEventListener('click', () => {
        if (selectedId === button.dataset.skin) return;
        selectedId = button.dataset.skin;
        const skin = selectedSkin();
        selectedModel = skin.model || 'classic';
        updateInfo();
      });
    });
  }

  function bindInfoEvents() {
    const apply = container.querySelector('[data-apply]');
    apply?.addEventListener('click', async () => {
      if (selectedId === activeId && selectedModel === activeModel) return;
      try {
        const result = await ctx.api.setSkin({ skinId: selectedId, model: selectedModel });
        ctx.applyBootstrap(result);
        activeId = result.activeSkinId;
        activeModel = result.player.model;
        updateInfo();
        toast({ title: '皮肤已应用', message: `${selectedSkin().name} · ${selectedModel === 'slim' ? '纤细' : '经典'}模型` });
      } catch (error) {
        toast({ title: '应用皮肤失败', message: error.message, type: 'error' });
      }
    });
    container.querySelectorAll('[data-model]').forEach((button) => {
      button.addEventListener('click', () => {
        selectedModel = button.dataset.model;
        updateInfo();
      });
    });
    container.querySelector('[data-upload-button]')?.addEventListener('click', () => fileInput.click());
    const zone = container.querySelector('[data-dropzone]');
    zone?.addEventListener('click', () => fileInput.click());
    zone?.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('dragging');
    });
    zone?.addEventListener('dragleave', () => zone.classList.remove('dragging'));
    zone?.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('dragging');
      const file = event.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });
    const stageEl = container.querySelector('[data-skin-stage]');
    stageEl?.addEventListener('dragover', (event) => event.preventDefault());
    stageEl?.addEventListener('drop', (event) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });
  }

  async function handleFile(file) {
    if (!file) return;
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
      toast({ title: '仅支持 PNG 文件', message: '请选择 Minecraft 皮肤 PNG 文件', type: 'error' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: '文件过大', message: '皮肤文件不应超过 2 MB', type: 'error' });
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const image = new Image();
    image.src = dataUrl;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
    if (!((image.width === 64 && image.height === 64) || (image.width === 64 && image.height === 32))) {
      toast({ title: '皮肤尺寸不正确', message: `当前为 ${image.width}×${image.height}，需要 64×64 或 64×32`, type: 'error' });
      return;
    }
    try {
      const result = await ctx.api.uploadSkin({ dataUrl, name: file.name.replace(/\.png$/i, '') || '我的皮肤' });
      ctx.applyBootstrap(result);
      selectedId = result.activeSkinId;
      activeId = result.activeSkinId;
      selectedModel = result.player.model;
      activeModel = result.player.model;
      toast({ title: '皮肤已导入并应用', message: '拖动预览看看吧' });
      ctx.rerender();
    } catch (error) {
      toast({ title: '导入皮肤失败', message: error.message, type: 'error' });
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
    fileInput.value = '';
  });
  container.querySelector('[data-upload-link]')?.addEventListener('click', () => fileInput.click());
  container.querySelector('[data-account]')?.addEventListener('click', () => ctx.openAccount());
  container.querySelector('[data-reset]')?.addEventListener('click', () => viewer.reset());
  container.querySelector('[data-spin]')?.addEventListener('click', (event) => {
    const next = !viewer.isSpinning();
    viewer.setSpin(next);
    event.currentTarget.style.color = next ? 'var(--accent-strong)' : 'var(--faint)';
  });

  bindLibraryEvents();
  bindInfoEvents();
  const applyButton = container.querySelector('[data-apply]');
  if (applyButton) {
    const applied = selectedId === activeId && selectedModel === activeModel;
    applyButton.disabled = applied;
    applyButton.innerHTML = applied ? `${icon('check', 13)} 已应用` : `${icon('check', 13)} 应用皮肤`;
  }

  return () => {
    viewer?.destroy();
  };
}
