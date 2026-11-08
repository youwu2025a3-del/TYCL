'use strict';

const modrinth = require('./modrinth');
const modpackDb = require('./modpack-db');

const CATEGORY_WORDS = [
  [/(科技|工业|机械|机器|自动化|科技感|tech|industrial|automation)/i, 'technology'],
  [/(轻量|优化|流畅|低配|渣机|性能|帧数|lightweight|optimized|performance|fps)/i, 'optimization'],
  [/(生存|冒险|探索|野外|survival|adventure|exploration)/i, 'adventure'],
  [/(魔法|法术|神秘|magic)/i, 'magic'],
  [/(任务|剧情|quest|story|rpg)/i, 'quests'],
  [/(联机|多人|朋友|合作|multiplayer|co-?op)/i, 'multiplayer'],
  [/(战斗|pvp|combat|challenging)/i, 'combat'],
  [/(世界生成|地形|worldgen|biome)/i, 'worldgen'],
  [/(空岛|skyblock|sky block)/i, 'adventure'],
  [/(建筑|建造|building)/i, 'adventure'],
  [/(整合包|整合|modpack|pack)/i, 'modpack'],
];

const ALIASES = [
  [/(宝可梦|cobblemon|pokemon)/i, 'cobblemon'],
  [/(机械动力|create)/i, 'create'],
  [/(空岛|skyblock|sky block)/i, 'skyblock'],
  [/(rlcraft)/i, 'rlcraft'],
  [/(格雷|gregtech)/i, 'gregtech'],
  [/(拔刀剑|slashblade)/i, 'slashblade'],
  [/(幸运方块|lucky ?block)/i, 'lucky block'],
  [/(脆骨|better mc|bmc)/i, 'better mc'],
  [/(起源|origins)/i, 'origins'],
  [/(农夫乐事|farmers delight)/i, 'farmers delight'],
  [/(惊变100天|惊变一百天|僵尸100天|zombie invade 100 days|zombie apocalypse 100)/i, 'zombie invade 100 days'],
];

const DIRECT_PACKS = [
  { pattern: /(惊变100天|惊变一百天|僵尸100天|zombie invade 100 days|zombie apocalypse 100)/i, id: 'l9m9tuPN', title: 'Zombie Invade 100 Days' },
];

const STOP_WORDS = /(我想|想玩|一个|一款|可以|能|有|点|的|了|吗|吧|和|与|、|，|。|,|\.|！|!|？|\?|整合包|modpack)/gi;
const cache = new Map();

function parse(text) {
  const raw = String(text || '').trim();
  const categories = [];
  for (const [pattern, category] of CATEGORY_WORDS) {
    if (pattern.test(raw) && !categories.includes(category)) categories.push(category);
  }
  const directPacks = DIRECT_PACKS.filter((item) => item.pattern.test(raw)).map((item) => ({ id: item.id, title: item.title }));
  const dbMatch = modpackDb.match(raw);
  if (dbMatch && !directPacks.length) directPacks.push({ query: dbMatch.query, title: dbMatch.title });
  const aliases = [];
  for (const [pattern, term] of ALIASES) {
    if (pattern.test(raw) && !aliases.includes(term)) aliases.push(term);
  }
  const version = /1\.\d{1,2}(?:\.\d{1,2})?/.exec(raw)?.[0] || '';
  const loader = /neoforge/i.test(raw) ? 'neoforge'
    : /quilt/i.test(raw) ? 'quilt'
    : /fabric/i.test(raw) ? 'fabric'
    : /forge/i.test(raw) ? 'forge' : '';
  return {
    raw,
    query: raw.replace(STOP_WORDS, ' ').replace(/\s+/g, ' ').trim(),
    aliases,
    directPacks,
    mcVersion: version,
    loader,
    categories: categories.filter((category) => category !== 'modpack'),
    lightweight: /轻量|优化|流畅|低配|渣机|performance|light/i.test(raw),
    multiplayer: /联机|多人|朋友|合作|multiplayer|co-?op/i.test(raw),
    skyblock: /空岛|skyblock|sky block/i.test(raw),
  };
}

function scoreHit(hit, intent) {
  const tags = (hit.categories || []).map((item) => String(item).toLowerCase());
  const overlap = intent.categories.filter((category) => tags.includes(category)).length;
  const title = `${hit.title || ''} ${hit.summary || ''}`.toLowerCase();
  const textTerms = [...intent.aliases, ...(intent.query ? intent.query.split(' ') : [])].filter((term) => term.length > 1);
  const tokenScore = textTerms.filter((term) => title.includes(term.toLowerCase())).length;
  const aliasBoost = intent.aliases.some((term) => title.includes(term.toLowerCase())) ? 220 : 0;
  const popularity = Math.min(100, Math.log10((hit.downloads || 0) + 10) * 15);
  return overlap * 120 + tokenScore * 35 + aliasBoost + popularity;
}

async function find(text, { limit = 18 } = {}) {
  const intent = parse(text);
  if (!intent.raw) throw new Error('请输入想玩的内容');
  const key = JSON.stringify({ q: intent.query, a: intent.aliases, v: intent.mcVersion, l: intent.loader, c: intent.categories, n: limit });
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 120000) return cached.value;

  if (intent.directPacks?.length) {
    const directHits = [];
    for (const item of intent.directPacks) {
      try {
        if (item.id) {
          const project = await modrinth.getProject(item.id);
          if (project) directHits.push({ ...project, intentScore: 1000 });
        } else if (item.query) {
          const result = await modrinth.search({ query: item.query, type: 'modpack', limit: 2 });
          for (const hit of result.hits || []) directHits.push({ ...hit, intentScore: 900 });
        }
      } catch { /* ignore */ }
    }
    if (directHits.length) return { intent, hits: directHits };
  }
  const categoryGroups = intent.categories.length ? intent.categories : [''];
  const queries = [...new Set([...intent.aliases, intent.query].filter(Boolean))].slice(0, 3);
  const tasks = [
    ...categoryGroups.map((category) => modrinth.search({
      query: '',
      type: 'modpack',
      gameVersion: intent.mcVersion,
      loader: intent.loader,
      category,
      sort: 'downloads',
      limit: Math.min(30, limit * 2),
    }).catch(() => ({ hits: [] }))),
    ...queries.map((query) => modrinth.search({
      query,
      type: 'modpack',
      gameVersion: intent.mcVersion,
      loader: intent.loader,
      sort: 'relevance',
      limit: Math.min(20, limit),
    }).catch(() => ({ hits: [] }))),
  ];
  const groups = await Promise.all(tasks);
  const seen = new Set();
  const hits = [];
  for (const group of groups) {
    for (const hit of group.hits || []) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      hits.push({ ...hit, intentScore: scoreHit(hit, intent) });
    }
  }
  hits.sort((a, b) => b.intentScore - a.intentScore);
  const value = { intent, hits: hits.slice(0, limit) };
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  return value;
}

module.exports = { parse, find };
