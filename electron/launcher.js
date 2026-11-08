'use strict';

// 修复启动器生成的版本 JSON：
// Fabric/Quilt 合并时可能覆盖掉原版 LWJGL 的 downloads/natives 信息，
// 导致 LWJGL 原生库没有被放到 classpath，最终 RenderSystem 初始化失败。
function repairVersionJson(file, baseData) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data.libraries)) return false;
  const baseLibraries = new Map();
  for (const library of (baseData && baseData.libraries) || []) {
    if (library?.name) baseLibraries.set(library.name, library);
  }
  const installed = new Map();
  for (const library of data.libraries) {
    if (library?.name) installed.set(library.name, library);
  }
  let changed = false;
  for (const [name, library] of installed) {
    if (!/^org\.lwjgl:/.test(name)) continue;
    const base = baseLibraries.get(name);
    if (!base) continue;
    for (const key of ['downloads', 'natives', 'extract', 'rules', 'url', 'sha1', 'size']) {
      if (library[key] == null && base[key] != null) {
        library[key] = JSON.parse(JSON.stringify(base[key]));
        changed = true;
      }
    }
  }
  // 合并时被加载器 profile 删掉的 LWJGL 依赖补回来
  for (const [name, library] of baseLibraries) {
    if (!/^org\.lwjgl:/.test(name)) continue;
    if (!installed.has(name)) {
      data.libraries.push(JSON.parse(JSON.stringify(library)));
      changed = true;
    }
  }
  const filtered = sanitizeLibraries(data.libraries);
  if (filtered.length !== data.libraries.length) {
    data.libraries = filtered;
    changed = true;
  }
  if (changed) {
    try { fs.copyFileSync(file, file + '.bak'); } catch { /* ignore */ }
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  }
  return changed;
}

function sanitizeInstalledVersionFiles(instance) {
  const root = store.getSettings().gameDir;
  const baseFile = path.join(root, 'versions', instance.baseVersion, `${instance.baseVersion}.json`);
  let baseData = null;
  try { baseData = JSON.parse(fs.readFileSync(baseFile, 'utf8')); } catch { /* ignore */ }
  const files = new Set([
    path.join(root, 'versions', instance.baseVersion, `${instance.baseVersion}.json`),
    path.join(root, 'versions', instance.versionId, `${instance.versionId}.json`),
    path.join(root, 'versions', instance.versionId, `${instance.baseVersion}.json`),
  ]);
  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue;
      if (file === baseFile) {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Array.isArray(data.libraries)) continue;
        const filtered = sanitizeLibraries(data.libraries);
        if (filtered.length !== data.libraries.length) {
          data.libraries = filtered;
          try { fs.copyFileSync(file, file + '.bak'); } catch { /* ignore */ }
          fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
        }
      } else {
        repairVersionJson(file, baseData);
      }
    } catch {
      // 版本 JSON 清理失败不阻断启动
    }
  }
}
