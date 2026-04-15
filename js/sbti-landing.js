/**
 * SBKPI 站点首页：SBKPI搭子抽卡
 */
import zh from './sbti-data.zh.js';

const { typePosters, typeLibrary } = zh;

const LAST_DRAW_KEY = 'sbkpi_last_draw_card_id';

/** @param {string} s */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] || '').trim();
    });
    return row;
  });
}

function suitSymbol(suit) {
  if (suit === 'Hearts') return '\u2665';
  if (suit === 'Diamonds') return '\u2666';
  if (suit === 'Spades') return '\u2660';
  if (suit === 'Clubs') return '\u2663';
  return '';
}

function rankLabel(rank) {
  return rank === 'JOKER' ? 'JOKER' : rank;
}

/** @param {HTMLElement} host */
function renderDrawCard(row, host) {
  const portrait = typePosters[row.persona_code]?.image || '';
  const roleCn = row.role === 'Boss' ? '领导' : '同事';
  const sym = suitSymbol(row.suit);
  const rk = rankLabel(row.rank);
  const red = row.color === 'Red';
  const isJoker = row.rank === 'JOKER';
  const pokerCls = `land-poker${red ? ' is-red' : ' is-black'}${isJoker ? ' is-joker' : ''}`;
  const suitHtml = sym && !isJoker ? `<span class="lp-suit">${sym}</span>` : '';
  let paiMian = '';
  if (isJoker) {
    if (row.card_id === 'B-JK-BIG') paiMian = '大王';
    else if (row.card_id === 'C-JK-SMALL') paiMian = '小王';
    else paiMian = 'JOKER';
  } else {
    paiMian = sym ? `${rk} ${sym}` : rk;
  }
  const quoteOpen = '\u201c';
  const quoteClose = '\u201d';
  const lib = typeLibrary[row.persona_code];
  const personaBlock =
    lib &&
    `<div class="draw-below-persona" role="region" aria-label="人格">
            <span class="draw-persona-label">人格</span>
            <p class="draw-persona-intro">${quoteOpen}<span class="draw-persona-intro-inner">${escHtml(lib.intro)}</span>${quoteClose}</p>
            <div class="draw-persona-desc-wrap">
              <p class="draw-persona-desc">${escHtml(lib.desc)}</p>
            </div>
          </div>`;

  host.innerHTML = `
      <div class="draw-result-inner">
        <div class="land-poker-slot">
          <div class="${pokerCls}">
            <div class="land-poker-inner">
              <div class="land-poker-front">
                <div class="lp-corner top">
                  <span class="lp-rank">${escHtml(rk)}</span>
                  ${suitHtml}
                </div>
                <div class="lp-role">${escHtml(roleCn)}</div>
                <div class="lp-avatar">${portrait ? `<img src="${escHtml(portrait)}" alt="" loading="lazy" />` : ''}</div>
                <div class="lp-name">${escHtml(row.persona_name)}</div>
                <div class="lp-code">${escHtml(row.persona_code)}</div>
                <div class="lp-corner bottom">
                  <span class="lp-rank">${escHtml(rk)}</span>
                  ${suitHtml}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="draw-below">
          <div class="draw-below-meta">
            <p>牌面：${escHtml(paiMian)}</p>
            <p>人格：<strong>${escHtml(row.persona_name)}</strong>（${escHtml(row.persona_code)}）</p>
            <p>身份：${escHtml(roleCn)}</p>
            <p>口头禅：${quoteOpen}<span class="draw-quote">${escHtml(row.flavor)}</span>${quoteClose}</p>
          </div>
          <div class="draw-below-skill" role="note" aria-label="技能">
            <span class="draw-skill-label">技能</span>
            <p class="draw-skill-body">${escHtml(row.skill)}</p>
          </div>
          ${personaBlock || ''}
        </div>
      </div>
    `;
  host.hidden = false;
}

async function main() {
  const res = await fetch('./docs/persona-poker-deck.csv');
  const rows = parseCsv(await res.text());
  const btn = document.getElementById('drawCardBtn');
  const host = document.getElementById('drawCardResult');
  if (!rows.length || !btn || !host) return;

  // 每次进入页面随机展示；抽卡按钮仍会写入上次结果（供扩展或其它入口读取）
  const rowToShow = rows[Math.floor(Math.random() * rows.length)];
  renderDrawCard(rowToShow, host);

  btn.addEventListener('click', () => {
    const row = rows[Math.floor(Math.random() * rows.length)];
    localStorage.setItem(LAST_DRAW_KEY, row.card_id);
    renderDrawCard(row, host);
  });
}

main();
