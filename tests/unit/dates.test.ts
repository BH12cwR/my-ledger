import { describe, expect, it } from "vitest";
import {
  countDaysInclusive,
  countMonthsInclusive,
  fromBusinessDay,
  isValidDay,
  previousRange,
  resolveBudgetPeriodRange,
  resolveDayRange,
  shiftDay,
  toBusinessDay,
  todayInBusinessTimezone,
} from "@/lib/dates";

const DAY_MS = 24 * 60 * 60 * 1000;
const OFFSET_MS = 8 * 60 * 60 * 1000;

describe("toBusinessDay / fromBusinessDay", () => {
  it("UTC+8 边界：16:30Z 已属于次日业务日", () => {
    // 2026-09-27T16:30Z = 2026-09-28 00:30 (+08:00)
    expect(toBusinessDay(Date.UTC(2026, 8, 27, 16, 30))).toBe("2026-09-28");
    // 15:59Z 仍是当日
    expect(toBusinessDay(Date.UTC(2026, 8, 27, 15, 59))).toBe("2026-09-27");
  });

  it("fromBusinessDay 返回业务时区当日 00:00 的时间戳", () => {
    expect(fromBusinessDay("2026-09-28")).toBe(Date.UTC(2026, 8, 28) - OFFSET_MS);
    expect(fromBusinessDay("2026-09-28")).toBe(Date.UTC(2026, 8, 27, 16)); // 等价写法
  });

  it("互转可往返", () => {
    const ts = fromBusinessDay("2026-03-01");
    expect(toBusinessDay(ts)).toBe("2026-03-01");
    expect(toBusinessDay(ts + DAY_MS - 1)).toBe("2026-03-01");
  });
});

describe("isValidDay", () => {
  it("接受真实存在的日期", () => {
    expect(isValidDay("2026-09-27")).toBe(true);
    expect(isValidDay("2024-02-29")).toBe(true);
  });

  it("拒绝不存在的日期", () => {
    expect(isValidDay("2026-02-30")).toBe(false);
    expect(isValidDay("2025-02-29")).toBe(false);
    expect(isValidDay("2026-04-31")).toBe(false);
    expect(isValidDay("2026-13-01")).toBe(false);
    expect(isValidDay("2026-00-10")).toBe(false);
  });

  it("拒绝格式不规范的输入", () => {
    expect(isValidDay("2026-9-1")).toBe(false);
    expect(isValidDay("2026/09/01")).toBe(false);
    expect(isValidDay("20260901")).toBe(false);
    expect(isValidDay("")).toBe(false);
  });
});

describe("shiftDay", () => {
  it("跨月、跨年偏移", () => {
    expect(shiftDay("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftDay("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2026-02-28", 1)).toBe("2026-03-01"); // 2026 非闰年
    expect(shiftDay("2024-02-28", 1)).toBe("2024-02-29"); // 2024 闰年
  });
});

describe("countDaysInclusive", () => {
  it("包含首尾两端", () => {
    expect(countDaysInclusive("2026-09-01", "2026-09-30")).toBe(30);
    expect(countDaysInclusive("2026-09-27", "2026-09-27")).toBe(1);
    expect(countDaysInclusive("2026-08-31", "2026-09-01")).toBe(2);
  });
});

describe("previousRange", () => {
  it("取紧邻的等长区间", () => {
    expect(previousRange("2026-09-01", "2026-09-30")).toEqual({
      from: "2026-08-02",
      to: "2026-08-31",
    });
    expect(previousRange("2026-09-27", "2026-09-27")).toEqual({
      from: "2026-09-26",
      to: "2026-09-26",
    });
  });

  it("跨年时仍保持天数一致", () => {
    const range = previousRange("2026-01-01", "2026-01-31");
    expect(range).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(countDaysInclusive(range.from, range.to)).toBe(31);
  });

  it("整年区间落到上一年", () => {
    const range = previousRange("2026-01-01", "2026-12-31");
    expect(countDaysInclusive(range.from, range.to)).toBe(365);
    expect(range.to).toBe("2025-12-31");
  });
});

describe("countMonthsInclusive", () => {
  it("包含首尾月份", () => {
    expect(countMonthsInclusive("2026-09-05", "2026-09-20")).toBe(1);
    expect(countMonthsInclusive("2026-09-05", "2026-10-04")).toBe(2);
    expect(countMonthsInclusive("2026-01-01", "2026-12-31")).toBe(12);
    expect(countMonthsInclusive("2025-11-01", "2026-02-28")).toBe(4);
  });
});

describe("resolveDayRange", () => {
  it("默认返回最近 30 天", () => {
    const today = todayInBusinessTimezone();
    const range = resolveDayRange();
    expect(range.to).toBe(today);
    expect(range.from).toBe(shiftDay(today, -29));
    expect(countDaysInclusive(range.from, range.to)).toBe(30);
  });

  it("from 晚于 to 时自动交换", () => {
    expect(resolveDayRange("2026-09-27", "2026-09-01")).toEqual({
      from: "2026-09-01",
      to: "2026-09-27",
    });
  });

  it("非法日期回退为默认值", () => {
    // to 非法 -> 今天；from 非法 -> to 前推 29 天
    const today = todayInBusinessTimezone();
    expect(resolveDayRange("abc", "2026-09-01")).toEqual({
      from: shiftDay("2026-09-01", -29),
      to: "2026-09-01",
    });
    expect(resolveDayRange(undefined, "2026-02-30")).toEqual({
      from: shiftDay(today, -29),
      to: today,
    });
  });
});

describe("resolveBudgetPeriodRange", () => {
  it("月周期从当月 1 日起算，截至今天", () => {
    expect(resolveBudgetPeriodRange("monthly", "2026-09-15")).toEqual({
      from: "2026-09-01",
      to: "2026-09-15",
    });
  });

  it("年周期从当年 1 月 1 日起算，截至今天", () => {
    expect(resolveBudgetPeriodRange("yearly", "2026-09-15")).toEqual({
      from: "2026-01-01",
      to: "2026-09-15",
    });
  });

  it("默认使用业务时区的今天", () => {
    const today = todayInBusinessTimezone();
    expect(resolveBudgetPeriodRange("monthly").to).toBe(today);
  });
});