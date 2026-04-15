/**
 * SBKPI 站点首页：SBKPI搭子抽卡
 */
import zh from './sbti-data.zh.js';
import {
  SBKPI_LAST_DRAW_KEY,
  clearSbkpiHomeLocalData,
  getUnlockedCardIds,
  recordUnlock,
} from './sbti-unlock.js';

const { typePosters, typeLibrary, ui } = zh;

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

/**
 * 统一抽卡骨架：首次加载与后续抽卡均复用同一 DOM 结构。
 * @param {HTMLElement} host
 */
function renderDrawSkeleton(host) {
  host.innerHTML = `
      <div class="draw-result-inner" aria-hidden="true">
        <div class="land-poker-slot">
          <div class="land-poker-deal">
            <div class="land-poker is-black">
              <div class="land-poker-inner land-poker-inner--from-back">
                <div class="land-poker-back" aria-hidden="true">
                  <span class="land-poker-back-logo">SBKPI</span>
                </div>
                <div class="land-poker-front">
                  <div class="lp-corner top">
                    <span class="lp-rank">?</span>
                    <span class="lp-suit">?</span>
                  </div>
                  <div class="lp-role">??</div>
                  <div class="lp-avatar" aria-hidden="true"></div>
                  <div class="lp-name">????</div>
                  <div class="lp-code">??</div>
                  <div class="lp-corner bottom">
                    <span class="lp-rank">?</span>
                    <span class="lp-suit">?</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="draw-below">
          <div class="draw-below-meta">
            <p>牌面：??</p>
            <p>人格：<strong>????</strong>（??）</p>
            <p>身份：??</p>
            <p>口头禅：“?????”</p>
          </div>
          <div class="draw-below-skill" role="note" aria-label="技能">
            <span class="draw-skill-label">技能</span>
            <p class="draw-skill-body">?????</p>
          </div>
          <div class="draw-below-persona" role="region" aria-label="人格">
            <span class="draw-persona-label">人格</span>
            <p class="draw-persona-intro">“<span class="draw-persona-intro-inner">???? · ????</span>”</p>
            <div class="draw-persona-desc-wrap">
              <p class="draw-persona-desc">?????
?????
?????
?????</p>
            </div>
          </div>
        </div>
      </div>
    `;
  host.hidden = false;
}

/**
 * 占位字段的短动画：从问号滚动过渡到真实值。
 * @param {HTMLElement} el
 * @param {string} finalText
 * @param {number} durationMs
 */
function animateRollingText(el, finalText, durationMs = 280) {
  const finalValue = String(finalText ?? '');
  const fromValue = String(el.textContent ?? '');
  if (!fromValue.includes('?') || !finalValue) {
    el.textContent = finalValue;
    return;
  }

  // 长段落直接替换，避免动画过长造成阅读干扰。
  if (finalValue.length > 32 || finalValue.includes('\n')) {
    el.textContent = finalValue;
    return;
  }

  const startedAt = performance.now();
  const maxLen = Math.max(finalValue.length, fromValue.replace(/\s+/g, '').length || 0);
  const randomPool = ['?', '？', '*', '#', '·'];

  const tick = (now) => {
    const p = Math.min(1, (now - startedAt) / durationMs);
    const revealed = Math.floor(finalValue.length * p);
    const restLen = Math.max(0, maxLen - revealed);
    const rest = Array.from({ length: restLen }, (_, i) => randomPool[(i + revealed) % randomPool.length]).join('');
    el.textContent = `${finalValue.slice(0, revealed)}${rest}`;
    if (p < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = finalValue;
    }
  };

  requestAnimationFrame(tick);
}

/**
 * 动效结束后，把问号占位替换为真实内容（带短滚动揭晓）。
 * @param {HTMLElement} host
 * @param {Record<string, string>} fields
 */
function applyRevealFields(host, fields) {
  Object.entries(fields).forEach(([key, value]) => {
    host.querySelectorAll(`[data-draw-field="${key}"]`).forEach((el) => {
      animateRollingText(el, value);
    });
  });
}

/**
 * 抽卡揭晓：发牌飞入（~0.5s）+ 翻面（~0.5s），翻面后替换占位符。
 * @param {HTMLElement} host
 * @param {Record<string, string>} revealFields
 * @param {{ skipDeal?: boolean }} [opts]
 */
