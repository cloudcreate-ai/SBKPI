/**
 * AITI 计分 API：从同部署的静态资源读取问卷与 map，GET + querystring，纯文本响应（便于 Agent 阅读）。
 */
import sbtiBundle from '../js/sbti-data.zh.js';
import { computeResult } from '../js/sbti-engine.js';

const UNKNOWN_TEXT = '匿名未知';
const API_PROTOCOL = 'aiti-api-text-v1';

function textResponse(status, body, extraHeaders = {}) {
  const headers = {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    ...extraHeaders,
  };
  return new Response(body, { status, headers });
}

function oneLine(s) {
  return String(s ?? '')
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

/** 兼容 URL 明文与旧版 base64url */
function decodeProfileParam(raw) {
  const plain = normalizeProfileText(raw);
  if (plain) return plain;
  return normalizeProfileText(decodeBase64Url(raw));
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

/**
 * @param {Fetcher} assets
 * @param {string} origin 当前请求的 origin（用于同域拉取 dist 内文件）
 */
async function loadQuestionnaireFromAssets(assets, origin, setId) {
  const qUrl = new URL(`/aiti/q/${setId}.txt`, origin).href;
  const mapUrl = new URL(`/aiti/map/${setId}.json`, origin).href;
  const qRes = await assets.fetch(new Request(qUrl, { method: 'GET' }));
  if (!qRes.ok) throw new Error(`问卷 ${setId} 不存在（HTTP ${qRes.status}）`);
  const mapRes = await assets.fetch(new Request(mapUrl, { method: 'GET' }));
  if (!mapRes.ok) throw new Error(`映射表 ${setId} 不存在（HTTP ${mapRes.status}）`);
  const mapJson = await mapRes.json();
  const rawMapping = mapJson?.mapping;
  if (!rawMapping || typeof rawMapping !== 'object') {
    throw new Error(`映射表 ${setId} 格式错误`);
  }
  const realIdByOpaque = new Map(Object.entries(rawMapping));
  const raw = await qRes.text();
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

function formatSuccessText({
  setId,
  answerRaw,
  n,
  m,
  result,
  bundle,
}) {
  const ft = result.finalType;
  const lines = [];
  lines.push(`protocol: ${API_PROTOCOL}`);
  lines.push('status: ok');
  lines.push('');
  lines.push('[request]');
  lines.push(`questionnaire_id: ${setId}`);
  lines.push(`answer_length: ${answerRaw.length}`);
  lines.push('');
  lines.push('[respondent]');
  lines.push(`name: ${n}`);
  lines.push(`model: ${m}`);
  lines.push('');
  lines.push('[result]');
  lines.push(`final_code: ${ft.code}`);
  lines.push(`final_cn: ${ft.cn}`);
  lines.push(`intro: ${oneLine(ft.intro)}`);
  lines.push(`mode_kicker: ${oneLine(result.modeKicker)}`);
  lines.push(`badge: ${oneLine(result.badge)}`);
  lines.push(`sub: ${oneLine(result.sub)}`);
  lines.push(`special: ${result.special ? 'yes' : 'no'}`);
  lines.push(`best_normal_code: ${result.bestNormal.code}`);
  lines.push(`best_normal_cn: ${result.bestNormal.cn}`);
  lines.push(`best_normal_similarity: ${result.bestNormal.similarity}`);
  lines.push(`best_normal_exact_dims: ${result.bestNormal.exact}`);
  lines.push(`drunk_triggered: ${result.finalType.code === 'DRUNK' ? 'yes' : 'no'}`);
  if (result.secondaryType) {
    lines.push('');
    lines.push('[secondary]');
    lines.push(`code: ${result.secondaryType.code}`);
    lines.push(`cn: ${result.secondaryType.cn}`);
  }
  lines.push('');
  lines.push('[dimensions]');
  for (const dim of bundle.dimensionOrder) {
    const raw = result.rawScores[dim];
    const level = result.levels[dim];
    const name = bundle.dimensionMeta[dim]?.name || dim;
    const note = bundle.dimExplanations?.[dim]?.[level] || '';
    lines.push(`${dim}  name=${oneLine(name)}  raw=${raw}  level=${level}  note=${oneLine(note)}`);
  }
  lines.push('');
  lines.push('[note]');
  lines.push('娱乐向站点内容，非临床或职场测评；结果仅供玩梗参考。');
  return `${lines.join('\n')}\n`;
}

async function handleAitiApi(request, env) {
  const url = new URL(request.url);
  const qRaw = url.searchParams.get('q') || '';
  const aRaw = (url.searchParams.get('a') || '').trim();
  const n = decodeProfileParam(url.searchParams.get('n') || '') || UNKNOWN_TEXT;
  const m = decodeProfileParam(url.searchParams.get('m') || '') || UNKNOWN_TEXT;

  if (!qRaw || !aRaw) {
    return textResponse(
      400,
      `protocol: ${API_PROTOCOL}\nstatus: error\nmessage: 缺少必填参数 q（问卷编号）或 a（答案串）。\n`,
    );
  }

  const num = Number(qRaw);
  if (!Number.isFinite(num) || num < 0 || num > 99) {
    return textResponse(
      400,
      `protocol: ${API_PROTOCOL}\nstatus: error\nmessage: 参数 q 应为 0–99 的整数。\n`,
    );
  }

  const setId = String(num).padStart(2, '0');
  const origin = url.origin;

  try {
    const { questions } = await loadQuestionnaireFromAssets(env.ASSETS, origin, setId);
    const answers = decodeAnswers(aRaw, questions);
    const result = computeResult(answers, sbtiBundle);
    const body = formatSuccessText({
      setId,
      answerRaw: aRaw,
      n,
      m,
      result,
      bundle: sbtiBundle,
    });
    return textResponse(200, body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return textResponse(
      400,
      `protocol: ${API_PROTOCOL}\nstatus: error\nmessage: ${oneLine(msg)}\n`,
    );
  }
}

export default {
  /**
   * @param {Request} request
   * @param {{ ASSETS: Fetcher }} env
   */
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-max-age': '86400',
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    if (path === '/api/aiti-result') {
      if (request.method !== 'GET') {
        return textResponse(405, `protocol: ${API_PROTOCOL}\nstatus: error\nmessage: 仅支持 GET。\n`, {
          allow: 'GET, OPTIONS',
        });
      }
      return handleAitiApi(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return textResponse(500, `protocol: ${API_PROTOCOL}\nstatus: error\nmessage: 未配置 ASSETS 绑定。\n`);
  },
};
