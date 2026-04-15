import zh from './sbti-data.zh.js';
import { getUnlockedCardIds } from './sbti-unlock.js';

const { typePosters } = zh;

const els = {
  grid: document.getElementById('pokerGrid'),
  search: document.getElementById('pokerSearch'),
  role: document.getElementById('roleFilter'),
  suit: document.getElementById('suitFilter'),
  count: document.getElementById('cardCount'),
};

/**
 * 读取 CSV。当前数据不含英文逗号转义场景，按逗号切分即可。
 * @param {string} text
 */
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

/** @param {Record<string, string>[]} rows */
function sortByPersona(rows) {
  // PC 端矩阵目标：
  // 1) 同一行同点数；2) 同一列同花色；3) 相邻两张(1,2 / 3,4)为同人格
  // 通过行内顺序 [Hearts, Spades, Diamonds, Clubs] 实现。
  const rankSeq = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const suitSeq = ['Hearts', 'Spades', 'Diamonds', 'Clubs'];

  /** @type {Record<string, Record<string, Record<string, string>>>} */
  const byRankSuit = {};
  rows.forEach((row) => {
    if (row.rank === 'JOKER') return;
    if (!byRankSuit[row.rank]) byRankSuit[row.rank] = {};
    byRankSuit[row.rank][row.suit] = row;
  });

  /** @type {Record<string, string>[]} */
  const sorted = [];
  rankSeq.forEach((rank) => {
    const suitMap = byRankSuit[rank] || {};
    suitSeq.forEach((suit) => {
      if (suitMap[suit]) sorted.push(suitMap[suit]);
    });
  });

  // Joker 固定追加在末尾（大王在前，小王在后）
  const jokerRows = rows.filter((r) => r.rank === 'JOKER');
  jokerRows.sort((a, b) => {
    const wa = a.card_id === 'B-JK-BIG' ? 0 : 1;
    const wb = b.card_id === 'B-JK-BIG' ? 0 : 1;
    return wa - wb;
  });
  sorted.push(...jokerRows);

  return sorted;
}

/** @param {string} suit */
function suitSymbol(suit) {
  if (suit === 'Hearts') return '♥';
  if (suit === 'Diamonds') return '♦';
  if (suit === 'Spades') return '♠';
  if (suit === 'Clubs') return '♣';
  return '';
}

/** @param {string} rank */
function rankLabel(rank) {
  if (rank === 'JOKER') return 'JOKER';
  return rank;
}

/** @param {string} code */
function personaImage(code) {
  return typePosters[code]?.image || '';
}

/** @param {string} frag */
function tryDecodeURIComponent(frag) {
  try {
    return decodeURIComponent(frag);
  } catch {
    return frag;
  }
}

/**
 * 与 wiki（SBTI 人格图鉴）一致：`#persona_code`；`#card-…` 表示 card- 后为 persona 或牌面 card_id（如 B-H-A）
 * @param {string} raw
 */
function hashFragmentToPersonaOrId(raw) {
  if (!raw) return '';
  let primary = tryDecodeURIComponent(raw);
  if (primary.startsWith('card-')) {
    return tryDecodeURIComponent(primary.slice(5));
  }
  return tryDecodeURIComponent(raw);
}

/**
 * @param {HTMLElement[]} cards
 * @param {string} raw
 */
function resolvePokerHashTarget(cards, raw) {
  if (!raw) return null;
  const decoded = tryDecodeURIComponent(raw);
  const idsToTry = [raw, decoded];
  for (const id of idsToTry) {
    if (!id) continue;
    let el = document.getElementById(id);
    if (el?.classList?.contains('poker-card')) return el;
    if (!id.startsWith('poker-')) {
      el = document.getElementById(`poker-${id}`);
      if (el?.classList?.contains('poker-card')) return el;
    }
  }
  const slug = hashFragmentToPersonaOrId(raw);
  if (slug) {
    const byDeck = document.getElementById(`poker-${slug}`);
    if (byDeck?.classList?.contains('poker-card')) return byDeck;
  }
  let el = cards.find((c) => c.dataset.personaCode === slug);
  if (!el && slug) {
    const lower = slug.toLowerCase();
    el = cards.find(
      (c) => (c.dataset.personaCode || '').toLowerCase() === lower
    );
  }
  return el || null;
}

/** @param {HTMLElement} target */
function revealPokerTarget(target) {
  document.querySelectorAll('.poker-card--focus').forEach((el) => {
    el.classList.remove('poker-card--focus');
  });
  target.classList.add('poker-card--focus');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => target.classList.remove('poker-card--focus'), 2600);
}

/**
 * @param {Record<string, string>} card
 * @param {Set<string>} unlockedIds
 */
