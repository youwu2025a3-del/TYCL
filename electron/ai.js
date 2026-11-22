'use strict';

const fs = require('fs');
const path = require('path');
const { store } = require('./store');
const { listInstances } = require('./instances');
const intent = require('./intent');
const knowledge = require('./knowledge');
const instanceTools = require('./instance-tools');

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_modpacks',
      description: '在 Modrinth 搜索现成整合包。用户想找整合包、想玩某种类型时调用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '用户的原始需求或关键词' },
          mcVersion: { type: 'string', description: 'Minecraft 版本，例如 1.20.1；不确定留空' },
          loader: { type: 'string', enum: ['fabric', 'forge', 'neoforge', 'quilt', ''], description: '加载器；不确定留空' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'inspect_instances',
      description: '读取用户的实例、版本、加载器、内存和最近日志概况。用户问自己的实例、配置或该玩什么时调用。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'diagnose_instance',
      description: '检查指定实例的 latest.log、crash-reports、Java 和内存，给出崩溃原因。用户说崩溃、闪退、启动失败时调用。',
      parameters: {
        type: 'object',
        properties: { instanceId: { type: 'string', description: '实例 ID；不确定留空，会选最近实例' } },
      },
    },
  },
];

let localCache = { at: 0, value: null };

function contextText() {
  const settings = store.getSettings();
  const instances = listInstances().slice(0, 8);
  return [
    `用户当前有 ${instances.length} 个实例：`,
    ...instances.map((item) => `- ${item.name}：${item.baseVersion} / ${item.loaderLabel || item.loader}，内存 ${item.javaMemoryMb || settings.memoryMb}MB`),
    `默认内存 ${settings.memoryMb}MB，下载源 ${settings.downloadSource}，账户 ${settings.accountMode}。`,
    '你能做：找整合包、解释 Java/内存、联机排查、分析启动崩溃、规划实例。',
    '你不能直接执行安装或开房；需要用户点界面上的按钮。',
  ].join('\n');
}

function systemPrompt() {
  return `你是 TYCL 启动器内的 Minecraft 助手。回答简短、具体、可执行，中文优先。
不要编造 Mod、整合包、下载地址或版本。需要列整合包时必须调用 search_modpacks 工具，不要凭空写名字。
用户描述想玩的类型时，先理解意图，再调用搜索；拿到结果后用一两句话说明推荐理由。
涉及安装、开房、改实例、删除文件时，只给建议，明确告诉用户需要在界面确认。
${contextText()}`;
}

async function searchTool(args) {
  const text = [args.query, args.mcVersion, args.loader].filter(Boolean).join(' ');
  const data = await intent.find(text, { limit: 6 });
  return { data, text: data.hits.length ? `找到 ${data.hits.length} 个候选。` : '没有找到合适候选。' };
}

function pickInstance(instanceId) {
  const instances = listInstances();
  return instances.find((item) => item.id === instanceId) || instances[0] || null;
}

function inspectTool() {
  const settings = store.getSettings();
  const instances = listInstances();
  if (!instances.length) {
    return { text: '当前还没有实例。先在版本页安装一个 Minecraft 版本，再回来找我。', actions: [{ type: 'open-page', page: 'versions' }] };
  }
  const lines = instances.slice(0, 6).map((item) => `- ${item.name}：${item.baseVersion} / ${item.loaderLabel || item.loader}，内存 ${item.javaMemoryMb || settings.memoryMb}MB`);
  return {
    text: `你现在有 ${instances.length} 个实例：\n${lines.join('\n')}\n\n默认内存 ${settings.memoryMb}MB。你想启动哪个，或者要我帮你看某个实例的日志？`,
    actions: [{ type: 'open-page', page: 'versions' }],
  };
}