function queueDrawReveal(host, revealFields, opts = {}) {
  const { skipDeal = false } = opts;
  const dealWrap = host.querySelector('.land-poker-deal');
  const inner = host.querySelector('.land-poker-inner');
  const badge = host.querySelector('.draw-new-unlock');
  const btn = document.getElementById('drawCardBtn');
  const flipMs = 500;

  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  }

  const afterFlipReveal = () => {
    applyRevealFields(host, revealFields);
    badge?.classList.remove('draw-new-unlock--wait');
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  };

  const startFlip = () => {
    inner?.classList.remove('land-poker-inner--from-back');
    inner?.classList.add('land-poker-inner--show-front');
    window.setTimeout(afterFlipReveal, flipMs);
  };

  /** @param {AnimationEvent | { animationName?: string }} e */
  const onDealEnd = (e) => {
    if (e && 'animationName' in e && e.animationName && e.animationName !== 'land-poker-deal-in') return;
    startFlip();
  };

  if (skipDeal) {
    window.setTimeout(() => startFlip(), 40);
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      dealWrap?.classList.add('land-poker-deal--play-deal');
    });
  });
  dealWrap?.addEventListener('animationend', onDealEnd, { once: true });
  window.setTimeout(() => {
    if (inner?.classList.contains('land-poker-inner--from-back')) {
      onDealEnd({ animationName: 'land-poker-deal-in' });
    }
  }, 650);
}

/**
 * 首次打开：先播放发牌，再静止等待，直至 CSV 加载完成。
 * @param {HTMLElement} host
 * @param {HTMLButtonElement | null} btn
 */
function startInitialLoadingAnimation(host, btn) {
  const dealWrap = host.querySelector('.land-poker-deal');
  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  }
  if (!dealWrap) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      dealWrap.classList.add('land-poker-deal--play-deal');
    });
  });

  const finishDeal = (e) => {
    if (e && 'animationName' in e && e.animationName && e.animationName !== 'land-poker-deal-in') return;
    dealWrap.classList.remove('land-poker-deal--play-deal');
  };
  dealWrap.addEventListener('animationend', finishDeal, { once: true });
  window.setTimeout(() => {
    if (dealWrap.classList.contains('land-poker-deal--play-deal')) {
      finishDeal({ animationName: 'land-poker-deal-in' });
    }
  }, 650);
}

/**
 * @param {HTMLElement} host
 * @param {{ showNewUnlock?: boolean; animate?: boolean; skipDeal?: boolean }} [opts]
 */
function renderDrawCard(row, host, opts = {}) {
  const { showNewUnlock = false, animate = false, skipDeal = false } = opts;
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
  const revealFields = {
    face: paiMian,
    personaName: row.persona_name,
    personaCode: row.persona_code,
    role: roleCn,
    flavor: row.flavor,
    skill: row.skill,
    intro: lib?.intro || '',
    desc: lib?.desc || '',
  };
  const placeholderText = {
    face: '??',
    personaName: '????',
    personaCode: '??',
    role: '??',
    flavor: '?????',
    skill: '?????',
    intro: '???? · ????',
    desc: '?????\n?????\n?????\n?????',
  };
  const shown = animate ? placeholderText : revealFields;
  const personaBlock =
    lib &&
    `<div class="draw-below-persona" role="region" aria-label="人格">
            <span class="draw-persona-label">人格</span>
            <p class="draw-persona-intro">${quoteOpen}<span class="draw-persona-intro-inner" data-draw-field="intro">${escHtml(shown.intro)}</span>${quoteClose}</p>
            <div class="draw-persona-desc-wrap">
              <p class="draw-persona-desc" data-draw-field="desc">${escHtml(shown.desc)}</p>
            </div>
          </div>`;

  const newUnlockBanner = showNewUnlock
    ? `<div class="draw-new-unlock${animate ? ' draw-new-unlock--wait' : ''}" role="status" aria-live="polite">新搭子解锁<span class="draw-new-unlock-bang" aria-hidden="true">！</span></div>`
    : '';

  const innerFlipClass = animate
    ? 'land-poker-inner land-poker-inner--from-back'
    : 'land-poker-inner land-poker-inner--show-front';
  const belowClass = 'draw-below';

  host.innerHTML = `
      <div class="draw-result-inner">
        <div class="land-poker-slot">
          ${newUnlockBanner}
          <div class="land-poker-deal">
            <div class="${pokerCls}">
              <div class="${innerFlipClass}">
                <div class="land-poker-back" aria-hidden="true">
                  <span class="land-poker-back-logo">SBKPI</span>
                </div>
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
        </div>
        <div class="${belowClass}">
          <div class="draw-below-meta">
            <p>牌面：<span data-draw-field="face">${escHtml(shown.face)}</span></p>
            <p>人格：<strong data-draw-field="personaName">${escHtml(shown.personaName)}</strong>（<span data-draw-field="personaCode">${escHtml(shown.personaCode)}</span>）</p>
            <p>身份：<span data-draw-field="role">${escHtml(shown.role)}</span></p>
            <p>口头禅：${quoteOpen}<span class="draw-quote" data-draw-field="flavor">${escHtml(shown.flavor)}</span>${quoteClose}</p>
          </div>
          <div class="draw-below-skill" role="note" aria-label="技能">
            <span class="draw-skill-label">技能</span>
            <p class="draw-skill-body" data-draw-field="skill">${escHtml(shown.skill)}</p>
          </div>
          ${personaBlock || ''}
        </div>
      </div>
    `;
  host.hidden = false;
  if (animate) {
    queueDrawReveal(host, revealFields, { skipDeal });
  }
}

