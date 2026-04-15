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
const localConfigPath = path.join(root, 'config.local.json');

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

function normalizeGaId(raw) {
  if (typeof raw !== 'string') return '';
  const id = raw.trim();
  return /^G-[A-Z0-9]+$/i.test(id) ? id : '';
}

function normalizeAdsenseClientId(raw) {
  if (typeof raw !== 'string') return '';
  const v = raw.trim();
  if (!v) return '';
  if (/^ca-pub-\d{8,}$/i.test(v)) return v;
  if (/^pub-\d{8,}$/i.test(v)) return `ca-pub-${v.slice(4)}`;
  return '';
}

function readLocalConfig() {
  const fromEnvGa = normalizeGaId(process.env.GA4_MEASUREMENT_ID || '');
  const fromEnvAds = normalizeAdsenseClientId(process.env.ADSENSE_CLIENT_ID || '');
  if (fromEnvGa || fromEnvAds) {
    return { ga4MeasurementId: fromEnvGa, adsenseClientId: fromEnvAds };
  }
  if (!fs.existsSync(localConfigPath)) {
    return { ga4MeasurementId: '', adsenseClientId: '' };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
    return {
      ga4MeasurementId: normalizeGaId(parsed.ga4MeasurementId || ''),
      adsenseClientId: normalizeAdsenseClientId(parsed.adsenseClientId || ''),
    };
  } catch {
    return { ga4MeasurementId: '', adsenseClientId: '' };
  }
}

function getDistHtmlFiles() {
  const entries = fs.readdirSync(distDir, { withFileTypes: true });
  return entries
    .filter((ent) => ent.isFile() && ent.name.toLowerCase().endsWith('.html'))
    .map((ent) => path.join(distDir, ent.name));
}

function injectSnippetIntoHtmlFiles(htmlFiles, snippet) {
  htmlFiles.forEach((filePath) => {
    const raw = fs.readFileSync(filePath, 'utf8');
    const injected = raw.replace('</head>', `${snippet}\n</head>`);
    fs.writeFileSync(filePath, injected);
  });
}

function injectGaIntoDistHtml(htmlFiles, measurementId) {
  if (!measurementId) {
    console.log('GA4 未配置，跳过注入。');
    return;
  }
  const snippet = [
    '<!-- GA4 (build-time injected) -->',
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>`,
    '<script>',
    '  window.dataLayer = window.dataLayer || [];',
    '  function gtag(){dataLayer.push(arguments);}',
    "  gtag('js', new Date());",
    `  gtag('config', '${measurementId}', { anonymize_ip: true });`,
    '</script>',
  ].join('\n');
  injectSnippetIntoHtmlFiles(htmlFiles, snippet);
  console.log(`GA4 已注入到 ${htmlFiles.length} 个 HTML（${measurementId}）。`);
}

function injectAdsenseIntoDistHtml(htmlFiles, adsenseClientId) {
  if (!adsenseClientId) {
    console.log('AdSense 未配置，跳过注入。');
    return;
  }
  const snippet = [
    '<!-- AdSense (build-time injected) -->',
    `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClientId}" crossorigin="anonymous"></script>`,
  ].join('\n');
  injectSnippetIntoHtmlFiles(htmlFiles, snippet);
  console.log(`AdSense 已注入到 ${htmlFiles.length} 个 HTML（${adsenseClientId}）。`);
}

function writeAdsTxt(adsenseClientId) {
  const adsTxtPath = path.join(distDir, 'ads.txt');
  if (!adsenseClientId) {
    if (fs.existsSync(adsTxtPath)) fs.rmSync(adsTxtPath, { force: true });
    console.log('ads.txt 未生成（AdSense 未配置）。');
    return;
  }
  const publisherId = adsenseClientId.replace(/^ca-/i, '');
  const line = `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`;
  fs.writeFileSync(adsTxtPath, line, 'utf8');
  console.log(`ads.txt 已生成（${publisherId}）。`);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

for (const entry of DEPLOY_ENTRIES) {
  copyEntry(entry);
}

const htmlFiles = getDistHtmlFiles();
const localConfig = readLocalConfig();
injectGaIntoDistHtml(htmlFiles, localConfig.ga4MeasurementId);
injectAdsenseIntoDistHtml(htmlFiles, localConfig.adsenseClientId);
writeAdsTxt(localConfig.adsenseClientId);

console.log(`已构建 ${distDir}`);
console.log(`包含: ${DEPLOY_ENTRIES.join(', ')}`);
