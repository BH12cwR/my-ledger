import { formatCents } from "./money";

/** 展示层格式化：只做「给人看」的转换，不做任何金额运算 */

/** 金额：默认带 ¥ 符号并保留两位小数 */
export function money(cents: number | null | undefined, symbol = "¥"): string {
  if (cents === null || cents === undefined) return `${symbol}0.00`;
  const text = formatCents(cents);
  return cents < 0 ? `-${symbol}${text.slice(1)}` : `${symbol}${text}`;
}

/** 带正负号的金额，用于流水与趋势对比 */
export function signedMoney(cents: number, symbol = "¥"): string {
  if (cents === 0) return `${symbol}0.00`;
  return `${cents > 0 ? "+" : "-"}${symbol}${formatCents(Math.abs(cents))}`;
}

/** YYYY-MM-DD → M月D日 */
export function shortDay(day: string): string {
  const [, month, date] = day.split("-");
  if (!month || !date) return day;
  return `${Number(month)}月${Number(date)}日`;
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