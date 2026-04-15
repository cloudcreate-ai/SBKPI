/**
 * SBKPI搭子图鉴：与首页抽卡共用的解锁状态（localStorage）
 */
export const SBKPI_UNLOCK_KEY = 'sbkpi_unlocked_cards';

/** @returns {Set<string>} 已解锁的 card_id */
export function getUnlockedCardIds() {
  try {
    const raw = localStorage.getItem(SBKPI_UNLOCK_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === 'string' && x.length > 0));
  } catch {
    return new Set();
  }
}

/** @param {Set<string>} ids */
export function setUnlockedCardIds(ids) {
  localStorage.setItem(SBKPI_UNLOCK_KEY, JSON.stringify([...ids]));
}

/**
 * 记录解锁一张牌（若已解锁则不变）
 * @param {string} cardId
 * @returns {{ isNew: boolean }}
 */
export function recordUnlock(cardId) {
  if (!cardId) return { isNew: false };
  const set = getUnlockedCardIds();
  if (set.has(cardId)) return { isNew: false };
  set.add(cardId);
  setUnlockedCardIds(set);
  return { isNew: true };
}
