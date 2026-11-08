'use strict';

// 常用整合包名称索引。不是下载源，只用于把中文/英文别名映射到 Modrinth 搜索词。
const NAMES = [
  'RLCraft', 'Better MC', 'Better MC Fabric', 'Better MC Forge', 'BMC4', 'BMC2',
  'All the Mods 10', 'All the Mods 9', 'All the Mods 8', 'All the Mods 7', 'All the Mods 6',
  'ATM10', 'ATM9', 'ATM8', 'Create Above and Beyond', 'Create Astral', 'Create Arcane Engineering',
  'Create Chromatic Return', 'Create Ultimate', 'Create Steam n Rails', 'Create Integrated Farming',
  'Cobblemon', 'Cobbleverse', 'Cobblemon Official', 'Pixelmon', 'Prominence II', 'DawnCraft',
  'Vault Hunters', 'SkyFactory 4', 'SkyFactory 5', 'StoneBlock 3', 'StoneBlock 4',
  'Enigmatica 9', 'Enigmatica 10', 'FTB Academy', 'FTB University', 'FTB Skies', 'FTB Direwolf20',
  'SevTech Ages', 'TerraFirmaCraft', 'GregTech New Horizons', 'Nomifactory', 'Omnifactory',
  'Medieval MC', 'Fear Nightfall', 'Deceased Craft', 'Zombie Apocalypse', 'Lost Cities',
  '100 Days Zombie', 'RLCraft Hardcore', 'Fabulously Optimized', 'Simply Optimized', 'Adrenaline',
  'Sodium Plus', 'Vanilla Perfected', 'Better End', 'Better Nether', 'Terralith', 'Tectonic',
  'Incendium', 'Nullscape', 'Biomes O Plenty', 'Oh The Biomes Youll Go', 'Alexs Mobs',
  'Alexs Caves', 'Ice and Fire', 'Twilight Forest', 'The Aether', 'Deep Aether',
  'Ars Nouveau', 'Botania', 'Blood Magic', 'Electroblobs Wizardry', 'Irons Spells',
  'Apotheosis', 'Tetra', 'Tinkers Construct', 'Silent Gear', 'Mekanism',
  'Thermal Expansion', 'Industrial Foregoing', 'Applied Energistics 2', 'Refined Storage',
  'Powah', 'Extreme Reactors', 'Draconic Evolution', 'Immersive Engineering', 'Create',
  'Farmer Delight', 'Croptopia', 'Pams HarvestCraft', 'Sophisticated Backpacks', 'Iron Chests',
  'JEI', 'REI', 'EMI', 'JourneyMap', 'Xaeros Minimap', 'Xaeros World Map',
  'Structory', 'When Dungeons Arise', 'Yungs Better Dungeons', 'Towns and Towers',
  'Dungeons and Taverns', 'ChoiceTheorem Overhauled Village', 'Minecolonies', 'Ancient Cities',
  'All the Mods 5', 'FTB Revelation', 'FTB Infinity Evolved', 'Project Ozone 3',
  'Sky Adventures', 'Cave Factory', 'OceanBlock', 'Ultimate Skyblock',
  'Compact Claustrophobia', 'Dimensional Doors', 'FTB Presents SkyFactory 3', 'FTB StoneBlock',
  'Valhelsia 5', 'Valhelsia 6', 'Roguelike Adventures and Dungeons', 'Craft to Exile 2',
  'The Winter Rescue', 'Zombie Survival', 'Lost World', 'Survive and Thrive'
];