function createCardEl(card, unlockedIds) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = `poker-${card.card_id}`;
  const isUnlocked = unlockedIds.has(card.card_id);
  btn.className = `poker-card ${card.color === 'Red' ? 'is-red' : 'is-black'} ${card.rank === 'JOKER' ? 'is-joker' : ''}${isUnlocked ? '' : ' poker-card--locked'}`;
  btn.dataset.role = card.role;
  btn.dataset.suit = card.suit;
  btn.dataset.personaCode = card.persona_code;
  btn.dataset.unlocked = isUnlocked ? '1' : '0';
  if (isUnlocked) {
    btn.dataset.search = [
      card.card_id,
      card.role,
      card.suit,
      card.persona_code,
      card.persona_name,
      card.flavor,
      card.skill,
    ]
      .join(' ')
      .toLowerCase();
  } else {
    btn.dataset.search = [card.card_id, card.role, card.suit, card.rank, '未解锁'].join(' ').toLowerCase();
    btn.setAttribute('aria-disabled', 'true');
    btn.setAttribute('aria-label', '未解锁：请在首页抽卡解锁后可翻面查看');
  }

  const portrait = personaImage(card.persona_code);
  const symbol = suitSymbol(card.suit);
  const rank = rankLabel(card.rank);
  const roleCn = card.role === 'Boss' ? '领导' : '同事';
  const galleryHash = encodeURIComponent(card.persona_code);

  if (isUnlocked) {
    btn.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-front">
        <div class="card-corner top">
          <span class="rank">${rank}</span>
          <span class="suit">${symbol}</span>
        </div>
        <div class="card-role">${roleCn}</div>
        <div class="card-avatar">${portrait ? `<img src="${portrait}" alt="" loading="lazy" />` : ''}</div>
        <div class="card-name">${card.persona_name}</div>
        <div class="card-code">${card.persona_code}</div>
        <div class="card-corner bottom">
          <span class="rank">${rank}</span>
          <span class="suit">${symbol}</span>
        </div>
      </div>
      <div class="card-face card-back">
        <div class="back-title">${card.persona_name} · ${roleCn}</div>
        <p class="back-flavor">${card.flavor}</p>
        <p class="back-skill">${card.skill}</p>
        <a class="card-gallery-link" href="./wiki.html#${galleryHash}">在 SBTI 人格图鉴中查看</a>
      </div>
    </div>
  `;
    const galleryLink = btn.querySelector('.card-gallery-link');
    if (galleryLink) {
      galleryLink.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
    btn.addEventListener('click', () => {
      btn.classList.toggle('is-flipped');
    });
  } else {
    btn.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-front card-front--locked">
        <div class="card-corner top">
          <span class="rank">${rank}</span>
          <span class="suit">${symbol}</span>
        </div>
        <div class="card-role">${roleCn}</div>
        <div class="card-avatar card-avatar--locked" aria-hidden="true">
          <span class="card-lock-icon">\u{1F512}</span>
        </div>
        <div class="card-name card-name--locked">未解锁</div>
        <div class="card-code card-code--locked">???</div>
        <a class="card-unlock-cta" href="./index.html">去首页抽卡解锁</a>
        <div class="card-corner bottom">
          <span class="rank">${rank}</span>
          <span class="suit">${symbol}</span>
        </div>
        <span class="card-locked-badge">未解锁</span>
      </div>
      <div class="card-face card-back card-back--locked">
        <p class="back-locked-title">尚未解锁</p>
        <p class="back-locked-hint">在首页「换一个 SBKPI 搭子」抽到本牌后即可翻面。</p>
      </div>
    </div>
  `;
    const cta = btn.querySelector('.card-unlock-cta');
    if (cta) {
      cta.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  }
  return btn;
}

/** @param {HTMLElement[]} cards */
function applyFilters(cards) {
  const q = (els.search.value || '').trim().toLowerCase();
  const role = els.role.value;
  const suit = els.suit.value;
  let visible = 0;

  cards.forEach((cardEl) => {
    const byQuery = !q || (cardEl.dataset.search || '').includes(q);
    const byRole = !role || cardEl.dataset.role === role;
    const bySuit = !suit || cardEl.dataset.suit === suit;
    const show = byQuery && byRole && bySuit;
    cardEl.hidden = !show;
    if (show) visible += 1;
  });
  els.count.textContent = String(visible);
}

/** @param {Record<string, string>[]} rows */
function renderCards(rows) {
  const unlockedIds = getUnlockedCardIds();
  const fragment = document.createDocumentFragment();
  const cards = rows.map((row) => {
    const el = createCardEl(row, unlockedIds);
    fragment.appendChild(el);
    return el;
  });
  els.grid.replaceChildren(fragment);
  applyFilters(cards);
  const unlockEl = document.getElementById('unlockCount');
  if (unlockEl) unlockEl.textContent = String(unlockedIds.size);
  return cards;
}

/** @param {string} raw */
function decodeFocusParam(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * @param {HTMLElement[]} cards
 */
function applyPokerRoute(cards) {
  const hashRaw = location.hash.replace(/^#/, '');
  const qFocus = new URLSearchParams(location.search).get('focus');
  let target = null;
  if (hashRaw) {
    target = resolvePokerHashTarget(cards, hashRaw);
  }
  if (!target && qFocus) {
    target = resolvePokerHashTarget(cards, decodeFocusParam(qFocus));
  }
  if (!target) return;
  if (target.hidden) {
    els.search.value = '';
    els.role.value = '';
    els.suit.value = '';
    applyFilters(cards);
  }
  revealPokerTarget(target);
}

async function main() {
  const res = await fetch('./docs/persona-poker-deck.csv');
  const csv = await res.text();
  const allRows = parseCsv(csv);
  const totalEl = document.getElementById('unlockTotal');
  if (totalEl) totalEl.textContent = String(allRows.length);
  const currentCards = renderCards(sortByPersona(allRows));

  applyPokerRoute(currentCards);
  window.addEventListener('hashchange', () => applyPokerRoute(currentCards));

  els.search.addEventListener('input', () => applyFilters(currentCards));
  els.role.addEventListener('change', () => applyFilters(currentCards));
  els.suit.addEventListener('change', () => applyFilters(currentCards));
}

main();
