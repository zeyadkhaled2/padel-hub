// Syncs the unmodified upstream LGPL-3.0 libheif-js ES module and its verbatim license
// from node_modules into public/vendor/libheif/ so browsers load it dynamically at runtime
// as a standalone replaceable library rather than bundling LGPL-3.0 code into app chunks.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'node_modules', 'libheif-js', 'libheif-wasm');
const targetDir = join(root, 'public', 'vendor', 'libheif');

const assets = [
  { src: join(sourceDir, 'libheif-bundle.mjs'), dest: join(targetDir, 'libheif-bundle.mjs') },
  { src: join(sourceDir, 'LICENSE'), dest: join(targetDir, 'LICENSE.txt') },
];

if (!existsSync(sourceDir)) {
  // Allow clean exit if invoked before node_modules is fully hydrated in unusual environments.
  console.warn('[sync-heic-assets] node_modules/libheif-js/libheif-wasm not found; skipping.');
  process.exit(0);
}

mkdirSync(targetDir, { recursive: true });

for (const { src, dest } of assets) {
  if (!existsSync(src)) {
    throw new Error(`[sync-heic-assets] Missing required upstream file: ${src}`);
  }
  if (existsSync(dest)) {
    const srcStat = statSync(src);
    const destStat = statSync(dest);
    if (srcStat.size === destStat.size && srcStat.mtimeMs <= destStat.mtimeMs) {
      continue;
    }
  }
  copyFileSync(src, dest);
}
