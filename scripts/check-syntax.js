import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignored = new Set(['node_modules', '.git', 'auth', 'tmp']);

const collect = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(full)));
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files;
};

const files = await collect(root);
let failed = 0;

for (const file of files) {
  const relative = path.relative(root, file);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status === 0) {
    console.log(`ok    ${relative}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${relative}`);
    if (result.stderr) console.error(result.stderr.trim());
  }
}

console.log(`\nChecked ${files.length} files, ${failed} failed.`);
process.exit(failed ? 1 : 0);
    
