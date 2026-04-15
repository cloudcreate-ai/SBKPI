import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bundle from '../js/sbti-data.zh.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'aiti', 'q');
const mapDir = path.join(root, 'aiti', 'map');

function createPrng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let v = Math.imul(t ^ (t >>> 15), 1 | t);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleBy(array, random) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildQuestionSet(seed) {
  const random = createPrng(seed);
  const [q31, q32] = bundle.specialQuestions;
  const base = shuffleBy([...bundle.questions], random);
  const pos31 = Math.floor(random() * (base.length + 1));
  base.splice(pos31, 0, q31);
  const pos32 = pos31 + 1 + Math.floor(random() * (base.length - pos31));
  base.splice(pos32, 0, q32);
  return base;
}

function makeOpaqueId(random) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    out += chars[Math.floor(random() * chars.length)];
  }
  return out;
}

function formatLineQuestion(opaqueId, question, seq) {
  const opts = question.options.map((opt) => `${opt.value}=${opt.label}`).join(';');
  return `Q|${String(seq).padStart(2, '0')}|${opaqueId}|${question.text}|${opts}`;
}

function writeSet(index) {
  const id = String(index).padStart(2, '0');
  const seed = index;
  const list = buildQuestionSet(seed);
  const random = createPrng(seed * 9973 + 17);
  const opaqueByRealId = new Map();
  list.forEach((q) => {
    let opaque = makeOpaqueId(random);
    while (opaqueByRealId.has(opaque)) opaque = makeOpaqueId(random);
    opaqueByRealId.set(q.id, opaque);
  });
  const lines = [
    'V|1',
    `SET|${id}`,
    `SEED|${seed}`,
    `LEN|${list.length}`,
    'NOTE|所有题目均为必答题，答案位按题目顺序对应',
    'PROFILE_Q1|你是谁，或者该怎么称呼你（可留空）',
    'PROFILE_Q2|你的模型是什么（可留空）',
    'FORMAT|每题格式: Q|序号|内部ID(无规律字符串)|题目|选项(例如 1=...;2=...;3=...;4=...)',
    'ORDER_RULE|答案位严格对应序号列，不得按内部ID或题目内容重排',
    'MAP_RULE|内部ID映射表保存在独立文件: /aiti/map/{SET}.json',
    'ANSWER_RULE|你必须只输出一行纯数字答案串；第N位对应第N题；每位只能是1-4；长度必须等于LEN',
    'BASE_URL_RULE|优先从“当前问卷文件的来源URL”提取 baseUrl(协议+域名+端口)；若无法提取则使用 FALLBACK_BASE_URL',
    'FALLBACK_BASE_URL|https://thedecklab.com',
    `RESULT_PATH|/aiti-result?q=${id}&a=<答案串>`,
    'PROFILE_URL_PARAM|将称呼与模型分别以参数 n/m 拼接到结果链接；优先使用 URLSearchParams 自动编码，或对参数值做 URL 编码',
    'OUTPUT_STEP_1|先按固定纯文本输出，便于人工查看与复制到网页',
    'OUTPUT_STEP_1_FORMAT|SET=<问卷编号>;NAME=<称呼，可空>;MODEL=<模型，可空>;ANSWER=<答案串>;LENGTH=<长度>',
    'OUTPUT_STEP_2|再输出 RESULT_URL=<完整结果链接>，便于一键打开',
    'OUTPUT_NOTE|若无法可靠编码 n/m，可先保证 OUTPUT_STEP_1 正确，再尝试输出 RESULT_URL',
    `RESULT_URL_EXAMPLE|https://thedecklab.com/aiti-result?q=${id}&a=<答案串>`,
    'RESULT_URL_NOTE|最终结果链接 = baseUrl + RESULT_PATH；将<答案串>替换为你的作答结果，不要添加任何额外字符',
    '',
  ];
  list.forEach((q, idx) => {
    lines.push(formatLineQuestion(opaqueByRealId.get(q.id), q, idx + 1));
  });
  fs.writeFileSync(path.join(outDir, `${id}.txt`), `${lines.join('\n')}\n`, 'utf8');
  const mapPayload = {
    version: 1,
    set: id,
    mapping: Object.fromEntries([...opaqueByRealId.entries()].map(([realId, opaqueId]) => [opaqueId, realId])),
  };
  fs.writeFileSync(path.join(mapDir, `${id}.json`), `${JSON.stringify(mapPayload, null, 2)}\n`, 'utf8');
}

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(mapDir, { recursive: true });
for (let i = 1; i <= 99; i += 1) writeSet(i);
console.log('已生成 aiti 问卷：', outDir);
