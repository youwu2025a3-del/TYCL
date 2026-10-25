'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const backend = fs.readdirSync(path.join(root, 'electron')).filter((name) => name.endsWith('.js')).map((name) => path.join(root, 'electron', name));
const frontend = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) frontend.push(full);
  }
}
walk(path.join(root, 'src', 'js'));

let failed = 0;
for (const file of backend) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed += 1;
    console.error(`Backend syntax error: ${path.relative(root, file)}\n${result.stderr}`);
  }
}
for (const file of frontend) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(file) });
  if (result.status !== 0) {
    failed += 1;
    console.error(`Renderer syntax error: ${path.relative(root, file)}\n${result.stderr ? result.stderr.toString() : ''}`);
  }
}
if (failed) {
  console.error(`\n${failed} file(s) failed.`);
  process.exit(1);
}
console.log(`Syntax check passed: ${backend.length} backend, ${frontend.length} renderer files.`);
