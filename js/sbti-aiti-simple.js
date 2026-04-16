/**
 * AITI 简易页：进入时随机一套问卷（排除 00），生成可复制简短提示词。
 */

const PROMPT_SHORT_RAW = `你正在参与「给 AI 的 SBTI 人格测试」。

请打开问卷链接，通读其中的全部规则与题目，**按照你的人格设定，凭直觉来回答问题**，并**严格按问卷要求**完成作答与后续输出（含答案串、是否调用接口、链接格式等）：
{QUESTIONNAIRE_URL}

当前站点根地址（问卷里若需拼 URL 可参考）：{SITE_ORIGIN}`;

const els = {
  setIdDisplay: document.getElementById('setIdDisplay'),
  reviewLink: document.getElementById('reviewLink'),
  promptOutput: document.getElementById('promptOutput'),
  copyPromptBtn: document.getElementById('copyPromptBtn'),
  randomAgainBtn: document.getElementById('randomAgainBtn'),
  error: document.getElementById('errorBox'),
};

function normalizeSetId(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
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
      const lo = Math.max(0, Math.min(a, b));
      const hi = Math.min(99, Math.max(a, b));
      for (let i = lo; i <= hi; i += 1) out.add(String(i).padStart(2, '0'));
      continue;
    }
    const id = normalizeSetId(t);
    if (id) out.add(id);
  }
  return [...out].sort();
}

/** 与完整页一致：随机池为 01–99，不含校验专用 00 */
const RANDOM_POOL = parseSetList('01-99').filter((id) => id !== '00');

function buildQuestionnaireUrl(setId) {
  return new URL(`./aiti/q/${setId}.txt`, window.location.href).toString();
}

function buildPrompt(setId) {
  return PROMPT_SHORT_RAW.replaceAll('{QUESTIONNAIRE_URL}', buildQuestionnaireUrl(setId)).replaceAll(
    '{SITE_ORIGIN}',
    window.location.origin,
  );
}

function pickRandomSetId() {
  if (!RANDOM_POOL.length) return '01';
  return RANDOM_POOL[Math.floor(Math.random() * RANDOM_POOL.length)];
}

function showError(text) {
  els.error.hidden = false;
  els.error.textContent = text;
}

function clearError() {
  els.error.hidden = true;
  els.error.textContent = '';
}

async function ensureQuestionnaireExists(setId) {
  const res = await fetch(`./aiti/q/${setId}.txt`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`问卷 ${setId} 读取失败（HTTP ${res.status}）`);
}

function applySetToUi(setId) {
  els.setIdDisplay.textContent = setId;
  els.reviewLink.href = buildQuestionnaireUrl(setId);
  els.reviewLink.textContent = els.reviewLink.href;
  els.promptOutput.value = buildPrompt(setId);
}

async function rollRandom() {
  clearError();
  const setId = pickRandomSetId();
  try {
    await ensureQuestionnaireExists(setId);
    applySetToUi(setId);
  } catch (err) {
    showError(err instanceof Error ? err.message : '问卷读取失败。');
  }
}

els.copyPromptBtn.addEventListener('click', async () => {
  clearError();
  const text = els.promptOutput.value;
  try {
    await navigator.clipboard.writeText(text);
    els.copyPromptBtn.textContent = '已复制';
    setTimeout(() => {
      els.copyPromptBtn.textContent = '复制提示词';
    }, 1600);
  } catch {
    showError('复制失败：请手动全选文本框后复制，或检查浏览器权限。');
  }
});

els.randomAgainBtn.addEventListener('click', () => {
  void rollRandom();
});

void rollRandom();
