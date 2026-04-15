/**
 * 构建部署目录 dist/（用于 wrangler pages deploy）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEPLOY_ENTRIES } from './deploy-entries.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === '.DS_Store') continue;
    const srcPath = path.join(src, ent.name);
    const destPath = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyEntry(entryPosix) {
  const src = path.join(root, ...entryPosix.split('/'));
  if (!fs.existsSync(src)) {
    console.warn(`跳过（不存在）: ${entryPosix}`);
    return;
  }
  const dest = path.join(distDir, ...entryPosix.split('/'));
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

for (const entry of DEPLOY_ENTRIES) {
  copyEntry(entry);
}

console.log(`已构建 ${distDir}`);
console.log(`包含: ${DEPLOY_ENTRIES.join(', ')}`);
