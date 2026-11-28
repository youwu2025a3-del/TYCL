'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { listInstances } = require('./instances');
const instanceTools = require('./instance-tools');

function scanConflicts() {
  const instances = listInstances();
  const results = [];
  for (const instance of instances) {
    try {
      const data = instanceTools.listMods(instance.id);
      if (data.conflicts.length) {
        results.push({
          instanceId: instance.id,
          instanceName: instance.name,
          modCount: data.mods.length,
          conflicts: data.conflicts,
        });
      }
    } catch { /* ignore broken instance */ }
  }
  return { scanned: instances.length, results };
}

function exportServerPack(filePath, outputPath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('找不到客户端整合包');
  const source = new AdmZip(filePath);
  const entry = source.getEntry('modrinth.index.json');
  if (!entry) throw new Error('不是 Modrinth 整合包');
  const index = JSON.parse(entry.getData().toString('utf8'));
  const original = Array.isArray(index.files) ? index.files : [];
  const files = original.filter((item) => !(item.env && item.env.server === 'unsupported'));
  index.name = `${String(index.name || path.basename(filePath).replace(/\.(mrpack|zip)$/i, '')).trim()} Server`;
  index.files = files;
  const zip = new AdmZip();
  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index, null, 2), 'utf8'));
  for (const sourceEntry of source.getEntries()) {
    if (sourceEntry.isDirectory || sourceEntry.entryName === 'modrinth.index.json') continue;
    let name = sourceEntry.entryName;
    if (name.startsWith('server-overrides/')) name = name.replace(/^server-overrides\//, 'overrides/');
    if (!name.startsWith('overrides/')) continue;
    zip.addFile(name, sourceEntry.getData());
  }
  zip.writeZip(outputPath);
  return { file: outputPath, fileCount: files.length, total: original.length };
}

module.exports = { scanConflicts, exportServerPack };