/** @param {number} deckTotal */
function refreshUnlockProgress(deckTotal) {
  const n = getUnlockedCardIds().size;
  const progressText = `已解锁 ${n}/${deckTotal}`;

  const navSpan = document.getElementById('navGalleryUnlock');
  const navLink = document.getElementById('navSbkpiGallery');
  if (navSpan && navLink) {
    navSpan.textContent = ` · ${progressText}`;
    navLink.setAttribute('aria-label', `SBKPI搭子图鉴，已解锁 ${n}张，共 ${deckTotal} 张`);
  }

  const drawUnlock = document.getElementById('drawBtnUnlock');
  const drawBtn = document.getElementById('drawCardBtn');
  if (drawUnlock && drawBtn) {
    drawUnlock.textContent = ` · ${progressText}`;
    drawBtn.setAttribute('aria-label', `换一个 SBKPI 搭子，当前${progressText}`);
  }
}

async function main() {
  const btn = document.getElementById('drawCardBtn');
  const host = document.getElementById('drawCardResult');
  const privacyEl = document.getElementById('landPrivacyNote');
  const clearBtn = document.getElementById('landClearLocalBtn');
  const motionOk = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!btn || !host) return;

  if (!host.querySelector('.draw-result-inner')) {
    renderDrawSkeleton(host);
  }
  if (motionOk) {
    startInitialLoadingAnimation(host, btn);
  }

  const res = await fetch('./docs/persona-poker-deck.csv');
  const rows = parseCsv(await res.text());
  if (!rows.length) return;

  const deckTotal = rows.length;

  if (privacyEl) privacyEl.textContent = ui.land.dataPrivacy;
  if (clearBtn) {
    clearBtn.textContent = ui.land.clearLocal;
    clearBtn.addEventListener('click', () => {
      if (!window.confirm(ui.land.clearLocalConfirm)) return;
      clearSbkpiHomeLocalData();
      refreshUnlockProgress(deckTotal);
      const row = rows[Math.floor(Math.random() * rows.length)];
      const { isNew } = recordUnlock(row.card_id);
      renderDrawCard(row, host, { showNewUnlock: isNew, animate: false });
      refreshUnlockProgress(deckTotal);
    });
  }

  // 每次进入页面随机展示；抽卡按钮仍会写入上次结果（供扩展或其它入口读取）
  const rowToShow = rows[Math.floor(Math.random() * rows.length)];
  const firstUnlock = recordUnlock(rowToShow.card_id);
  renderDrawCard(rowToShow, host, { showNewUnlock: firstUnlock.isNew, animate: motionOk, skipDeal: motionOk });
  refreshUnlockProgress(deckTotal);

  btn.addEventListener('click', () => {
    const row = rows[Math.floor(Math.random() * rows.length)];
    localStorage.setItem(SBKPI_LAST_DRAW_KEY, row.card_id);
    const { isNew } = recordUnlock(row.card_id);
    renderDrawCard(row, host, { showNewUnlock: isNew, animate: motionOk });
    refreshUnlockProgress(deckTotal);
  });
}

main();