function diagnoseTool(instanceId) {
  const settings = store.getSettings();
  const instance = pickInstance(instanceId);
  if (!instance) return { text: '没有实例可诊断。先安装一个版本。', actions: [{ type: 'open-page', page: 'versions' }] };
  const findings = [];
  const logs = path.join(instance.gameDir, 'logs', 'latest.log');
  let tail = '';
  try { tail = fs.readFileSync(logs, 'utf8').split(/\r?\n/).slice(-180).join('\n'); } catch { tail = ''; }
  let crash = '';
  try {
    const dir = path.join(instance.gameDir, 'crash-reports');
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.txt')).sort();
    if (files.length) crash = fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8');
  } catch { /* ignore */ }
  const all = `${tail}\n${crash}`;
  if (/OutOfMemoryError|Java heap space/i.test(all)) findings.push('内存不足：整合包或 Mod 太多，先把实例内存调到 4–6GB，再关掉后台程序。');
  if (/UnsupportedClassVersionError/i.test(all)) findings.push('Java 版本不对：1.20.1 用 Java 17/21，1.12.2 用 Java 8。');
  if (/Missing or unsupported mandatory dependencies|ModResolutionException/i.test(all)) findings.push('Mod 依赖缺失或版本冲突：先补前置，再检查是否混用了 Fabric/Forge。');
  if (/NoSuchMethodError|NoClassDefFoundError/i.test(all)) findings.push('Mod 与游戏版本/加载器不匹配：禁用最近安装的 Mod 再试。');
  if (/Pixel format not accelerated|OpenGL/i.test(all)) findings.push('显卡/OpenGL 问题：更新显卡驱动，或关闭光影再启动。');
  try {
    const modData = instanceTools.listMods(instance.id);
    if (modData.conflicts?.length) {
      findings.push(`检测到 ${modData.conflicts.length} 个 Mod 冲突：${modData.conflicts.slice(0, 5).map((item) => `${item.name}（${item.reason}）`).join('、')}`);
    } else if (modData.mods?.length) {
      findings.push(`Mod 文件 ${modData.mods.length} 个，没有发现重复 ID 或重复文件名；如果仍崩溃，继续看日志里的依赖和 Java 错误。`);
    }
  } catch { /* ignore */ }
  if (!findings.length) findings.push('日志里没有明显的 Java 或 Mod 错误。建议先禁用最近安装的 Mod，或把 latest.log 最后 100 行发给我。');
  const actions = [{ type: 'diagnostics', instanceId: instance.id }];
  return {
    text: `诊断实例：${instance.name}（${instance.baseVersion} / ${instance.loaderLabel || instance.loader}）\n\n${findings.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n\n当前分配内存 ${instance.javaMemoryMb || settings.memoryMb}MB。`,
    actions,
  };
}

async function executeTool(name, args) {
  if (name === 'search_modpacks') {
    const result = await searchTool(args);
    return { text: result.text, hits: result.data.hits, actions: [] };
  }
  if (name === 'inspect_instances') return inspectTool();
  if (name === 'diagnose_instance') return diagnoseTool(args.instanceId);
  return { text: '未知工具。', actions: [] };
}

