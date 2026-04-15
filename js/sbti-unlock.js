/**
 * SBKPI搭子图鉴：与首页抽卡共用的解锁状态（localStorage）
 */
export const SBKPI_UNLOCK_KEY = 'sbkpi_unlocked_cards';
/** 首页抽卡上次记录（与解锁独立，一并清除） */
export const SBKPI_LAST_DRAW_KEY = 'sbkpi_last_draw_card_id';

/** 清除首页搭子解锁与抽卡相关 localStorage（不影响 SBTI 测验数据） */
export function clearSbkpiHomeLocalData() {
  localStorage.removeItem(SBKPI_UNLOCK_KEY);
  localStorage.removeItem(SBKPI_LAST_DRAW_KEY);
}

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
