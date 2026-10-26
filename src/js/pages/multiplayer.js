import { icon } from '../icons.js';
import { escapeHtml } from '../utils.js';
import { toast, confirmDialog, openModal } from '../components.js';

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
  let server = { active: false };
  let room = null;
  let hostMode = 'server';
  let hostBusy = false;
  const config = { onlineMode: false, whitelist: false, whitelistNames: [], maxPlayers: 20, viewDistance: 10, difficulty: 'normal' };
  let lanTimer = null;
  let serverTimer = null;
  let tunnelBusy = false;

  container.innerHTML = `
    <div class="page multi-page">
      <div class="page-header">
        <div>
          <div class="page-eyebrow">PLAY TOGETHER</div>
          <h1 class="page-title">联机</h1>
          <p class="page-subtitle">开一个房间，把房间号发给朋友。或者加入别人的世界。</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" data-multi-refresh>${icon('refresh', 15)} 刷新状态</button>
        </div>
      </div>

      <section class="room-banner ${room ? 'active' : ''}" data-room-banner>
        <div class="room-banner-copy">
          <span class="room-banner-kicker">${icon('globe', 13)} TYCL ROOM</span>
          <h2>${room ? '房间已开启' : '和朋友，进同一个世界'}</h2>
          <p>${room ? '把房间号发给朋友，他们在联机页输入即可进入。' : '一键开服或开房，房间号直接连接，不用记 IP。'}</p>
        </div>
        <div class="room-code-box ${room ? '' : 'empty'}" data-room-code-box>
          <span>房间号</span>
          <strong data-room-code>${room ? room.code : '----'}</strong>
          <div class="room-code-actions">
            <button class="btn btn-secondary btn-sm" data-copy-room ${room ? '' : 'disabled'}>${icon('copy', 12)} 复制房间号</button>
            <button class="btn btn-secondary btn-sm" data-copy-address ${room ? '' : 'disabled'}>${icon('globe', 12)} 复制地址</button>
          </div>
        </div>
      </section>

      <div class="multi-layout">
        <section class="multi-card multi-open-card">
          <div class="multi-card-head">
            <div class="multi-icon">${icon('server', 20)}</div>
            <div><h2>创建房间</h2><p>启动本地服务端，或把已经开放的局域网世界映射到公网。</p></div>
          </div>
          <div class="host-mode">
            <button class="host-mode-btn ${hostMode === 'server' ? 'active' : ''}" data-host-mode="server">${icon('server', 13)} 自动开服</button>
            <button class="host-mode-btn ${hostMode === 'lan' ? 'active' : ''}" data-host-mode="lan">${icon('wifi', 13)} 局域网世界</button>
          </div>
          <details class="room-advanced">
            <summary>${icon('settings', 12)} 高级设置</summary>
            <div class="room-advanced-body">
              <label class="room-check"><input type="checkbox" data-cfg-online> 开启正版验证</label>
              <label class="room-check"><input type="checkbox" data-cfg-whitelist> 启用白名单</label>
              <input class="input" data-cfg-names placeholder="白名单玩家名，逗号分隔" spellcheck="false">
              <div class="room-advanced-row">
                <label>人数 <input class="input" type="number" min="1" max="100" value="20" data-cfg-max></label>
                <label>视距 <input class="input" type="number" min="3" max="32" value="10" data-cfg-view></label>
                <label>难度
                  <select class="select" data-cfg-diff><option value="peaceful">和平</option><option value="easy">简单</option><option value="normal" selected>普通</option><option value="hard">困难</option></select>
                </label>
              </div>
            </div>
          </details>
          <div class="field">
            <div class="field-label">使用实例</div>
            <div class="select-wrap">
              <select class="select" data-host-instance>
                ${state.instances.length ? state.instances.map((instance) => `<option value="${escapeHtml(instance.id)}" ${instance.id === instanceId ? 'selected' : ''}>${escapeHtml(instance.name)} · ${escapeHtml(instance.baseVersion)} · ${escapeHtml(instance.loaderLabel)}</option>`).join('') : '<option value="">没有可用实例</option>'}
              </select>
            </div>
          </div>
          <div class="field">
            <div class="field-label">${hostMode === 'server' ? '服务端端口' : '局域网端口'}</div>            <div class="path-field">
              <input class="input" type="number" min="1" max="65535" value="${hostMode === 'server' ? '25565' : '25565'}" data-host-port>
              <button class="btn btn-primary" data-room-start ${room || hostBusy ? 'disabled' : ''}>${hostBusy ? '<span class="spinner" style="width:13px;height:13px"></span> 准备中' : `${icon('zap', 14)} 一键开房`}</button>
            </div>
            <div class="field-hint" data-host-hint>${hostMode === 'server' ? '自动下载服务端、生成配置并过滤客户端 Mod，然后开房。' : '先在游戏里「对局域网开放」，TYCL 会读取端口。'}</div>
          </div>
          <div class="room-live ${room ? '' : 'hidden'}" data-room-live>
            <div class="room-live-main">
              <span class="status-dot ok"></span>
              <div><strong>${room ? `${room.mode === 'server' ? '服务端' : '局域网世界'} · 端口 ${room.port}` : ''}</strong><span data-room-status>房间运行中</span><span data-room-players style="margin-left:8px;color:var(--faint)"></span></div>
            </div>
            <div class="room-live-actions">
              <button class="btn btn-secondary btn-sm" data-room-time ${room && room.mode === 'server' ? '' : 'disabled'}>${icon('clock', 12)} 时光机</button>
              <button class="btn btn-secondary btn-sm" data-enter-local ${room ? '' : 'disabled'}>${icon('play', 12)} 进入我的房间</button>
              <button class="btn btn-ghost btn-sm" data-room-close ${room ? '' : 'disabled'}>关闭房间</button>
            </div>
          </div>
          ${hostMode === 'server' ? `<div class="room-server-info ${server.active ? '' : 'hidden'}" data-server-info><span>${icon('server', 12)} 服务端运行中</span><details><summary>查看服务端日志</summary><pre data-server-logs></pre></details></div>` : ''}
          <div class="room-mod-note ${server.active ? '' : 'hidden'}" data-mod-note></div>
        </section>

        <section class="multi-card">
          <div class="multi-card-head">
            <div class="multi-icon">${icon('play', 20)}</div>
            <div><h2>加入房间</h2><p>输入朋友发来的房间号，直接进入。</p></div>
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
              <div class="field-label">房间号</div>
              <div class="path-field">
                <input class="input" data-room-input placeholder="例如 40416" inputmode="numeric" spellcheck="false">
                <button class="btn btn-primary" data-room-join>${icon('arrow-right', 14)} 进入</button>
              </div>
              <div class="field-hint">5 位数字房间号会连接 bore.pub；也可以直接粘贴地址:端口。</div>
            </div>
            <div class="join-room-hint">${icon('info', 14)} 加入前会先检查房间是否在线，避免进不去。</div>
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

  const renderRoom = () => {
    const banner = body.querySelector('[data-room-banner]');
    const code = body.querySelector('[data-room-code]');
    const box = body.querySelector('[data-room-code-box]');
    const live = body.querySelector('[data-room-live]');
    const start = body.querySelector('[data-room-start]');
    if (banner) banner.classList.toggle('active', Boolean(room));
    if (code) code.textContent = room ? room.code : '----';
    if (box) box.classList.toggle('empty', !room);
    if (live) live.classList.toggle('hidden', !room);
    if (start) {
      start.disabled = Boolean(room) || hostBusy;
      start.innerHTML = hostBusy ? '<span class="spinner" style="width:13px;height:13px"></span> 准备中' : `${icon('zap', 14)} 一键开房`;
    }
    body.querySelectorAll('[data-copy-room],[data-copy-address],[data-enter-local],[data-room-close]').forEach((button) => {
      button.disabled = !room;
    });
    const status = body.querySelector('[data-room-status]');
    if (status && room) status.textContent = room.mode === 'server' ? '服务端与公网隧道运行中' : '公网隧道运行中';
    const players = body.querySelector('[data-room-players]');
    if (players && room) players.textContent = server?.players?.length ? `· 在线 ${server.players.length} 人` : '';
    renderServer();
  };

  const renderServer = () => {
    const info = body.querySelector('[data-server-info]');
    const logs = body.querySelector('[data-server-logs]');
    const note = body.querySelector('[data-mod-note]');
    if (info) info.classList.toggle('hidden', !server.active);
    if (logs && server.logs) logs.textContent = server.logs.slice(-20).join('\n') || '等待服务端输出…';
    if (note) {
      const skipped = server.mods?.skipped || [];
      note.classList.toggle('hidden', !server.active);
      note.innerHTML = server.active
        ? `${icon('shield', 13)} <span>服务端已同步 ${server.mods?.kept?.length || 0} 个 Mod${skipped.length ? `，已跳过 ${skipped.length} 个客户端专用 Mod：${escapeHtml(skipped.map((item) => item.name).slice(0, 4).join('、'))}${skipped.length > 4 ? '…' : ''}` : ''}</span>`
        : '';
    }
  };

  const renderServers = () => {
    const list = body.querySelector('[data-server-list]');
    if (!list) return;
    if (!servers.length) {
      list.innerHTML = `<div class="multi-empty">${icon('globe', 24)}<span>还没有收藏服务器。输入地址添加一个。</span></div>`;
      return;
    }
    list.innerHTML = servers.map((item) => {
      const status = item.status;
      const online = status?.online;
      return `<div class="server-row ${online ? 'online' : ''}">
        <div class="server-favicon">${status?.favicon ? `<img src="${escapeHtml(status.favicon)}" alt="">` : icon('cube', 18)}</div>
        <div class="server-main">
          <div class="server-title"><strong>${escapeHtml(item.name || item.host)}</strong><span class="status-dot ${online ? 'ok' : 'off'}"></span><span class="server-status">${escapeHtml(statusText(status))}</span></div>
          <span>${escapeHtml(addressOf(item))}${status?.version ? ` · ${escapeHtml(status.version)}` : ''}${status?.latency ? ` · ${status.latency}ms` : ''}</span>
          ${status?.motd ? `<small>${escapeHtml(status.motd)}</small>` : ''}
        </div>
        <div class="server-actions">
          <button class="btn btn-primary btn-xs" data-join-server="${escapeHtml(addressOf(item))}">进入</button>
          <button class="btn btn-ghost btn-xs" data-remove-server="${escapeHtml(item.id)}">移除</button>
        </div>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-join-server]').forEach((button) => button.addEventListener('click', () => join(button.dataset.joinServer)));
    list.querySelectorAll('[data-remove-server]').forEach((button) => button.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: '移除服务器', message: '只会从收藏列表移除，不会删除游戏数据。', confirmText: '移除' });
      if (!ok) return;
      await ctx.api.removeServer(button.dataset.removeServer);
      await loadServers();
    }));
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
    list.querySelectorAll('[data-join-lan]').forEach((button) => button.addEventListener('click', () => join(button.dataset.joinLan)));
  };

  const join = async (input) => {
    let address = String(input || '').trim();
    if (!address) return toast({ title: '请输入房间号或地址', type: 'info' });
    if (/^\d{4,5}$/.test(address)) address = `bore.pub:${address}`;
    else if (!address.includes(':')) address = `${address}:25565`;
    if (!instanceId) return toast({ title: '没有可用实例', message: '请先安装一个 Minecraft 版本', type: 'error' });
    try {
      const status = await ctx.api.pingServer(address);
      if (!status.online) {
        toast({ title: '房间无法连接', message: `${address} · ${status.error || '可能已关闭'}`, type: 'error', duration: 6000 });
        return;
      }
      const remoteFingerprint = /·\s*([0-9a-f]{8})\b/i.exec(status.motd || '');
      if (remoteFingerprint) {
        const local = await ctx.api.getServerFingerprint(instanceId).catch(() => null);
        if (local && local.fingerprint && local.fingerprint !== remoteFingerprint[1]) {
          toast({ title: 'Mod 不一致', message: `房间 ${remoteFingerprint[1]} / 本地 ${local.fingerprint}，请先同步 Mod`, type: 'error', duration: 8000 });
          return;
        }
      }
      await ctx.api.startLaunch(instanceId, { serverAddress: address });
      toast({ title: '正在进入房间', message: address, type: 'info' });
    } catch (error) {
      toast({ title: '进入失败', message: error.message, type: 'error', duration: 6000 });
    }
  };

  const loadServers = async () => {
    try {
      servers = await ctx.api.listServers();
      renderServers();
      servers = await ctx.api.pingAllServers();
      renderServers();
    } catch (error) {
      toast({ title: '服务器列表失败', message: error.message, type: 'error' });
    }
  };

  const refreshLan = async () => {
    try {
      lanWorlds = await ctx.api.listLanWorlds();
      renderLan();
      if (hostMode === 'lan' && lanWorlds[0]) {
        const input = body.querySelector('[data-host-port]');
        if (input && !room) input.value = lanWorlds[0].port;
      }
    } catch {
      // ignore
    }
  };

  const refreshServer = async () => {
    try {
      const next = await ctx.api.getServerState();
      if (next.active || server.active) {
        server = next;
        renderServer();
      }
    } catch {
      // ignore
    }
  };

  body.querySelector('[data-multi-refresh]').addEventListener('click', () => { loadServers(); refreshLan(); refreshServer(); });
  body.querySelector('[data-ping-all]').addEventListener('click', loadServers);
  body.querySelector('[data-host-instance]').addEventListener('change', (event) => { instanceId = event.target.value; const joinSelect = body.querySelector('[data-join-instance]'); if (joinSelect) joinSelect.value = instanceId; });
  body.querySelector('[data-join-instance]').addEventListener('change', (event) => { instanceId = event.target.value; const hostSelect = body.querySelector('[data-host-instance]'); if (hostSelect) hostSelect.value = instanceId; });
  body.querySelectorAll('[data-host-mode]').forEach((button) => button.addEventListener('click', () => {
    if (room) return;
    hostMode = button.dataset.hostMode;
    body.querySelectorAll('[data-host-mode]').forEach((item) => item.classList.toggle('active', item === button));
    const port = body.querySelector('[data-host-port]');
    if (port) port.value = hostMode === 'server' ? '25565' : (lanWorlds[0]?.port || '25565');
    const hint = body.querySelector('[data-host-hint]');
    if (hint) hint.textContent = hostMode === 'server' ? '自动下载服务端、生成配置并过滤客户端 Mod，然后开房。' : '先在游戏里「对局域网开放」，TYCL 会读取端口。';
  }));

  body.querySelector('[data-room-start]').addEventListener('click', async () => {
    const port = Number(body.querySelector('[data-host-port]').value) || 25565;
    if (!instanceId) return toast({ title: '请选择实例', type: 'error' });
    hostBusy = true;
    renderRoom();
    config.onlineMode = Boolean(body.querySelector('[data-cfg-online]')?.checked);
    config.whitelist = Boolean(body.querySelector('[data-cfg-whitelist]')?.checked);
    config.whitelistNames = String(body.querySelector('[data-cfg-names]')?.value || '').split(/[,，\s]+/).map((name) => name.trim()).filter(Boolean);
    config.maxPlayers = Number(body.querySelector('[data-cfg-max]')?.value) || 20;
    config.viewDistance = Number(body.querySelector('[data-cfg-view]')?.value) || 10;
    config.difficulty = body.querySelector('[data-cfg-diff]')?.value || 'normal';
    try {
      if (hostMode === 'server') {
        server = await ctx.api.startServer({ instanceId, port, motd: 'TYCL Room', config });
        renderServer();
      }
      const actualPort = server.active ? server.port : port;
      tunnel = await ctx.api.startTunnel({ port: actualPort });
      const code = String(tunnel.address).split(':').pop();
      room = { code, address: tunnel.address, port: actualPort, mode: hostMode, fingerprint: server.fingerprint || '', instanceId };
      renderRoom();
      toast({ title: '房间已开启', message: `房间号 ${code}`, type: 'success', duration: 6500 });
    } catch (error) {
      try { await ctx.api.stopTunnel(); } catch { /* ignore */ }
      if (server.active) { try { await ctx.api.stopServer(); } catch { /* ignore */ } server = { active: false }; }
      room = null;
      renderRoom();
      toast({ title: '开房失败', message: error.message, type: 'error', duration: 8000 });
    } finally {
      hostBusy = false;
      renderRoom();
    }
  });

  body.querySelector('[data-room-close]').addEventListener('click', async () => {
    await ctx.api.stopTunnel();
    if (server.active) await ctx.api.stopServer();
    tunnel = { active: false };
    server = { active: false };
    room = null;
    renderRoom();
    toast({ title: '房间已关闭', type: 'info' });
  });

  body.querySelector('[data-room-time]').addEventListener('click', async () => {
    if (!room || !room.instanceId) return;
    const renderSnapshots = async (modal) => {
      const list = modal.body.querySelector('[data-snapshot-list]');
      const snapshots = await ctx.api.listSnapshots(room.instanceId).catch(() => []);
      list.innerHTML = snapshots.length
        ? snapshots.map((snap) => `<div class="manager-row">
            <div class="manager-row-main"><strong>${escapeHtml(snap.label || '房间快照')}</strong><span>${escapeHtml(new Date(snap.createdAt).toLocaleString('zh-CN'))} · ${(snap.size / 1024 / 1024).toFixed(1)} MB</span></div>
            <button class="btn btn-secondary btn-xs" data-snapshot-restore="${escapeHtml(snap.id)}">回到这里</button>
          </div>`).join('')
        : '<div class="manager-empty">还没有快照。开房时会自动生成一张。</div>';
      list.querySelectorAll('[data-snapshot-restore]').forEach((button) => {
        button.addEventListener('click', async () => {
          const ok = await confirmDialog({ title: '回到这个时间点？', message: '当前世界会被替换，正在房间里的玩家会断开。', confirmText: '回滚' });
          if (!ok) return;
          button.disabled = true;
          try {
            await ctx.api.restoreSnapshot(room.instanceId, button.dataset.snapshotRestore);
            server = { active: false };
            if (tunnel.active) {
              server = await ctx.api.startServer({ instanceId: room.instanceId, port: room.port, motd: 'TYCL Room' });
            }
            renderRoom();
            toast({ title: '世界已回滚', message: tunnel.active ? '服务端已重新启动，房间号不变' : '重新开房即可使用' });
            modal.close?.();
          } catch (error) {
            button.disabled = false;
            toast({ title: '回滚失败', message: error.message, type: 'error' });
          }
        });
      });
    };
    const modal = openModal({
      title: '房间时光机',
      subtitle: '炸服、坏档、误删 Mod 时，回到之前的房间状态',
      size: 'modal-md',
      body: `<div class="manager-toolbar"><span>最多保留 3 份开房快照</span><button class="btn btn-secondary btn-sm" data-snapshot-create>${icon('camera', 12)} 现在拍快照</button></div><div class="manager-list" data-snapshot-list><div class="loading-block"><span class="spinner"></span> 读取快照…</div></div>`,
      footer: `<button class="btn btn-secondary btn-sm" data-modal-close>关闭</button>`,
    });
    modal.body.querySelector('[data-snapshot-create]').addEventListener('click', async () => {
      try {
        await ctx.api.createSnapshot(room.instanceId, '手动快照');
        await renderSnapshots(modal);
        toast({ title: '快照已保存' });
      } catch (error) {
        toast({ title: '快照失败', message: error.message, type: 'error' });
      }
    });
    await renderSnapshots(modal);
  });

  body.querySelector('[data-copy-room]').addEventListener('click', async () => {
    if (!room) return;
    await navigator.clipboard.writeText(room.code);
    toast({ title: '房间号已复制', message: room.code });
  });
  body.querySelector('[data-copy-address]').addEventListener('click', async () => {
    if (!room) return;
    await navigator.clipboard.writeText(room.address);
    toast({ title: '地址已复制', message: room.address });
  });
  body.querySelector('[data-enter-local]').addEventListener('click', () => {
    if (!room) return;
    join(`127.0.0.1:${room.port}`);
  });
  body.querySelector('[data-room-join]').addEventListener('click', () => join(body.querySelector('[data-room-input]').value));
  body.querySelector('[data-room-input]').addEventListener('keydown', (event) => { if (event.key === 'Enter') body.querySelector('[data-room-join]').click(); });
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

  await ctx.api.startLanDiscovery().catch(() => {});
  await Promise.all([loadServers(), refreshLan()]);
  try {
    tunnel = await ctx.api.getTunnelState();
    server = await ctx.api.getServerState();
    if (tunnel.active) {
      const code = String(tunnel.address).split(':').pop();
      room = { code, address: tunnel.address, port: tunnel.localPort, mode: server.active ? 'server' : 'lan', instanceId: server.instanceId || instanceId };
      const portInput = body.querySelector('[data-host-port]');
      if (portInput) portInput.value = tunnel.localPort;
    }
  } catch {
    // ignore
  }
  renderRoom();
  renderServer();
  lanTimer = setInterval(refreshLan, 4000);
  serverTimer = setInterval(refreshServer, 3000);

  return () => {
    if (lanTimer) clearInterval(lanTimer);
    if (serverTimer) clearInterval(serverTimer);
  };
}
