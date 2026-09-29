import { weekdayOf } from "./dates";
import { formatCents } from "./money";

/** 展示层格式化：只做「给人看」的转换，不做任何金额运算 */

/** 金额：默认带 ¥ 符号并保留两位小数 */
export function money(cents: number | null | undefined, symbol = "¥"): string {
  if (cents === null || cents === undefined) return `${symbol}0.00`;
  const text = formatCents(cents);
  return cents < 0 ? `-${symbol}${text.slice(1)}` : `${symbol}${text}`;
}

/** YYYY-MM-DD → MM-DD，用于图表坐标轴 */
export function axisDay(day: string): string {
  const parts = day.split("-");
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : day;
}

/** YYYY-MM → YYYY年M月 */
export function monthLabel(month: string): string {
  const [year, value] = month.split("-");
  if (!year || !value) return month;
  return `${year}年${Number(value)}月`;
}

/** YYYY-MM-DD → MM.DD，用于账单页分组头（09.27） */
export function dayLabel(day: string): string {
  const parts = day.split("-");
  return parts.length === 3 ? `${parts[1]}.${parts[2]}` : day;
}

/** 星期文案，索引与 Date#getUTCDay 对齐（0 = 周日） */
export const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** YYYY-MM-DD → 周三 */
export function weekdayLabel(day: string): string {
  const index = weekdayOf(day);
  return WEEKDAY_NAMES[index] ?? "";
}

const DATE_TIME = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai",
});

/** 毫秒时间戳 → 2026/09/27 10:30 */
export function dateTime(ms: number | null | undefined): string {
  if (!ms) return "-";
  return DATE_TIME.format(new Date(ms));
}

const DAY = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Shanghai",
});

/** 毫秒时间戳 → 2026/09/27。不带时分，用于「自 X 起」这类区间描述 */
export function dateLabel(ms: number | null | undefined): string {
  if (!ms) return "-";
  return DAY.format(new Date(ms));
}

/** 相对时间，用于「最后活跃」这类弱信息 */
export function relativeTime(ms: number | null | undefined): string {
  if (!ms) return "从未";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return dateTime(ms);
}