async function localStatus(settings) {
  if (localCache.value && Date.now() - localCache.at < 15000) return localCache.value;
  try {
    const response = await fetch(`${settings.aiLocalBaseUrl}/models`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    const models = (data.data || []).map((item) => item.id).filter(Boolean);
    const value = { available: true, models, baseUrl: settings.aiLocalBaseUrl };
    localCache = { at: Date.now(), value };
    return value;
  } catch {
    const value = { available: false, models: [], baseUrl: settings.aiLocalBaseUrl };
    localCache = { at: Date.now(), value };
    return value;
  }
}

async function callApi(settings, messages, tools = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (settings.aiApiKey) headers.Authorization = `Bearer ${settings.aiApiKey}`;
  const response = await fetch(`${settings.aiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.aiModel || 'deepseek-chat',
      messages: [{ role: 'system', content: systemPrompt() }, ...messages],
      temperature: 0.6,
      max_tokens: 900,
      ...(tools ? { tools: TOOLS, tool_choice: 'auto' } : {}),
      ...(settings.local ? { options: { num_gpu: settings.aiUseGpu === false ? 0 : 999, num_thread: Math.max(1, Number(settings.aiCpuThreads) || 4) } } : {}),
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`AI 接口返回 ${response.status}${text ? `：${text.slice(0, 160)}` : ''}`);
  }
  return response.json();
}

async function chat(messages = []) {
  const settings = store.getSettings();
  const history = (Array.isArray(messages) ? messages : [])
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .slice(-14)
    .map((item) => ({ role: item.role, content: String(item.content || '').slice(0, 5000) }));
  const last = [...history].reverse().find((item) => item.role === 'user')?.content || '';
  if (!last) throw new Error('消息为空');

  const localEnabled = settings.aiLocalEnabled !== false;
  const cloudEnabled = settings.aiCloudEnabled !== false;
  const local = localEnabled ? await localStatus(settings) : { available: false, models: [], baseUrl: settings.aiLocalBaseUrl };
  const useLocal = localEnabled && local.available;
  if (!useLocal && (!cloudEnabled || !settings.aiApiKey || !settings.aiBaseUrl)) return localAnswer(last);
  const active = useLocal
    ? { ...settings, local: true, aiBaseUrl: settings.aiLocalBaseUrl, aiApiKey: '', aiModel: settings.aiLocalModel || 'qwen2.5:3b' }
    : settings;

  try {
    const first = await callApi(active, history, true);
    const message = first.choices?.[0]?.message || {};
    const calls = message.tool_calls || [];
    if (!calls.length) return { mode: useLocal ? 'local-model' : 'api', text: message.content || '我没有生成有效回复。', hits: [], actions: [] };

    let hits = [];
    let intentData = null;
    const actions = [];
    const toolMessages = [];
    for (const call of calls.slice(0, 3)) {
      try {
        const args = JSON.parse(call.function?.arguments || '{}');
        const result = await executeTool(call.function?.name, args);
        if (result.hits?.length) hits = result.hits;
        if (result.actions?.length) actions.push(...result.actions);
        toolMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ text: result.text, hits: (result.hits || []).map((hit) => ({ id: hit.id, title: hit.title, downloads: hit.downloads, categories: hit.categories })), actions: result.actions || [] }) });
      } catch (error) {
        toolMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: error.message }) });
      }
    }
    const second = await callApi(active, [...history, message, ...toolMessages], false);
    const text = second.choices?.[0]?.message?.content || (hits.length ? `找到 ${hits.length} 个候选。` : '没有找到合适候选。');
    return { mode: useLocal ? 'local-model' : 'api', text, hits, actions, intent: intentData };
  } catch (error) {
    const localAnswerResult = await localAnswer(last);
    return { ...localAnswerResult, mode: 'fallback', warning: error.message };
  }
}

async function localAnswer(text) {
  const lower = text.toLowerCase();
  const known = knowledge.answer(text);
  if (known) return { ...known, hits: [] };
  const playIntent = /(想玩|玩个|帮我下|下载|来个|要个|下个|推荐|找.*(包|整合)|整合包|modpack|轻量|科技感|科技|生存|魔法|空岛|宝可梦|任务)/.test(lower) && !/不一致|崩|闪退|java|内存|诊断/.test(lower);
  if (playIntent) {
    const data = await intent.find(text, { limit: 6 }).catch(() => ({ intent: {}, hits: [] }));
    const tags = [
      data.intent.mcVersion ? `版本 ${data.intent.mcVersion}` : '',
      data.intent.loader || '',
      ...(data.intent.categories || []),
      data.intent.lightweight ? '轻量' : '',
      data.intent.multiplayer ? '联机' : '',
    ].filter(Boolean);
    return {
      mode: 'local',
      text: data.hits.length
        ? `我按“${tags.join(' · ') || '你的描述'}”理解，找到几个现成整合包，可以直接查看或一键准备：`
        : '我没找到合适的现成整合包。补充一下 Minecraft 版本、Fabric/Forge，或者换个说法。',
      intent: data.intent,
      hits: data.hits,
    };
  }
  if (/我的实例|实例列表|配置|内存多少|看看我的/.test(lower) && !/整合包|找包|modpack/.test(lower)) {
    const result = inspectTool();
    return { mode: 'local', ...result, hits: [] };
  }
  if (/崩|crash|启动不了|闪退|诊断|启动失败/.test(lower)) {
    const result = diagnoseTool();
    return { mode: 'local', ...result, hits: [] };
  }
  if (/java|内存|memory|jvm/.test(lower) && !/整合包|找包|modpack/.test(lower)) {
    const settings = store.getSettings();
    return {
      mode: 'local',
      text: `Java 和内存可以这样配：\n\n- 1.20.1 / 1.21：Java 21\n- 1.18–1.20：Java 17\n- 1.12.2 及更早：Java 8\n- 4GB 内存：实例给 2GB\n- 8GB：给 4GB\n- 16GB 以上：给 6–8GB\n\n你当前默认是 ${settings.memoryMb}MB。整合包越大，内存越要留余量；但不要超过物理内存的一半。`,
      hits: [],
    };
  }
  if (/崩溃|crash|启动不了|闪退/.test(lower)) {
    return {
      mode: 'local',
      text: '先按这个顺序排查：\n\n1. 实例管理 → 崩溃报告，生成报告\n2. 确认 Java 版本：1.20.1 用 Java 17/21，1.12.2 用 Java 8\n3. 把内存降到 4GB 试一次，排除内存不足\n4. 禁用最近安装的 Mod，尤其是优化类和渲染类\n5. 检查 Mod 是否全是同一加载器、同一游戏版本\n\n如果你把崩溃报告贴给我，我可以继续判断是 Java、内存还是 Mod 冲突。',
      hits: [],
    };
  }
  if (/mod ?不一致|mod不一致|房间号|朋友.*mod|联机.*进不去|加不进|无法加入/.test(lower)) {
    return {
      mode: 'local',
      text: '联机 Mod 不一致时，优先用 TYCL 的房间服务：房主开房后会生成“游戏端口-服务端口”，朋友输入完整房间号和密码，启动器会自动补齐缺失 Mod。\n\n如果是旧房间号或直接 IP，先对齐：Minecraft 版本、Fabric/Forge 版本、Mod 文件名和版本。服务端不需要的客户端 Mod 不要让朋友装。',
      hits: [],
    };
  }
  const data = await intent.find(text, { limit: 6 }).catch(() => ({ intent: {}, hits: [] }));
  const tags = [
    data.intent.mcVersion ? `版本 ${data.intent.mcVersion}` : '',
    data.intent.loader || '',
    ...(data.intent.categories || []),
    data.intent.lightweight ? '轻量' : '',
    data.intent.multiplayer ? '联机' : '',
  ].filter(Boolean);
  return {
    mode: 'local',
    text: data.hits.length
      ? `我先按“${tags.join(' · ') || '综合'}”理解。找到几个现成整合包，可以直接查看或一键准备：`
      : '我没找到合适的现成整合包。补充一下 Minecraft 版本、Fabric/Forge，或者换个说法。',
    intent: data.intent,
    hits: data.hits,
  };
}

async function testConnection() {
  const settings = store.getSettings();
  const localEnabled = settings.aiLocalEnabled !== false;
  const cloudEnabled = settings.aiCloudEnabled !== false;
  const local = localEnabled ? await localStatus(settings) : { available: false, models: [] };
  const useLocal = localEnabled && local.available;
  if (useLocal) {
    return { ok: true, mode: 'local', model: settings.aiLocalModel, models: local.models };
  }
  if (!cloudEnabled) throw new Error('本地和云端模型都关闭了，当前使用内置意图检索');
  if (!settings.aiApiKey) throw new Error('还没有填写 API Key，本地模型也未启动');
  const response = await fetch(`${settings.aiBaseUrl}/models`, {
    headers: { Authorization: `Bearer ${settings.aiApiKey}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`接口返回 ${response.status}`);
  return { ok: true, mode: 'cloud', model: settings.aiModel };
}


function analyzeCrash(instanceId) {
  const instance = pickInstance(instanceId);
  if (!instance) return { summary: '没有实例可分析。', findings: [], actions: [], instanceId: '' };
  const result = diagnoseTool(instance.id);
  const findings = String(result.text || '').split('\n').filter((line) => /^\d+\./.test(line.trim())).map((line) => line.replace(/^\s*\d+\.\s*/, ''));
  return {
    instanceId: instance.id,
    instanceName: instance.name,
    summary: `游戏没有正常启动或异常退出：${instance.name}`,
    findings: findings.length ? findings : ['日志里没有明显错误，可能是启动参数、显卡或内存问题。'],
    actions: [{ type: 'diagnostics', instanceId: instance.id }, { type: 'auto-fix', instanceId: instance.id }],
  };
}

async function fixCrash(instanceId) {
  const instance = pickInstance(instanceId);
  if (!instance) throw new Error('实例不存在');
  const logs = path.join(instance.gameDir, 'logs', 'latest.log');
  let text = '';
  try { text = fs.readFileSync(logs, 'utf8'); } catch { /* ignore */ }
  const fixed = [];
  const manual = [];
  const settings = store.getSettings();
  if (/OutOfMemoryError|Java heap space/i.test(text)) {
    const next = Math.min(8192, Math.max(2048, Number(instance.javaMemoryMb || settings.memoryMb || 4096) + 1024));
    instanceTools.updateSettings(instance.id, { javaMemoryMb: next });
    fixed.push(`内存从 ${instance.javaMemoryMb || settings.memoryMb}MB 调整到 ${next}MB`);
  }
  if (/UnsupportedClassVersionError/i.test(text)) {
    const required = /1\.(?:1[89]|2\d)/.test(instance.baseVersion) ? 17 : /1\.(?:[2-9]|1[0-7])/.test(instance.baseVersion) ? 8 : 21;
    try {
      const javaList = await require('./java').detectJava();
      const list = Array.isArray(javaList) ? javaList : javaList.javas || [];
      const candidate = list.find((item) => Number(item.major) >= required) || list[0];
      if (candidate) {
        instanceTools.updateSettings(instance.id, { javaPath: candidate.path });
        fixed.push(`Java 切换到 ${candidate.major}（${candidate.path}）`);
      } else {
        manual.push(`没有检测到 Java ${required}+，请安装 Java ${required}`);
      }
    } catch {
      manual.push(`没有检测到 Java ${required}+，请安装 Java ${required}`);
    }
  }
  try {
    if (/jtracy|TracyClient/i.test(text)) {
      require('./launcher').repairInstanceFiles(instance);
      fixed.push('已修复版本 JSON 中的 jtracy 库，下次启动会补齐普通 jar 和 natives');
    }
    const modData = instanceTools.listMods(instance.id);
    for (const conflict of modData.conflicts || []) {
      const files = conflict.files || [];
      for (const file of files.slice(1)) {
        instanceTools.toggleMod(instance.id, file, false);
        fixed.push(`禁用重复 Mod：${file}`);
      }
    }
  } catch { /* ignore */ }
  if (!fixed.length) manual.push('没有可以安全自动修复的确定问题，请查看诊断报告或把 latest.log 发给开发者。');
  return { fixed, manual, instanceId: instance.id };
}
module.exports = { chat, testConnection, localStatus, localAnswer, analyzeCrash, fixCrash };
