/**
 * 金额换算：始终以「分」为单位在数据库与接口层流转，避免浮点误差。
 */
export const MAX_AMOUNT_CENTS = 999_999_999_999; // 约 100 亿元

export class AmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmountError";
  }
}

export interface ParseAmountOptions {
  /**
   * 是否允许 0。默认拒绝，保持「金额必须大于 0」的约束不变。
   * 账户初始余额可以为 0，因此这类场景需要显式打开。
   */
  allowZero?: boolean;
}

/**
 * 把用户输入（字符串或数字）解析为「分」。
 * 只接受最多两位小数的十进制表示，刻意拒绝科学计数法与浮点数四舍五入。
 */
export function parseAmountToCents(input: string | number, options: ParseAmountOptions = {}): number {
  const raw =
    typeof input === "number"
      ? Number.isFinite(input)
        ? String(input)
        : ""
      : String(input).trim().replace(/,/g, "");

  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new AmountError("金额格式不正确，请输入不超过两位小数的正数");
  }

  const [intPart, fracPart = ""] = raw.split(".");
  const fraction = (fracPart + "00").slice(0, 2);
  const cents = Number(intPart) * 100 + Number(fraction);

  if (!Number.isSafeInteger(cents)) {
    throw new AmountError("金额超出可处理范围");
  }
  if (cents === 0 && !options.allowZero) {
    throw new AmountError("金额必须大于 0");
  }
  if (cents > MAX_AMOUNT_CENTS) {
    throw new AmountError("金额超出上限");
  }
  return cents;
}

/** 把「分」格式化为带千分位的十进制字符串，例如 -123456 → "-1,234.56" */
export function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const integer = Math.floor(abs / 100);
  const fraction = abs % 100;
  const intText = integer.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${intText}.${String(fraction).padStart(2, "0")}`;
}

/** 带货币符号的展示，例如 ¥1,234.56 */
export function formatMoney(cents: number, symbol = "¥"): string {
  const text = formatCents(cents);
  return cents < 0 ? `-${symbol}${text.slice(1)}` : `${symbol}${text}`;
}

/** 用于输入框回填：1234 分 → "12.34" */
export function centsToInputValue(cents: number): string {
  return formatCents(cents).replace(/,/g, "");
}