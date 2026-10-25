import { icon } from '../icons.js';
import { escapeHtml } from '../utils.js';
import { toast, confirmDialog } from '../components.js';

function statusText(status) {
  if (!status) return '未检测';
  if (!status.online) return status.error || '离线';
  return `${status.players?.online ?? 0}/${status.players?.max ?? 0}`;
}

function addressOf(server) {
  return server.address || '';
}

export async function render(container, ctx) {
  const { state } = ctx;
  let instanceId = state.ui.selectedInstanceId || state.instances[0]?.id || '';
  let servers = [];
  let lanWorlds = [];
  let tunnel = { active: false };
  let lanTimer = null;
  let tunnelBusy = false;

  container.innerHTML = `
    <div class="page multi-page">
      <div class="page-header">
        <div>
          <div class="page-eyebrow">PLAY TOGETHER</div>
          <h1 class="page-title">联机</h1>
          <p class="page-subtitle">把朋友拉进同一个世界。开房间、进服务器，或者直接发现局域网里的世界。</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" data-multi-refresh>${icon('refresh', 15)} 刷新状态</button>
        </div>
      </div>

      <div class="multi-layout">
        <section class="multi-card multi-open-card">
          <div class="multi-card-head">
            <div class="multi-icon">${icon('globe', 20)}</div>
            <div><h2>开一个公网房间</h2><p>把本地 Minecraft 端口映射到公网，不需要路由器设置。</p></div>
          </div>
          <div class="multi-tunnel-body">
            <div class="field">
              <div class="field-label">本地端口</div>
              <div class="path-field">
                <input class="input" type="number" min="1" max="65535" value="25565" data-tunnel-port>
                <button class="btn btn-primary" data-tunnel-start>${icon('zap', 14)} 开启房间</button>
              </div>
              <div class="field-hint">在游戏里「对局域网开放」，或启动本地服务器后，把端口填在这里。默认 25565。</div>
            </div>
            <div class="multi-address ${tunnel.active ? '' : 'hidden'}" data-tunnel-result>
              <span class="multi-address-label">朋友连接这个地址</span>
              <strong data-tunnel-address>${escapeHtml(tunnel.address || '')}</strong>
              <div class="multi-address-actions">
                <button class="btn btn-secondary btn-sm" data-copy-tunnel>${icon('copy', 12)} 复制地址</button>
                <button class="btn btn-ghost btn-sm" data-tunnel-stop>停止房间</button>
              </div>
            </div>
          </div>
          <div class="multi-note">${icon('shield', 13)} 房间通过开源工具 bore 建立；地址公开，请只发给朋友。关闭 TYCL 或停止房间后地址失效。</div>
        </section>

        <section class="multi-card">
          <div class="multi-card-head">
            <div class="multi-icon">${icon('play', 20)}</div>
            <div><h2>加入世界</h2><p>选择实例，输入地址，直接进入服务器。</p></div>
          </div>
          <div class="multi-join">
            <div class="field">
              <div class="field-label">使用实例</div>
              <div class="select-wrap">
                <select class="select" data-join-instance>
                  ${state.instances.length ? state.instances.map((instance) => `<option value="${escapeHtml(instance.id)}" ${instance.id === instanceId ? 'selected' : ''}>${escapeHtml(instance.name)} · ${escapeHtml(instance.baseVersion)}</option>`).join('') : '<option value="">没有可用实例</option>'}
                </select>
              </div>
            </div>
            <div class="field">
              <div class="field-label">服务器地址</div>
              <div class="path-field">
                <input class="input" data-join-address placeholder="play.example.com:25565" spellcheck="false">
                <button class="btn btn-primary" data-join>${icon('arrow-right', 14)} 进入</button>
              </div>
              <div class="field-hint">没写端口时使用 25565。进入后由 Minecraft 的 quickPlay 直接连接。</div>
            </div>
          </div>
        </section>
      </div>

      <div class="multi-bottom">
        <section class="multi-card">
          <div class="multi-section-head">
            <div><h2>服务器列表</h2><p>收藏常去的服务器，一键进入。</p></div>
            <button class="btn btn-secondary btn-sm" data-ping-all>${icon('activity', 12)} 测速</button>
          </div>
          <div class="multi-add-server">
            <input class="input" data-server-name placeholder="名称（可选）" maxlength="48">
            <input class="input" data-server-address placeholder="地址:端口" spellcheck="false">
            <button class="btn btn-primary btn-sm" data-server-add>${icon('plus', 12)} 添加</button>
          </div>
          <div class="server-list" data-server-list><div class="multi-empty">正在读取服务器…</div></div>
        </section>

        <section class="multi-card">
          <div class="multi-section-head">
            <div><h2>局域网世界</h2><p>同一个 Wi-Fi 下，游戏里开放的局域网世界。</p></div>
            <span class="badge badge-outline" data-lan-count>扫描中</span>
          </div>
          <div class="lan-list" data-lan-list><div class="multi-empty">${icon('wifi', 22)}<span>在游戏里对局域网开放后，这里会自动出现。</span></div></div>
        </section>
      </div>
    </div>
  `;

  const body = container.querySelector('.multi-page');

  const renderServers = () => {
    const list = body.querySelector('[data-server-list]');
    if (!list) return;
    if (!servers.length) {
      list.innerHTML = `<div class="multi-empty">${icon('globe', 24)}<span>还没有收藏服务器。输入地址添加一个。</span></div>`;
      return;
    }
    list.innerHTML = servers.map((server) => {
      const status = server.status;
      const online = status?.online;
      return `<div class="server-row ${online ? 'online' : ''}">
        <div class="server-favicon">${status?.favicon ? `<img src="${escapeHtml(status.favicon)}" alt="">` : icon('cube', 18)}</div>
        <div class="server-main">
          <div class="server-title"><strong>${escapeHtml(server.name || server.host)}</strong><span class="status-dot ${online ? 'ok' : 'off'}"></span><span class="server-status">${escapeHtml(statusText(status))}</span></div>
          <span>${escapeHtml(addressOf(server))}${status?.version ? ` · ${escapeHtml(status.version)}` : ''}${status?.latency ? ` · ${status.latency}ms` : ''}</span>
          ${status?.motd ? `<small>${escapeHtml(status.motd)}</small>` : ''}
        </div>
        <div class="server-actions">
          <button class="btn btn-primary btn-xs" data-join-server="${escapeHtml(addressOf(server))}">进入</button>
          <button class="btn btn-ghost btn-xs" data-remove-server="${escapeHtml(server.id)}">移除</button>
        </div>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-join-server]').forEach((button) => {
      button.addEventListener('click', () => join(button.dataset.joinServer));
    });
    list.querySelectorAll('[data-remove-server]').forEach((button) => {
      button.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: '移除服务器', message: '只会从收藏列表移除，不会删除游戏数据。', confirmText: '移除' });
        if (!ok) return;
        await ctx.api.removeServer(button.dataset.removeServer);
        await loadServers();
      });
    });
  };

  const renderLan = () => {
    const list = body.querySelector('[data-lan-list]');
    const count = body.querySelector('[data-lan-count]');
    if (!list) return;
    count.textContent = lanWorlds.length ? `${lanWorlds.length} 个世界` : '扫描中';
    if (!lanWorlds.length) {
      list.innerHTML = `<div class="multi-empty">${icon('wifi', 22)}<span>在游戏里对局域网开放后，这里会自动出现。</span></div>`;
      return;
    }
    list.innerHTML = lanWorlds.map((world) => `<div class="lan-row">
      <div class="lan-icon">${icon('wifi', 16)}</div>
      <div class="lan-main"><strong>${escapeHtml(world.motd)}</strong><span>${escapeHtml(world.address)}</span></div>
      <button class="btn btn-primary btn-xs" data-join-lan="${escapeHtml(world.address)}">进入</button>
    </div>`).join('');
    list.querySelectorAll('[data-join-lan]').forEach((button) => {
      button.addEventListener('click', () => join(button.dataset.joinLan));
    });
  };

  const renderTunnel = () => {
    const result = body.querySelector('[data-tunnel-result]');
    const address = body.querySelector('[data-tunnel-address]');
    if (!result || !address) return;
    result.classList.toggle('hidden', !tunnel.active);
    address.textContent = tunnel.address || '';
    const start = body.querySelector('[data-tunnel-start]');
    if (start) {
      start.disabled = tunnelBusy;
      start.innerHTML = tunnelBusy ? '<span class="spinner" style="width:13px;height:13px"></span> 创建中' : `${icon('zap', 14)} 开启房间`;
    }
  };

  const join = async (address) => {
    if (!instanceId) {
      toast({ title: '没有可用实例', message: '请先安装一个 Minecraft 版本', type: 'error' });
      return;
    }
    try {
      await ctx.api.startLaunch(instanceId, { serverAddress: address });
      toast({ title: '正在启动并连接', message: address, type: 'info' });
    } catch (error) {
      toast({ title: '联机启动失败', message: error.message, type: 'error', duration: 6000 });
    }
  };

  const loadServers = async () => {
    try {
      servers = await ctx.api.listServers();
      renderServers();
      const results = await ctx.api.pingAllServers();
      servers = results;
      renderServers();
    } catch (error) {
      toast({ title: '服务器列表加载失败', message: error.message, type: 'error' });
    }
  };

  const refreshLan = async () => {
    try {
      lanWorlds = await ctx.api.listLanWorlds();
      renderLan();
    } catch {
      // 局域网扫描失败时保持安静
    }
  };

  body.querySelector('[data-multi-refresh]').addEventListener('click', () => {
    loadServers();
    refreshLan();
  });
  body.querySelector('[data-ping-all]').addEventListener('click', loadServers);
  body.querySelector('[data-join-instance]').addEventListener('change', (event) => { instanceId = event.target.value; });
  body.querySelector('[data-join]').addEventListener('click', () => {
    const input = body.querySelector('[data-join-address]');
    const address = input.value.trim();
    if (!address) return toast({ title: '请输入服务器地址', type: 'info' });
    join(address);
  });
  body.querySelector('[data-join-address]').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') body.querySelector('[data-join]').click();
  });

  body.querySelector('[data-server-add]').addEventListener('click', async () => {
    const name = body.querySelector('[data-server-name]').value.trim();
    const address = body.querySelector('[data-server-address]').value.trim();
    if (!address) return toast({ title: '请输入服务器地址', type: 'info' });
    try {
      await ctx.api.addServer({ name, address });
      body.querySelector('[data-server-name]').value = '';
      body.querySelector('[data-server-address]').value = '';
      await loadServers();
      toast({ title: '服务器已添加' });
    } catch (error) {
      toast({ title: '添加失败', message: error.message, type: 'error' });
    }
  });

  body.querySelector('[data-tunnel-start]').addEventListener('click', async () => {
    const port = Number(body.querySelector('[data-tunnel-port]').value) || 25565;
    tunnelBusy = true;
    renderTunnel();
    try {
      tunnel = await ctx.api.startTunnel({ port });
      toast({ title: '公网房间已开启', message: tunnel.address, type: 'success', duration: 6000 });
    } catch (error) {
      tunnel = { active: false };
      toast({ title: '房间创建失败', message: error.message, type: 'error', duration: 7000 });
    } finally {
      tunnelBusy = false;
      renderTunnel();
    }
  });
  body.querySelector('[data-tunnel-stop]')?.addEventListener('click', async () => {
    await ctx.api.stopTunnel();
    tunnel = { active: false };
    renderTunnel();
    toast({ title: '房间已关闭', type: 'info' });
  });
  body.querySelector('[data-copy-tunnel]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(tunnel.address || '');
      toast({ title: '地址已复制' });
    } catch {
      toast({ title: '复制失败', type: 'error' });
    }
  });

  tunnelBusy = false;
  await ctx.api.startLanDiscovery().catch(() => {});
  await Promise.all([loadServers(), refreshLan()]);
  try {
    tunnel = await ctx.api.getTunnelState();
    renderTunnel();
    if (tunnel.active) body.querySelector('[data-tunnel-port]').value = tunnel.localPort || 25565;
  } catch {
    // ignore
  }
  lanTimer = setInterval(refreshLan, 2200);

  return () => {
    if (lanTimer) clearInterval(lanTimer);
  };
}
