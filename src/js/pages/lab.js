import { icon } from '../icons.js';
import { toast } from '../components.js';
import { escapeHtml } from '../utils.js';

export async function render(container, ctx) {
  container.innerHTML = `
    <div class="page lab-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">实验室</h1>
          <p class="page-subtitle">冲突排查、服务器整合包导出和投稿。</p>
        </div>
      </div>

      <div class="lab-grid">
        <section class="settings-card">
          <div class="settings-card-head">
            <div class="settings-icon">${icon('search', 15)}</div>
            <div><h3>自动检索 Mod 冲突</h3><p>扫描所有实例，找出重复 Mod 和文件冲突</p></div>
          </div>
          <div class="settings-card-body">
            <button class="btn btn-primary btn-sm" data-lab-scan>${icon('activity', 13)} 开始扫描</button>
            <div class="lab-result" data-lab-scan-result></div>
          </div>
        </section>

        <section class="settings-card">
          <div class="settings-card-head">
            <div class="settings-icon">${icon('server', 15)}</div>
            <div><h3>客户端整合包导出服务器包</h3><p>拖入客户端 .mrpack，自动移除客户端专用内容</p></div>
          </div>
          <div class="settings-card-body">
            <div class="lab-drop" data-lab-drop>
              ${icon('upload', 16)}
              <strong>拖入客户端整合包</strong>
              <span>.mrpack 或 .zip</span>
              <button class="btn btn-secondary btn-sm" data-lab-pick>选择文件</button>
            </div>
            <div class="lab-result" data-lab-export-result></div>
          </div>
        </section>

        <section class="settings-card">
          <div class="settings-card-head">
            <div class="settings-icon">${icon('mail', 15)}</div>
            <div><h3>投稿</h3><p>整合包、Mod、主题或建议</p></div>
          </div>
          <div class="settings-card-body">
            <div class="setting-row">
              <div class="setting-copy"><strong>投稿邮箱</strong><span>tianyi76@yeah.net</span></div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-secondary btn-sm" data-lab-mail>发邮件</button>
                <button class="btn btn-ghost btn-sm" data-lab-copy>复制</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  const scanResult = container.querySelector('[data-lab-scan-result]');
  container.querySelector('[data-lab-scan]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = '<span class="spinner" style="width:12px;height:12px"></span> 扫描中';
    scanResult.innerHTML = '<div class="lab-muted">正在扫描实例…</div>';
    try {
      const result = await ctx.api.scanModConflicts();
      if (!result.results.length) {
        scanResult.innerHTML = `<div class="lab-ok">${icon('check-circle', 14)} 扫描 ${result.scanned} 个实例，没有发现冲突</div>`;
        return;
      }
      scanResult.innerHTML = `<div class="lab-conflicts">${result.results.map((item) => `
        <div class="lab-conflict">
          <strong>${escapeHtml(item.instanceName)} · ${item.modCount} 个 Mod</strong>
          ${item.conflicts.map((conflict) => `<span>${escapeHtml(conflict.name)}：${escapeHtml(conflict.reason)}（${conflict.files.map(escapeHtml).join(', ')}）</span>`).join('')}
        </div>
      `).join('')}</div>`;
    } catch (error) {
      scanResult.innerHTML = `<div class="lab-error">${escapeHtml(error.message)}</div>`;
    } finally {
      button.disabled = false;
      button.innerHTML = `${icon('activity', 13)} 开始扫描`;
    }
  });

  const exportResult = container.querySelector('[data-lab-export-result]');
  const drop = container.querySelector('[data-lab-drop]');
  const exportPack = async (filePath = '') => {
    try {
      exportResult.innerHTML = '<div class="lab-muted">正在导出…</div>';
      const result = await ctx.api.exportServerPack(filePath);
      if (result.cancelled) {
        exportResult.innerHTML = '';
        return;
      }
      exportResult.innerHTML = `<div class="lab-ok">${icon('check-circle', 14)} 已导出 ${result.fileCount} / ${result.total} 个文件：${escapeHtml(result.file)}</div>`;
      toast({ title: '服务器整合包已导出' });
    } catch (error) {
      exportResult.innerHTML = `<div class="lab-error">${escapeHtml(error.message)}</div>`;
    }
  };
  container.querySelector('[data-lab-pick]')?.addEventListener('click', () => exportPack());
  let dragDepth = 0;
  container.addEventListener('dragenter', (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    dragDepth += 1;
    drop.classList.add('dragging');
  });
  container.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  container.addEventListener('dragleave', (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) drop.classList.remove('dragging');
  });
  container.addEventListener('drop', (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    dragDepth = 0;
    drop.classList.remove('dragging');
    const file = event.dataTransfer.files[0];
    const filePath = ctx.api.getPathForFile?.(file) || file.path || '';
    if (!filePath) {
      exportResult.innerHTML = '<div class="lab-error">无法读取拖入的文件</div>';
      return;
    }
    exportPack(filePath);
  });

  container.querySelector('[data-lab-mail]')?.addEventListener('click', () => ctx.api.openExternal('mailto:tianyi76@yeah.net?subject=TYCL%20Lab%20Submission'));
  container.querySelector('[data-lab-copy]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('tianyi76@yeah.net');
      toast({ title: '邮箱已复制' });
    } catch {
      toast({ title: '复制失败', type: 'error' });
    }
  });
}
