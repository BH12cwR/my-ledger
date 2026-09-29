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

/**
 * 紧邻 [from, to] 之前的等长区间，用于「环比」。
 * 起点对齐到 to 的前一天往前推，保证与本期天数完全一致
 * （2026-09-01~2026-09-30 → 2026-08-02~2026-08-31）。
 */
export function previousRange(fromDay: string, toDay: string): { from: string; to: string } {
  const length = countDaysInclusive(fromDay, toDay);
  const previousTo = shiftDay(fromDay, -1);
  return { from: shiftDay(previousTo, -(length - 1)), to: previousTo };
}

/** [from, to] 覆盖的自然月数量（含首尾），用于「平均每月」 */
export function countMonthsInclusive(fromDay: string, toDay: string): number {
  const [fromYear, fromMonth] = monthOf(fromDay).split("-").map(Number);
  const [toYear, toMonth] = monthOf(toDay).split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
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

// ---------------------------------------------------------------------------
// 账期：以「月份起始日」重新定义一个月
// ---------------------------------------------------------------------------

/** 月份起始日默认值：1 号，此时账期等价自然月 */
export const DEFAULT_MONTH_START_DAY = 1;

/** 起始日上限 28，保证每个月都存在该日（2 月也不会缺日） */
export const MAX_MONTH_START_DAY = 28;

/** 把任意输入规整为合法的月份起始日（1–28），非法值回落到默认值 */
export function normalizeMonthStartDay(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_MONTH_START_DAY) {
    return DEFAULT_MONTH_START_DAY;
  }
  return parsed;
}

/** YYYY-MM-DD → YYYY-MM */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** 月份加减：YYYY-MM 偏移 N 个月后仍是 YYYY-MM */
export function shiftMonth(month: string, deltaMonths: number): string {
  const [year, value] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, value - 1 + deltaMonths, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 某个 YYYY-MM 的天数 */
export function daysInMonth(month: string): number {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
}

/** 取某月第 day 天；超出当月天数时收敛到当月最后一天 */
function monthDay(month: string, day: number): string {
  const clamped = Math.min(day, daysInMonth(month));
  return `${month}-${String(clamped).padStart(2, "0")}`;
}

/**
 * 按「月份起始日」把账期解析为闭区间 [from, to]。
 * startDay = 1 时即自然月；startDay = 5 时 2026-09 表示 2026-09-05 ~ 2026-10-04。
 */
export function resolveMonthRange(
  month: string,
  startDay = DEFAULT_MONTH_START_DAY,
): { from: string; to: string } {
  const day = normalizeMonthStartDay(startDay);
  const from = monthDay(month, day);
  const next = monthDay(shiftMonth(month, 1), day);
  return { from, to: shiftDay(next, -1) };
}

/** 某一天归属的账期月份（YYYY-MM），与 resolveMonthRange 互为逆运算 */
export function periodMonthOf(day: string, startDay = DEFAULT_MONTH_START_DAY): string {
  const start = normalizeMonthStartDay(startDay);
  if (start === 1) return monthOf(day);
  return Number(day.slice(8, 10)) >= start ? monthOf(day) : shiftMonth(monthOf(day), -1);
}

/** 星期序号：0 = 周日 … 6 = 周六 */
export function weekdayOf(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
}

/** 相对日文案：今天 / 昨天 / 前天，其余返回 null */
export function relativeDayLabel(day: string, today = todayInBusinessTimezone()): string | null {
  if (day === today) return "今天";
  if (day === shiftDay(today, -1)) return "昨天";
  if (day === shiftDay(today, -2)) return "前天";
  return null;
}

// ---------------------------------------------------------------------------
// 日期范围预设：搜索页 / 自定义筛选页的「全部 / 本月 / 上月 / 今年 / 去年」等快捷项
// ---------------------------------------------------------------------------

/** 预设项；`data` 表示「用户全部数据的年份跨度」，`custom` 仅由 detect 返回 */
export type RangePreset =
  | "all"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "lastYear"
  | "data";

/** 预设与「手填区间」共用同一套解析，detectRangePreset 会在都不匹配时回落到它 */
export type DetectedRangePreset = RangePreset | "custom";

export interface RangePresetContext {
  today?: string;
  monthStartDay?: number;
  /** 用户最早 / 最晚一笔账的业务日，用于 `data` 预设 */
  dataFrom?: string | null;
  dataTo?: string | null;
}

/**
 * 把预设解析为闭区间；`全部` 返回的 from/to 均为 null，表示不加时间条件。
 *
 * 「本月 / 上月」走账期口径（受「月份起始日」影响），与账单页、统计页保持一致；
 * 「今年 / 去年」按自然年，「数据范围」用调用方给出的最早 / 最晚业务日。
 */
export function resolveRangePreset(
  preset: RangePreset,
  context: RangePresetContext = {},
): { from: string | null; to: string | null } {
  const today = context.today ?? todayInBusinessTimezone();
  const startDay = normalizeMonthStartDay(context.monthStartDay ?? DEFAULT_MONTH_START_DAY);
  const year = Number(today.slice(0, 4));

  switch (preset) {
    case "thisMonth":
      return resolveMonthRange(periodMonthOf(today, startDay), startDay);
    case "lastMonth":
      return resolveMonthRange(shiftMonth(periodMonthOf(today, startDay), -1), startDay);
    case "thisYear":
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case "lastYear":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case "data":
      return { from: context.dataFrom ?? null, to: context.dataTo ?? null };
    default:
      return { from: null, to: null };
  }
}

/** 从具体区间反查命中的预设，用于高亮筛选页当前选中的 chip */
export function detectRangePreset(
  from: string | null | undefined,
  to: string | null | undefined,
  context: RangePresetContext = {},
): DetectedRangePreset {
  const normalizedFrom = from ?? null;
  const normalizedTo = to ?? null;
  // 先判「全部」，否则 `data` 在无数据时也会解析成 (null, null) 而抢答
  if (!normalizedFrom && !normalizedTo) return "all";

  const candidates: RangePreset[] = ["thisMonth", "lastMonth", "thisYear", "lastYear", "data"];
  for (const preset of candidates) {
    const range = resolveRangePreset(preset, context);
    if (range.from === normalizedFrom && range.to === normalizedTo) return preset;
  }
  return "custom";
}