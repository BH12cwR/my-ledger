/**
 * 时间处理：金额与时间在数据库中最长使用的两种原始类型。
 * 这里只提供按「自然日」聚合所需的字符串/时间戳互转，全部基于 UTC+8 业务时区。
 */

export const APP_TIMEZONE_OFFSET_MINUTES = 8 * 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 把毫秒时间戳转换为业务时区下的 YYYY-MM-DD */
export function toBusinessDay(timestamp: number, offsetMinutes = APP_TIMEZONE_OFFSET_MINUTES): string {
  const shifted = new Date(timestamp + offsetMinutes * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** 把业务时区下的 YYYY-MM-DD 转换为当日 00:00:00 的毫秒时间戳 */
export function fromBusinessDay(day: string, offsetMinutes = APP_TIMEZONE_OFFSET_MINUTES): number {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date) - offsetMinutes * 60 * 1000;
}

/** 校验 YYYY-MM-DD 字面量是否为真实存在的日期 */
export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [year, month, date] = day.split("-").map(Number);
  if (month < 1 || month > 12 || date < 1 || date > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, date));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === date;
}

/** 业务时区下「今天」的 YYYY-MM-DD */
export function todayInBusinessTimezone(now = Date.now()): string {
  return toBusinessDay(now);
}

/** 在 YYYY-MM-DD 上偏移若干天 */
export function shiftDay(day: string, deltaDays: number): string {
  const base = fromBusinessDay(day);
  return toBusinessDay(base + deltaDays * DAY_MS);
}

/** 计算包含起止两端的自然日数量 */
export function countDaysInclusive(fromDay: string, toDay: string): number {
  return Math.round((fromBusinessDay(toDay) - fromBusinessDay(fromDay)) / DAY_MS) + 1;
}

/** 校验并规整起止日期，默认返回最近 30 天 */
export function resolveDayRange(from?: string | null, to?: string | null): { from: string; to: string } {
  const today = todayInBusinessTimezone();
  const resolvedTo = to && isValidDay(to) ? to : today;
  const resolvedFrom = from && isValidDay(from) ? from : shiftDay(resolvedTo, -29);
  return resolvedFrom <= resolvedTo
    ? { from: resolvedFrom, to: resolvedTo }
    : { from: resolvedTo, to: resolvedFrom };
}

/** 预算周期：自然月 / 自然年 */
export type BudgetPeriod = "monthly" | "yearly";

/**
 * 预算周期在当前时刻的生效区间 [from, to]，右端固定为业务日「今天」。
 * monthly 从当月 1 号起，yearly 从当年 1 月 1 日起。
 */
export function resolveBudgetPeriodRange(
  period: BudgetPeriod,
  today = todayInBusinessTimezone(),
): { from: string; to: string } {
  const from = period === "yearly" ? `${today.slice(0, 4)}-01-01` : `${today.slice(0, 7)}-01`;
  return { from, to: today };
}