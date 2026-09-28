import { describe, expect, it } from "vitest";
import {
  AmountError,
  MAX_AMOUNT_CENTS,
  centsToInputValue,
  formatCents,
  parseAmountToCents,
} from "@/lib/money";
import { money } from "@/lib/format";

describe("parseAmountToCents", () => {
  it("把两位以内的十进制字符串换算为分", () => {
    expect(parseAmountToCents("0.1")).toBe(10);
    expect(parseAmountToCents("12.34")).toBe(1234);
    expect(parseAmountToCents("1.2")).toBe(120);
    expect(parseAmountToCents("0.01")).toBe(1);
    expect(parseAmountToCents("100")).toBe(10000);
  });

  it("容忍千分位分隔符", () => {
    expect(parseAmountToCents("1,234.56")).toBe(123456);
    expect(parseAmountToCents("1,000,000")).toBe(100000000);
  });

  it("接受 number 类型入参", () => {
    expect(parseAmountToCents(12.34)).toBe(1234);
    expect(parseAmountToCents(0.1)).toBe(10);
  });

  it("拒绝超过两位小数", () => {
    expect(() => parseAmountToCents("1.234")).toThrow(AmountError);
    expect(() => parseAmountToCents("0.001")).toThrow(AmountError);
  });

  it("拒绝负数、零与非数字输入", () => {
    expect(() => parseAmountToCents("-1")).toThrow(AmountError);
    expect(() => parseAmountToCents("0")).toThrow(AmountError);
    expect(() => parseAmountToCents("0.00")).toThrow(AmountError);
    expect(() => parseAmountToCents("abc")).toThrow(AmountError);
    expect(() => parseAmountToCents("")).toThrow(AmountError);
  });

  it("allowZero 时接受 0（账户初始余额场景）", () => {
    expect(parseAmountToCents("0", { allowZero: true })).toBe(0);
    expect(parseAmountToCents("0.00", { allowZero: true })).toBe(0);
    expect(parseAmountToCents(0, { allowZero: true })).toBe(0);
  });

  it("allowZero 不影响其他校验", () => {
    expect(() => parseAmountToCents("-1", { allowZero: true })).toThrow(AmountError);
    expect(() => parseAmountToCents("abc", { allowZero: true })).toThrow(AmountError);
    expect(() => parseAmountToCents("", { allowZero: true })).toThrow(AmountError);
    expect(() => parseAmountToCents("1.234", { allowZero: true })).toThrow(AmountError);
  });

  it("拒绝科学计数法", () => {
    expect(() => parseAmountToCents("1e3")).toThrow(AmountError);
    // 浮点数会被 String() 展开为科学计数法，同样被拒绝
    expect(() => parseAmountToCents(1e21)).toThrow(AmountError);
  });

  it("拒绝超出上限的金额", () => {
    // 上限恰好命中时允许
    expect(parseAmountToCents("9999999999.99")).toBe(MAX_AMOUNT_CENTS);
    expect(() => parseAmountToCents("10000000000")).toThrow(AmountError);
  });
});

describe("formatCents", () => {
  it("保留两位小数并添加千分位", () => {
    expect(formatCents(123456)).toBe("1,234.56");
    expect(formatCents(1234)).toBe("12.34");
    expect(formatCents(5)).toBe("0.05");
    expect(formatCents(0)).toBe("0.00");
  });

  it("正确处理负数", () => {
    expect(formatCents(-123456)).toBe("-1,234.56");
    expect(formatCents(-5)).toBe("-0.05");
  });
});

describe("money", () => {
  it("带货币符号输出", () => {
    expect(money(123456)).toBe("¥1,234.56");
    expect(money(0)).toBe("¥0.00");
  });

  it("负数把符号放在货币符号之前", () => {
    expect(money(-123456)).toBe("-¥1,234.56");
    expect(money(-5)).toBe("-¥0.05");
  });

  it("支持自定义货币符号", () => {
    expect(money(100, "$")).toBe("$1.00");
  });

  it("null 与 undefined 回退为零值而不是崩溃", () => {
    expect(money(null)).toBe("¥0.00");
    expect(money(undefined)).toBe("¥0.00");
    expect(money(null, "$")).toBe("$0.00");
  });
});

describe("centsToInputValue", () => {
  it("输出无千分位的十进制，便于回填输入框", () => {
    expect(centsToInputValue(1234)).toBe("12.34");
    expect(centsToInputValue(0)).toBe("0.00");
    expect(centsToInputValue(123456)).toBe("1234.56");
    expect(centsToInputValue(-123456)).toBe("-1234.56");
  });
});