const els = {
  setListInput: document.getElementById('setListInput'),
  setInput: document.getElementById('qsetInput'),
  randomSetBtn: document.getElementById('randomSetBtn'),
  loadBtn: document.getElementById('loadQuestionnaireBtn'),
  questionnaireOutput: document.getElementById('questionnaireOutput'),
  resultBundleInput: document.getElementById('resultBundleInput'),
  parseBundleBtn: document.getElementById('parseBundleBtn'),
  answerInput: document.getElementById('answerInput'),
  respondentNameInput: document.getElementById('respondentNameInput'),
  respondentModelInput: document.getElementById('respondentModelInput'),
  openResultBtn: document.getElementById('openResultBtn'),
  resultUrl: document.getElementById('resultUrl'),
  aiPromptTemplate: document.getElementById('aiPromptTemplate'),
  copyPromptBtn: document.getElementById('copyPromptBtn'),
  error: document.getElementById('errorBox'),
};

const promptTemplateRaw = els.aiPromptTemplate.value;
const UNKNOWN_TEXT = '匿名未知';

function showError(text) {
  els.error.hidden = false;
  els.error.textContent = text;
}

function clearError() {
  els.error.hidden = true;
  els.error.textContent = '';
}

function normalizeSetId(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 99) return null;
  return String(n).padStart(2, '0');
}

function parseSetList(raw) {
  const tokens = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!tokens.length) return [];
  const out = new Set();
  for (const t of tokens) {
    if (t.includes('-')) {
      const [aRaw, bRaw] = t.split('-').map((x) => x.trim());
      const a = Number(aRaw);
      const b = Number(bRaw);
      if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
      const lo = Math.max(1, Math.min(a, b));
      const hi = Math.min(99, Math.max(a, b));
      for (let i = lo; i <= hi; i += 1) out.add(String(i).padStart(2, '0'));
      continue;
    }
    const id = normalizeSetId(t);
    if (id) out.add(id);
  }
  return [...out].sort();
}

async function loadQuestionnaireText(id) {
  const res = await fetch(`./aiti/q/${id}.txt`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`问卷 ${id} 读取失败`);
  return res.text();
}

function getQuestionCount(text) {
  return text
    .split('\n')
    .map((x) => x.trim())
    .filter((line) => line.startsWith('Q|')).length;
}

function buildResultUrl(setId, answer) {
  const url = new URL('./aiti-result', window.location.href);
  url.searchParams.set('q', setId);
  url.searchParams.set('a', answer);
  const nameVal = (els.respondentNameInput.value || '').trim() || UNKNOWN_TEXT;
  const modelVal = (els.respondentModelInput.value || '').trim() || UNKNOWN_TEXT;
  url.searchParams.set('n', nameVal);
  url.searchParams.set('m', modelVal);
  return url.toString();
}

function buildQuestionnaireUrl(setId) {
  return new URL(`./aiti/q/${setId}.txt`, window.location.href).toString();
}

function refreshPromptTemplate(setId) {
  const qUrl = buildQuestionnaireUrl(setId);
  els.aiPromptTemplate.value = promptTemplateRaw.replace('{QUESTIONNAIRE_URL}', qUrl);
}

async function handleLoadQuestionnaire() {
  clearError();
  const setId = normalizeSetId(els.setInput.value);
  if (!setId) {
    showError('当前编号必须在 01-99。');
    return;
  }
  els.setInput.value = setId;
  try {
    const text = await loadQuestionnaireText(setId);
    const qCount = getQuestionCount(text);
    refreshPromptTemplate(setId);
    els.questionnaireOutput.value = text;
    els.answerInput.placeholder = `请输入 ${qCount} 位答案串（1-4）`;
    if (!els.answerInput.value) {
      els.answerInput.value = ''.padEnd(qCount, '1');
    }
    const previewUrl = buildResultUrl(setId, els.answerInput.value.trim());
    els.resultUrl.value = previewUrl;
  } catch (err) {
    showError(err instanceof Error ? err.message : '问卷读取失败。');
  }
}

function validateAnswer(answer) {
  if (!answer) return '答案串不能为空。';
  if (!/^[1-4]+$/.test(answer)) return '答案串只能包含 1-4。';
  return '';
}

