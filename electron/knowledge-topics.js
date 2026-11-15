'use strict';

// 本地问答库：同一主题生成多种问法，覆盖中文常见表达。
// 答案保持人工编写，扩展的是问法，不是让模板编事实。
const TOPICS = [
  {
    patterns: ['你好', '您好', 'hi', 'hello', '在吗', '嗨', '哈喽'],
    answer: '你好，我是 TYCL 助手。你可以直接说想玩什么，或者问我 Java、内存、崩溃、联机 Mod 的问题。',
    actions: [],
  },
  {
    patterns: ['你是谁', '你叫什么', '你能做什么', '会什么', '介绍一下你自己'],
    answer: '我是 TYCL 内置助手。能找整合包、解释 Java 和内存、检查 Mod 冲突、看崩溃日志、排查联机问题。也可以在设置里接本地 Ollama 或云端模型。',
    actions: [],
  },
  {
    patterns: ['谢谢', '感谢', 'thanks', 'thank you', '辛苦了'],
    answer: '不客气。需要继续找包、查 Mod 冲突或者看崩溃，直接说。',
    actions: [],
  },
  {
    patterns: ['崩了', '启动崩了', '游戏崩了', '闪退', '启动不了'],
    answer: '游戏崩了先按这个顺序：\n\n1. 实例管理 → 崩溃报告\n2. 确认 Java 版本\n3. 内存降到 4GB 试一次\n4. 禁用最近安装的 Mod\n5. 检查 Mod 是否同一加载器、同一游戏版本\n\n我也可以直接读实例日志和 Mod 列表帮你判断。',
    actions: [{ type: 'diagnostics' }],
  },
  {
    patterns: ['如何安装mod', '怎么安装mod', '安装mod', 'mod怎么装', '装mod', '添加mod'],
    answer: '安装 Mod：\n\n1. 先安装对应版本和加载器（Fabric / Forge / NeoForge）\n2. 进入「版本」→ 选中实例 → 实例管理\n3. 打开「Mods」页，点「添加 Mod」\n4. 选择 .jar 文件；如果是整合包，直接安装整合包\n5. 启动游戏\n\n注意：Mod 的游戏版本、加载器必须和实例一致；Fabric 还需要 Fabric API。',
    actions: [{ type: 'open-page', page: 'versions' }],
  },
  {
    patterns: ['检查mod冲突', 'mod冲突', 'mod冲突怎么查', '冲突检测', 'mod不兼容', 'mod冲突怎么办'],
    answer: '检查 Mod 冲突：\n\n1. 实例管理 → Mods\n2. 页面会显示冲突数量和原因\n3. 常见冲突：同一个 Mod 装了多个版本、文件名重复、Fabric/Forge 混装、缺少前置\n4. 先禁用最近安装的 Mod，再逐个启用排查\n5. 也可以让我读取实例日志，结合崩溃信息判断',
    actions: [{ type: 'open-mods' }],
  },
  {
    patterns: ['mod不显示', 'mod没加载', 'mod装了没用', 'mod列表没有', 'mod不生效'],
    answer: 'Mod 不显示先检查：\n\n- 文件是不是 .jar\n- 是否放进了当前实例的 mods 目录\n- 游戏版本和加载器是否匹配\n- Fabric 是否装了 Fabric API\n- 是否误放进了 `.minecraft/mods` 而不是实例目录\n- 启动日志里有没有 Mod 加载失败',
    actions: [{ type: 'open-mods' }],
  },
  {
    patterns: ['缺少前置', 'missing dependency', 'mod依赖', '前置mod', '需要fabric api'],
    answer: '缺少前置：\n\n1. 看崩溃报告里的 Missing or unsupported mandatory dependencies\n2. 安装对应的前置 Mod，常见是 Fabric API、Architectury API、Cloth Config\n3. 前置的版本也要匹配 Minecraft 版本\n4. 不要只改文件名，必须换正确版本',
    actions: [],
  },
  {
    patterns: ['java版本', 'java几', '用哪个java', 'java8', 'java17', 'java21', 'java版本不对'],
    answer: 'Java 版本对应：\n\n- 1.20.1 / 1.21：Java 21\n- 1.18–1.20：Java 17\n- 1.12.2 及更早：Java 8\n\n在实例设置里指定 java.exe；报 UnsupportedClassVersionError 基本就是 Java 版本不对。',
    actions: [],
  },
  {
    patterns: ['内存分配', '给多少内存', '内存不足', 'outofmemory', 'java heap space', '内存怎么调'],
    answer: '内存建议：\n\n- 4GB 物理内存：2GB\n- 8GB：4GB\n- 16GB：6–8GB\n- 大型整合包：6GB 起步\n\n不要超过物理内存一半。OutOfMemoryError 就是内存不够或 Mod 太多。',
    actions: [],
  },
  {
    patterns: ['fabric还是forge', '加载器怎么选', 'forge和fabric', 'neoforge', 'quilt'],
    answer: '加载器选择：\n\n- Fabric：轻量、优化 Mod 多，推荐新版本\n- Forge：老整合包、大型科技包多\n- NeoForge：1.20.2+ 的 Forge 分支\n- Quilt：Fabric 分支，生态较小\n\n同一个实例不要混装 Forge 和 Fabric Mod。',
    actions: [],
  },
  {
    patterns: ['资源包怎么装', '材质包', '光影怎么装', 'shader', '资源包不生效'],
    answer: '资源包 / 光影：\n\n1. 实例管理 → 资源包 / 光影\n2. 导入 .zip\n3. 材质包在游戏内启用；光影需要 Iris / OptiFine\n4. 启停会写入 options.txt，不用手动改',
    actions: [{ type: 'open-page', page: 'versions' }],
  },
  {
    patterns: ['开服', '怎么开服', '服务端', '服务器怎么建', '朋友一起玩'],
    answer: '开服：\n\n1. 进入「联机」\n2. 选择实例\n3. 点「一键开房」\n4. 把房间号和密码发给朋友\n\nTYCL 会自动准备服务端、生成配置、开隧道。大型整合包第一次启动会比较慢。',
    actions: [{ type: 'open-page', page: 'multiplayer' }],
  },
  {
    patterns: ['联机mod不一致', '朋友mod不一样', '进服务器mod不同', 'mod不一致', '房间mod'],
    answer: '联机 Mod 不一致：\n\n优先用 TYCL 房间服务，朋友输入完整「游戏端口-服务端口」房间号，启动器会自动补齐缺失 Mod。\n\n旧房间号或直连 IP 时，手动对齐 Minecraft 版本、加载器版本、Mod 文件名和版本。',
    actions: [{ type: 'open-page', page: 'multiplayer' }],
  },
  {
    patterns: ['端口', '端口被占用', '25565', '防火墙', '朋友连不上'],
    answer: '连不上排查：\n\n- 端口是否被占用\n- Windows 防火墙是否放行\n- 房主隧道是否在线\n- 朋友是否输入了完整房间号\n- 服务端是否真的启动完成\n\nTYCL 会自动换可用端口，但防火墙仍需允许。',
    actions: [{ type: 'open-page', page: 'multiplayer' }],
  },
  {
    patterns: ['备份存档', '备份实例', '怎么备份', '存档备份'],
    answer: '备份：实例管理 → 立即备份。\n\n会保存 Mod、存档和配置，不备份整个游戏资源。恢复时在备份列表点恢复。',
    actions: [{ type: 'open-page', page: 'versions' }],
  },
  {
    patterns: ['导入实例', '迁移实例', 'prism', 'multimc', 'curseforge实例'],
    answer: '实例迁移：版本页 →「导入外部实例」，选择 Prism / MultiMC / CurseForge 实例目录。\n\n需要本机已安装对应 Minecraft 版本；会复制 mods、config、存档、资源包和 options.txt。',
    actions: [{ type: 'open-page', page: 'versions' }],
  },
  {
    patterns: ['更新启动器', '检查更新', '怎么更新', '更新失败'],
    answer: '更新：设置 → 更新与公告 → 检查更新。\n\n支持增量更新包；更新失败先检查网络和磁盘空间，必要时手动下载安装器覆盖安装，实例数据不会丢。',
    actions: [{ type: 'open-page', page: 'settings' }],
  },
  {
    patterns: ['正版登录', '微软账户', '离线账户', '登录失败', '账户'],
    answer: '账户：设置 → 账户。支持 Microsoft 正版登录和离线账户。\n\n正版登录失败先检查网络和系统时间；离线账户只需要玩家名。联机时房主可以开启正版验证。',
    actions: [{ type: 'open-page', page: 'settings' }],
  },
  {
    patterns: ['启动器卡', '启动器很慢', '打开慢', '界面卡'],
    answer: '启动器卡：\n\n- 关闭后台占内存的程序\n- 不要同时运行多个启动器\n- 检查是否是集成显卡/驱动问题\n- 关闭不必要的动画和光影预览\n- 实例太多时先清理不用的实例',
    actions: [],
  },
  {
    patterns: ['游戏卡', '掉帧', '帧数低', '优化游戏', '低配'],
    answer: '游戏优化：\n\n- Fabric + Sodium / Lithium / FerriteCore\n- 视距 6–8，模拟距离 4–5\n- 关闭光影\n- 内存 4GB 左右，不要给太多\n- 用轻量整合包，不要 200+ Mod',
    actions: [],
  },
  {
    patterns: ['崩溃报告', '崩溃日志', 'latest.log', 'crash report', '游戏崩溃'],
    answer: '崩溃排查：\n\n1. 实例管理 → 崩溃报告\n2. 看 latest.log / crash-reports\n3. 常见关键词：OutOfMemoryError、UnsupportedClassVersionError、ModResolutionException、NoSuchMethodError\n4. 禁用最近安装的 Mod 再试',
    actions: [{ type: 'diagnostics' }],
  },
  {
    patterns: ['mod文件放哪', 'mods文件夹', 'mod目录', 'mod放哪里'],
    answer: 'Mod 放在当前实例的 mods 目录，不是公共 .minecraft/mods。\n\n版本隔离开启时，每个实例有独立 mods；在实例管理里打开目录最准确。',
    actions: [{ type: 'open-mods' }],
  },
  {
    patterns: ['客户端mod', '服务端mod', '哪些mod装服务端', 'mod客户端服务端'],
    answer: '客户端 Mod 只影响画面/按键，服务端不需要；服务端 Mod 影响逻辑，客户端通常也要装。\n\n联机前看 Mod 页面说明，TYCL 开房会自动过滤客户端专用 Mod。',
    actions: [],
  },
  {
    patterns: ['forge安装失败', 'fabric安装失败', '加载器安装失败', '版本安装失败'],
    answer: '加载器安装失败：\n\n- 确认 Minecraft 原版版本已安装\n- 检查网络和磁盘空间\n- 关闭杀毒软件对安装器的拦截\n- 查看安装日志\n- 重新安装对应加载器版本',
    actions: [{ type: 'open-page', page: 'versions' }],
  },
  {
    patterns: ['fabric api', 'fabric前置', 'fabric api怎么装'],
    answer: 'Fabric API 是大多数 Fabric Mod 的前置。\n\n在 Modrinth 搜索 Fabric API，选择与 Minecraft 版本、Fabric Loader 匹配的版本，放进实例 mods。',
    actions: [],
  },
  {
    patterns: ['modrinth', 'curseforge', '下载源', 'mod去哪下'],
    answer: 'TYCL 支持 Modrinth 和 CurseForge。优先用启动器内搜索，能自动匹配版本和依赖；不要从网盘下载来路不明的整合包。',
    actions: [{ type: 'open-page', page: 'resources' }],
  },
  {
    patterns: ['存档损坏', 'world corrupt', '存档打不开', '地图坏了'],
    answer: '存档损坏先备份整个 saves 文件夹，再尝试：\n\n- 用备份恢复\n- 检查 level.dat 是否 0 字节\n- 不要强行让不同版本打开同一存档\n- 如果是服务端，检查 session.lock 和权限',
    actions: [],
  },
  {
    patterns: ['eula', '正版验证', '盗版', '绕过正版', '共享账号'],
    answer: 'TYCL 不提供绕过正版验证、盗版账号或共享账号功能。请使用正版 Minecraft 或官方允许的离线模式；联机时尊重服务器规则和 Mojang EULA。',
    actions: [],
  },
  {
    patterns: ['ai本地模型', 'ollama', '本地模型怎么用', '云端模型', 'api key'],
    answer: 'AI 设置：设置 → AI 助手。\n\n- 本地：Ollama / llama.cpp，默认 http://127.0.0.1:11434/v1\n- 云端：OpenAI 兼容接口 + API Key\n- 自动：优先本地，本地不可用走云端\n- 都关：只用内置问答库\n\n本地模型先 ollama pull qwen2.5:3b。',
    actions: [{ type: 'open-page', page: 'settings' }],
  },
  {
    patterns: ['免责声明', '自动下载安全', '会不会删存档', '自动更新安全'],
    answer: '自动下载/更新可能修改实例文件。TYCL 会先下载、校验、备份再替换，但第三方资源仍建议自己备份存档。免责声明在首次启动时确认，之后不再显示。',
    actions: [],
  },
  {
    patterns: ['导入整合包', '安装整合包', '整合包怎么装', 'mrpack'],
    answer: '安装整合包：资源中心搜索整合包 → 查看 → 安装。TYCL 会解析 mrpack、安装 Mod 和覆盖配置，并创建独立实例。',
    actions: [{ type: 'open-page', page: 'resources' }],
  },
  {
    patterns: ['更新整合包', '整合包更新', 'modpack update'],
    answer: '整合包更新：实例管理 → 更新整合包。会同步新版本文件，但建议先备份存档；大版本更新可能不兼容旧存档。',
    actions: [{ type: 'open-page', page: 'versions' }],
  },
  {
    patterns: ['1.20.1 mod', '1.20.1整合包', '1.21 mod', '26.3 mod'],
    answer: '1.20.1 的 Mod 生态最全；1.21 较新，部分 Mod 还没更新；26.3 的 Mod 更少。装 Mod 前先确认游戏版本和加载器，不要跨版本硬塞。',
    actions: [],
  },
];

const PREFIXES = ['', '请问', '怎么', '如何'];
const SUFFIXES = ['', '怎么办', '教程', '方法'];

function generate() {
  const entries = [];
  for (const topic of TOPICS) {
    for (const pattern of topic.patterns) {
      for (const prefix of PREFIXES) {
        for (const suffix of SUFFIXES) {
          const text = `${prefix}${pattern}${suffix}`.trim();
          if (text) entries.push({ patterns: [text], answer: topic.answer, actions: topic.actions || [] });
        }
      }
    }
  }
  return entries;
}

module.exports = { topics: TOPICS, generate, count: generate().length };
