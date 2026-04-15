/**
 * 打包 Cloudflare Pages 等静态托管所需的**最小文件集**，输出到 release/。
 * 文件名：sbkpi-YYYY-MM-DD-HHmmss.zip（本地时间，可读）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { DEPLOY_ENTRIES } from './deploy-entries.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'release');

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const zipName = `sbkpi-${stamp}.zip`;
const outPath = path.join(releaseDir, zipName);

function toPosix(rel) {
  return rel.split(path.sep).join('/');
}

function walkDir(dir, baseRelPosix, onFile) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === '.DS_Store') continue;
    const childRel = baseRelPosix ? `${baseRelPosix}/${ent.name}` : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkDir(full, childRel, onFile);
    } else {
      onFile(full, childRel);
    }
  }
}

/** @param {import('archiver').Archiver} archive */
function addDeployPath(archive, entryPosix) {
  const full = path.join(root, ...entryPosix.split('/'));
  if (!fs.existsSync(full)) {
    console.warn(`跳过（不存在）: ${entryPosix}`);
    return;
  }
  const st = fs.statSync(full);
  if (st.isFile()) {
    archive.file(full, { name: entryPosix });
    return;
  }
  if (st.isDirectory()) {
    walkDir(full, toPosix(path.relative(root, full)), (f, nameInZip) => {
      archive.file(f, { name: nameInZip });
    });
  }
}

fs.mkdirSync(releaseDir, { recursive: true });

const output = fs.createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

await new Promise((resolve, reject) => {
  output.on('close', resolve);
  archive.on('error', reject);
  archive.pipe(output);
  for (const entry of DEPLOY_ENTRIES) {
    addDeployPath(archive, entry);
  }
  archive.finalize();
});

console.log(`已生成 ${outPath}（${archive.pointer()} 字节）`);
console.log(`包含: ${DEPLOY_ENTRIES.join(', ')}`);
