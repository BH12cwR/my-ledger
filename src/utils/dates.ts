// ============================================
// 日期工具：业务时区固定 UTC+8
// ============================================

export const APP_TZ_OFFSET_MINUTES = 480;
const TZ_MS = APP_TZ_OFFSET_MINUTES * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 把真实时间戳转换为「东八区墙上时间」的 Date（用 UTC getter 读取） */
function toWallDate(ts: number): Date {
  return new Date(ts + TZ_MS);
}

/** 把「东八区墙上时间」的 UTC 时间戳还原为真实时间戳 */
function fromWallTs(wallTs: number): number {
  return wallTs - TZ_MS;
}

/** YYYY-MM-DD（UTC+8） */
export function dateKeyOf(ts: number): string {
  const d = toWallDate(ts);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** YYYY-MM（UTC+8） */
export function monthKeyOf(ts: number): string {
  return dateKeyOf(ts).slice(0, 7);
}

export function todayKey(): string {
  return dateKeyOf(Date.now());
}

export function currentMonthKey(): string {
  return monthKeyOf(Date.now());
}

/** YYYY-MM-DD（UTC+8）-> 当日 00:00 的真实时间戳 */
export function dateKeyToTs(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return fromWallTs(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

export function monthStartTs(monthKey: string): number {
  return dateKeyToTs(`${monthKey}-01`);
}

export function monthEndTs(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return fromWallTs(Date.UTC(nextY, nextM - 1, 1, 0, 0, 0, 0)) - 1;
}

/** 月份偏移：shiftMonth('2026-01', -1) => '2025-12' */
export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}`;
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${y}年${m}月`;
}

export function weekdayLabel(dateKey: string): string {
  const d = toWallDate(dateKeyToTs(dateKey));
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getUTCDay()];
}

export function dateLabelOf(dateKey: string, today = todayKey()): string {
  if (dateKey === today) return '今天';
  if (dateKey === dateKeyOf(Date.now() - DAY_MS)) return '昨天';
  const [, m, d] = dateKey.split('-').map(Number);
  return `${m}月${pad(d)}日`;
}

/** 近 n 天（含今天）的 dateKey 列表，升序 */
export function recentDateKeys(n: number): string[] {
  const now = Date.now();
  const list: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    list.push(dateKeyOf(now - i * DAY_MS));
  }
  return list;
}

/** 由 dateKey 与当前时间构造真实时间戳（保留当下的时分秒） */
export function tsFromDateKey(dateKey: string, base = Date.now()): number {
  const wall = toWallDate(base);
  return dateKeyToTs(dateKey) + (wall.getUTCHours() * 3600 + wall.getUTCMinutes() * 60 + wall.getUTCSeconds()) * 1000;
}