function parseBundleText(raw) {
  const text = (raw || '').trim();
  if (!text) return null;
  // 容错：支持英文/中文分隔符、换行、额外空白
  const normalized = text
    .replace(/；/g, ';')
    .replace(/：/g, '=')
    .replace(/\r/g, '\n');
  const map = {};
  normalized
    .split(/[;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((part) => {
      const idx = part.indexOf('=');
      if (idx < 1) return;
      const k = part.slice(0, idx).trim().toUpperCase();
      const v = part
        .slice(idx + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (k) map[k] = v;
    });

  // 容错：若 AI 只返回 RESULT_URL，则尝试反解析 q/a/n/m
  if (!map.ANSWER && map.RESULT_URL) {
    try {
      const u = new URL(map.RESULT_URL);
      map.SET = map.SET || u.searchParams.get('q') || '';
      map.ANSWER = u.searchParams.get('a') || '';
      map.NAME = map.NAME || u.searchParams.get('n') || '';
      map.MODEL = map.MODEL || u.searchParams.get('m') || '';
    } catch {
      // ignore
    }
  }

  if (!map.ANSWER) return null;
  return {
    set: map.SET || map.QSET || '',
    name: map.NAME || '',
    model: map.MODEL || '',
    answer: map.ANSWER || '',
    length: map.LENGTH || '',
  };
}

function handleOpenResult() {
  clearError();
  const setId = normalizeSetId(els.setInput.value);
  if (!setId) {
    showError('当前编号必须在 01-99。');
    return;
  }
  els.setInput.value = setId;
  const answer = els.answerInput.value.trim();
  const err = validateAnswer(answer);
  if (err) {
    showError(err);
    return;
  }
  const url = buildResultUrl(setId, answer);
  els.resultUrl.value = url;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function bind() {
  els.loadBtn.addEventListener('click', handleLoadQuestionnaire);
  els.openResultBtn.addEventListener('click', handleOpenResult);
  els.copyPromptBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(els.aiPromptTemplate.value);
      const old = els.copyPromptBtn.textContent;
      els.copyPromptBtn.textContent = '已复制';
      setTimeout(() => {
        els.copyPromptBtn.textContent = old;
      }, 1200);
    } catch {
      showError('复制失败，请手动复制。');
    }
  });
  els.randomSetBtn.addEventListener('click', () => {
    clearError();
    const list = parseSetList(els.setListInput.value);
    if (!list.length) {
      showError('编号列表无有效项，请使用如 01-10,15,20-25。');
      return;
    }
    const setId = list[Math.floor(Math.random() * list.length)];
    els.setInput.value = setId;
    refreshPromptTemplate(setId);
    handleLoadQuestionnaire();
  });
  els.parseBundleBtn.addEventListener('click', () => {
    clearError();
    const parsed = parseBundleText(els.resultBundleInput.value);
    if (!parsed) {
      showError(
        '解析失败。请使用 SET=...;NAME=...;MODEL=...;ANSWER=...;LENGTH=...，或提供包含 q/a 参数的 RESULT_URL。',
      );
      return;
    }
    const setId = normalizeSetId(parsed.set || els.setInput.value);
    if (!setId) {
      showError('当前编号必须在 01-99。');
      return;
    }
    els.setInput.value = setId;
    const answerErr = validateAnswer(parsed.answer);
    if (answerErr) {
      showError(answerErr);
      return;
    }
    if (parsed.length && Number(parsed.length) !== parsed.answer.length) {
      showError(`LENGTH 与答案长度不一致：LENGTH=${parsed.length}，答案长度=${parsed.answer.length}。`);
      return;
    }
    els.respondentNameInput.value = parsed.name;
    els.respondentModelInput.value = parsed.model;
    els.answerInput.value = parsed.answer;
    els.resultUrl.value = buildResultUrl(setId, parsed.answer);
  });
  els.setInput.addEventListener('change', () => {
    const setId = normalizeSetId(els.setInput.value);
    if (!setId) return;
    refreshPromptTemplate(setId);
  });
  els.answerInput.addEventListener('input', () => {
    const setId = normalizeSetId(els.setInput.value);
    if (!setId) return;
    els.resultUrl.value = buildResultUrl(setId, els.answerInput.value.trim());
  });
  const refreshUrlByProfile = () => {
    const setId = normalizeSetId(els.setInput.value);
    if (!setId) return;
    els.resultUrl.value = buildResultUrl(setId, els.answerInput.value.trim());
  };
  els.respondentNameInput.addEventListener('input', refreshUrlByProfile);
  els.respondentModelInput.addEventListener('input', refreshUrlByProfile);
}

function bootstrap() {
  bind();
  const list = parseSetList(els.setListInput.value);
  const setId = list.length ? list[Math.floor(Math.random() * list.length)] : '01';
  els.setInput.value = setId;
  refreshPromptTemplate(setId);
  handleLoadQuestionnaire();
}

bootstrap();