const EXTRA = {
  'RLCraft': ['RLC', '真实生存'],
  'Better MC': ['更好的MC', 'BMC'],
  'Better MC Fabric': ['更好的MC Fabric'],
  'Better MC Forge': ['更好的MC Forge'],
  'BMC4': ['BMC4', '更好的MC4'],
  'BMC2': ['BMC2', '更好的MC2'],
  'All the Mods 10': ['ATM10', '所有模组10'],
  'All the Mods 9': ['ATM9', '所有模组9'],
  'All the Mods 8': ['ATM8', '所有模组8'],
  'Create Above and Beyond': ['机械动力 超越', 'Create A&B'],
  'Create Astral': ['机械动力 星界'],
  'Cobblemon': ['宝可梦', '精灵宝可梦'],
  'Cobbleverse': ['宝可梦世界'],
  'Pixelmon': ['像素宝可梦'],
  'Prominence II': ['Prominence 2', '卓越2'],
  'DawnCraft': ['黎明工艺'],
  'Vault Hunters': ['宝库猎人'],
  'SkyFactory 4': ['空岛工厂4', 'SkyFactory4'],
  'SkyFactory 5': ['空岛工厂5'],
  'StoneBlock 3': ['石头世界3'],
  'StoneBlock 4': ['石头世界4'],
  'Enigmatica 9': ['神秘9', 'E9'],
  'Enigmatica 10': ['神秘10', 'E10'],
  'SevTech Ages': ['SevTech', '科技时代'],
  'TerraFirmaCraft': ['群峦传说', 'TFC'],
  'GregTech New Horizons': ['格雷科技新视野', 'GTNH'],
  'Nomifactory': ['诺米工厂'],
  'Medieval MC': ['中世纪MC'],
  'Fear Nightfall': ['恐惧之夜'],
  'Deceased Craft': ['丧尸工艺'],
  'Zombie Apocalypse': ['僵尸启示录'],
  '100 Days Zombie': ['惊变100天', '惊变一百天', '僵尸100天'],
  'Fabulously Optimized': ['FO', '极致优化'],
  'Simply Optimized': ['简单优化'],
  'Adrenaline': ['肾上腺素'],
  'Sodium Plus': ['钠增强'],
  'Better End': ['更好的末地'],
  'Better Nether': ['更好的下界'],
  'Terralith': ['地形增强'],
  'Biomes O Plenty': ['超多生物群系', 'BOP'],
  'Alexs Mobs': ['Alex生物'],
  'Alexs Caves': ['Alex洞穴'],
  'Ice and Fire': ['冰与火'],
  'Twilight Forest': ['暮色森林'],
  'The Aether': ['天境'],
  'Ars Nouveau': ['新星魔法'],
  'Botania': ['植物魔法'],
  'Blood Magic': ['血魔法'],
  'Irons Spells': ['铁之法术'],
  'Apotheosis': ['神化'],
  'Tinkers Construct': ['匠魂'],
  'Mekanism': ['通用机械'],
  'Thermal Expansion': ['热力膨胀'],
  'Industrial Foregoing': ['工业先锋'],
  'Applied Energistics 2': ['应用能源2', 'AE2'],
  'Refined Storage': ['精致存储'],
  'Draconic Evolution': ['龙之研究'],
  'Immersive Engineering': ['沉浸工程'],
  'Create': ['机械动力'],
  'Farmer Delight': ['农夫乐事'],
  'Croptopia': ['作物盛景'],
  'Pams HarvestCraft': ['潘马斯农场'],
  'Sophisticated Backpacks': ['精致背包'],
  'Iron Chests': ['铁箱子'],
  'JourneyMap': ['旅行地图'],
  'Xaeros Minimap': ['Xaero小地图'],
  'Xaeros World Map': ['Xaero世界地图'],
  'When Dungeons Arise': ['地牢崛起'],
  'Minecolonies': ['我的殖民地'],
  'Ancient Cities': ['远古城市']
};

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

const entries = [];
for (const name of NAMES) {
  const aliases = new Set([name, name.replace(/\s+/g, ''), ...(EXTRA[name] || [])]);
  for (const alias of aliases) {
    entries.push({ alias, query: name, title: name });
  }
}

function match(text, minLength = 3) {
  const value = normalize(text);
  if (!value) return null;
  let best = null;
  let bestScore = 0;
  for (const entry of entries) {
    const key = normalize(entry.alias);
    if (!key || key.length < minLength) continue;
    const score = value === key ? 200 : value.includes(key) ? 100 + key.length : 0;
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return best;
}

module.exports = { entries, match, count: entries.length };
