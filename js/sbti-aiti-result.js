import bundle from './sbti-data.zh.js';
import { computeResult } from './sbti-engine.js';

const els = {
  posterImage: document.getElementById('posterImage'),
  posterCaption: document.getElementById('posterCaption'),
  posterTypeLead: document.getElementById('posterTypeLead'),
  posterTypeName: document.getElementById('posterTypeName'),
  posterTypeCode: document.getElementById('posterTypeCode'),
  resultKicker: document.getElementById('resultKicker'),
  matchBadge: document.getElementById('matchBadge'),
  resultTypeSub: document.getElementById('resultTypeSub'),
  typeDesc: document.getElementById('typeDesc'),
  title: document.getElementById('resultTitle'),
  meta: document.getElementById('resultMeta'),
  dimList: document.getElementById('dimList'),
  answerDetailList: document.getElementById('answerDetailList'),
  aiMeta: document.getElementById('aitiMeta'),
  error: document.getElementById('errorBox'),
};
const UNKNOWN_TEXT = '匿名未知';

function showError(text) {
  els.error.hidden = false;
  els.error.textContent = text;
}

function getParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || '';
}

function decodeBase64Url(text) {
  if (!text) return '';
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  try {
    const binary = atob(padded);
    const percent = Array.from(binary)
      .map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('');
    return decodeURIComponent(percent);
  } catch {
    return '';
  }
}

function normalizeProfileText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

/**
 * 兼容两种参数格式：
 * 1) 新版：URLSearchParams 普通文本参数（自动编码）
 * 2) 旧版：base64url 编码参数
 */
function decodeProfileParam(raw) {
  const plain = normalizeProfileText(raw);
  if (plain) return plain;
  const legacy = normalizeProfileText(decodeBase64Url(raw));
  return legacy;
}

function parseQuestionLine(line, realIdByOpaque) {
  const parts = line.split('|');
  const seq = parts[1] || '';
  const opaqueId = parts[2] || '';
  const id = realIdByOpaque.get(opaqueId) || opaqueId;
  const text = parts[3] || '';
  const optsRaw = parts[4] || '';
  const options = optsRaw
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const idx = x.indexOf('=');
      const value = Number(x.slice(0, idx));
      const label = x.slice(idx + 1);
      return { value, label };
    });
  return { seq, opaqueId, id, text, options };
}

async function loadQuestionnaire(setId) {
  const res = await fetch(`./aiti/q/${setId}.txt`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`问卷 ${setId} 不存在`);
  const mapRes = await fetch(`./aiti/map/${setId}.json`, { cache: 'no-store' });
  if (!mapRes.ok) throw new Error(`映射表 ${setId} 不存在`);
  const mapJson = await mapRes.json();
  const rawMapping = mapJson?.mapping;
  if (!rawMapping || typeof rawMapping !== 'object') {
    throw new Error(`映射表 ${setId} 格式错误`);
  }
  const realIdByOpaque = new Map(Object.entries(rawMapping));
  const raw = await res.text();
  const lines = raw
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  const questions = lines
    .filter((line) => line.startsWith('Q|'))
    .map((line) => parseQuestionLine(line, realIdByOpaque));
  return { raw, questions };
}

function decodeAnswers(answerRaw, questions) {
  if (!/^[1-4]+$/.test(answerRaw)) throw new Error('答案串格式错误，只允许 1-4。');
  if (answerRaw.length !== questions.length) {
    throw new Error(`答案长度应为 ${questions.length}，当前为 ${answerRaw.length}。`);
  }
  const map = {};
  questions.forEach((q, idx) => {
    const v = Number(answerRaw[idx]);
    map[q.id] = v;
  });
  return map;
}

/** 防止问卷文本破坏 DOM / XSS */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderDim(result) {
  const order = bundle.dimensionOrder;
  els.dimList.innerHTML = order
    .map((dim) => {
      const level = result.levels[dim];
      const raw = result.rawScores[dim];
      const name = bundle.dimensionMeta[dim].name;
      const exp = bundle.dimExplanations?.[dim]?.[level] || '';
      return `
        <div class="dim-item">
          <div class="dim-item-top">
            <div class="dim-item-name">${name}</div>
            <div class="dim-item-score">${level} / ${raw}分</div>
          </div>
          <p>${exp}</p>
        </div>
      `;
    })
    .join('');
}

function renderAnswerList(questions, answerRaw) {
  els.answerDetailList.innerHTML = questions
    .map((q, idx) => {
      const code = answerRaw[idx];
      const num = Number(code);
      const label = q.options.find((x) => x.value === num)?.label || '未知';
      const seq = q.seq || String(idx + 1);
      const opaque = q.opaqueId || q.id;
      return `
        <li class="answer-item">
          <div class="answer-item-head">
            <span class="answer-item-seq">第 ${escapeHtml(seq)} 题</span>
            <span class="answer-item-code" title="答案位">${escapeHtml(code)}</span>
          </div>
          <div class="answer-item-id">内部ID：<kbd>${escapeHtml(opaque)}</kbd></div>
          <p class="answer-item-q">${escapeHtml(q.text)}</p>
          <p class="answer-item-opt"><span class="answer-item-opt-label">所选</span>${escapeHtml(label)}</p>
        </li>
      `;
    })
    .join('');
}

function renderAiMeta(setId, answerRaw, result) {
  const type = result.finalType;
  const meta = {
    protocol: 'aiti-v1',
    questionnaireId: setId,
    answers: answerRaw,
    finalType: { code: type.code, cn: type.cn },
    modeKicker: result.modeKicker,
    badge: result.badge,
    sub: result.sub,
    special: result.special,
    levels: result.levels,
    rawScores: result.rawScores,
  };
  els.aiMeta.textContent = JSON.stringify(meta, null, 2);
}

async function main() {
  const q = getParam('q');
  const a = getParam('a');
  const n = decodeProfileParam(getParam('n')) || UNKNOWN_TEXT;
  const m = decodeProfileParam(getParam('m')) || UNKNOWN_TEXT;
  if (!q || !a) {
    showError('缺少参数：需要 q（问卷编号）和 a（答案串）。');
    return;
  }
  try {
    const setId = String(Number(q)).padStart(2, '0');
    const { questions } = await loadQuestionnaire(setId);
    const answers = decodeAnswers(a.trim(), questions);
    const result = computeResult(answers, bundle);
    const type = result.finalType;
    const poster = bundle.typePosters[type.code];
    els.posterImage.src = poster?.image || '';
    els.posterImage.alt = `${type.code} ${type.cn}`;
    els.posterTypeLead.textContent = `AI (${n} | ${m}) 的人格是`;
    els.posterTypeName.textContent = poster?.banner?.displayName || type.cn;
    els.posterTypeCode.textContent = poster?.banner?.codeLabel || type.code;
    els.posterCaption.textContent = type.intro || '';
    els.resultKicker.textContent = `AI (${n} | ${m}) 的人格是`;
    els.title.textContent = `${type.code}（${type.cn}）`;
    els.matchBadge.textContent = result.badge;
    els.resultTypeSub.textContent = result.sub;
    els.meta.textContent = `答卷人：${n}\n模型：${m}\n问卷 ${setId} · 答案长度 ${a.length} · 计算时间 ${new Date().toLocaleString('zh-CN')}`;
    els.typeDesc.textContent = type.desc || '';
    renderDim(result);
    renderAnswerList(questions, a.trim());
    renderAiMeta(setId, a.trim(), result);
  } catch (err) {
    showError(err instanceof Error ? err.message : '结果解析失败。');
  }
}

main();
