import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { createTestDb } from "../helpers/d1";
import { upsertWechatUser } from "@/server/services/users";
import { createAccount } from "@/server/services/accounts";
import { createCategory } from "@/server/services/categories";
import { createTag } from "@/server/services/tags";
import { createTransaction, deleteTransaction, listTransactions, refundTransaction } from "@/server/services/transactions";
import {
  getAccountBalances,
  getCategoryBreakdown,
  getCategoryDetail,
  getDailyTrend,
  getSummary,
} from "@/server/services/stats";

const NOW = Date.UTC(2026, 8, 27, 16, 30);

let db: Db;
let userId: string;
let bankAccountId: string;
let foodCategoryId: string;

async function makeCategory(name: string, kind: "expense" | "income") {
  return createCategory(db, userId, { name, kind, icon: "tag", color: "#64748b", sortOrder: 0 });
}

beforeEach(async () => {
  ({ db } = createTestDb());
  const user = await upsertWechatUser(
    db,
    { openid: "openid-a", unionid: null, nickname: "小王", avatarUrl: null },
    NOW,
  );
  userId = user.id;

  const bank = await createAccount(db, userId, {
    name: "银行卡",
    type: "bank",
    icon: "credit-card",
    initialBalance: "100.00",
    sortOrder: 0,
  });
  bankAccountId = bank.id;

  const food = await makeCategory("餐饮", "expense");
  foodCategoryId = food.id;
  const transport = await makeCategory("交通", "expense");
  const salary = await makeCategory("工资", "income");

  const add = (kind: "expense" | "income", amount: string, categoryId: string, happenedOn: string) =>
    createTransaction(
      db,
      userId,
      { kind, amount, categoryId, accountId: bankAccountId, happenedOn },
      NOW,
    );

  await add("expense", "20.00", food.id, "2026-09-01");
  await add("income", "100.00", salary.id, "2026-09-01");
  await add("expense", "15.00", transport.id, "2026-09-10");
  await add("expense", "5.00", food.id, "2026-09-15");
  await add("income", "3.00", salary.id, "2026-09-15");
});

describe("getSummary", () => {
  it("汇总收入/支出/净额/笔数与平均支出", async () => {
    const summary = await getSummary(db, userId, { from: "2026-09-01", to: "2026-09-15" });
    expect(summary.incomeCents).toBe(10300);
    expect(summary.expenseCents).toBe(4000);
    expect(summary.netCents).toBe(6300);
    expect(summary.transactionCount).toBe(5);
    expect(summary.expenseCount).toBe(3);
    // 平均支出只按支出笔数摊分（4000 / 3），不被收入笔数拉低
    expect(summary.averageExpenseCents).toBe(1333);
    // 日均支出按区间覆盖的自然日数摊分（4000 / 15 天）
    expect(summary.dailyAverageCents).toBe(267);
    // 区间内没有转账
    expect(summary.transferCents).toBe(0);
  });

  it("转账金额单独计入 transferCents，不进收支", async () => {
    const wallet = await createAccount(db, userId, {
      name: "钱包",
      type: "cash",
      icon: "wallet",
      initialBalance: "0.00",
      sortOrder: 1,
    });
    await createTransaction(
      db,
      userId,
      {
        kind: "transfer",
        amount: "50.00",
        accountId: bankAccountId,
        toAccountId: wallet.id,
        happenedOn: "2026-09-05",
      },
      NOW,
    );

    const summary = await getSummary(db, userId, { from: "2026-09-01", to: "2026-09-15" });
    expect(summary.transferCount).toBe(1);
    expect(summary.transferCents).toBe(5000);
    // 转账只是账户之间搬运资金，收支与笔数都不受影响
    expect(summary.incomeCents).toBe(10300);
    expect(summary.expenseCents).toBe(4000);
    expect(summary.transactionCount).toBe(5);
  });

  it("空区间返回全 0", async () => {
    const summary = await getSummary(db, userId, { from: "2026-01-01", to: "2026-01-31" });
    expect(summary.incomeCents).toBe(0);
    expect(summary.expenseCents).toBe(0);
    expect(summary.netCents).toBe(0);
    expect(summary.transactionCount).toBe(0);
    expect(summary.expenseCount).toBe(0);
    expect(summary.averageExpenseCents).toBe(0);
    // 分母为 0 时日均支出必须回落到 0，不能出现 NaN / Infinity
    expect(summary.dailyAverageCents).toBe(0);
  });

  it("软删除的账目不计入统计", async () => {
    const before = await getSummary(db, userId, { from: "2026-09-01", to: "2026-09-15" });
    expect(before.expenseCents).toBe(4000);

    const list = await listTransactions(db, userId, {
      page: 1,
      pageSize: 100,
      from: "2026-09-15",
      to: "2026-09-15",
      kind: "expense",
    });
    await deleteTransaction(db, userId, list.items[0].id, NOW);

    const after = await getSummary(db, userId, { from: "2026-09-01", to: "2026-09-15" });
    expect(after.expenseCents).toBe(3500);
    expect(after.transactionCount).toBe(4);
    expect(after.expenseCount).toBe(2);
  });
});

describe("getDailyTrend", () => {
  it("补齐区间内没有账目的日期且顺序递增", async () => {
    const { from, to, points } = await getDailyTrend(db, userId, {
      from: "2026-09-01",
      to: "2026-09-05",
    });

    expect(from).toBe("2026-09-01");
    expect(to).toBe("2026-09-05");
    expect(points.map((point) => point.day)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);

    expect(points[0]).toEqual({
      day: "2026-09-01",
      incomeCents: 10000,
      expenseCents: 2000,
      netCents: 8000,
    });
    expect(points[1]).toEqual({
      day: "2026-09-02",
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
    });
  });
});

describe("getCategoryBreakdown", () => {
  it("给出各分类金额、占比与合计", async () => {
    const result = await getCategoryBreakdown(db, userId, { from: "2026-09-01", to: "2026-09-15" });
    expect(result.kind).toBe("expense");
    expect(result.totalCents).toBe(4000);
    expect(result.items.map((item) => item.name)).toEqual(["餐饮", "交通"]);

    const food = result.items[0];
    const transport = result.items[1];
    expect(food.amountCents).toBe(2500);
    expect(food.transactionCount).toBe(2);
    expect(food.percentage).toBe(62.5);
    expect(transport.amountCents).toBe(1500);
    expect(transport.percentage).toBe(37.5);
    expect(food.percentage + transport.percentage).toBe(100);
  });

  it("占比存在舍入时合计仍约为 100", async () => {
    const solo = await upsertWechatUser(db, { openid: "openid-b", unionid: null, nickname: "b", avatarUrl: null }, NOW);
    for (const name of ["甲", "乙", "丙"]) {
      const category = await createCategory(db, solo.id, {
        name,
        kind: "expense",
        icon: "tag",
        color: "#64748b",
        sortOrder: 0,
      });
      await createTransaction(
        db,
        solo.id,
        { kind: "expense", amount: "10.00", categoryId: category.id, happenedOn: "2026-09-03" },
        NOW,
      );
    }

    const result = await getCategoryBreakdown(db, solo.id, { from: "2026-09-01", to: "2026-09-15" });
    expect(result.totalCents).toBe(3000);
    expect(result.items.map((item) => item.percentage)).toEqual([33.33, 33.33, 33.33]);
    const sum = result.items.reduce((acc, item) => acc + item.percentage, 0);
    expect(sum).toBeCloseTo(100, 1);
  });
});

describe("getAccountBalances", () => {
  it("余额 = 初始余额 + 收入 - 支出", async () => {
    const balances = await getAccountBalances(db, userId);
    const bank = balances.find((item) => item.id === bankAccountId);
    expect(bank).toBeDefined();
    expect(bank?.balanceCents).toBe(16300); // 10000 + 10300 - 4000
    expect(bank?.transactionCount).toBe(5);
  });
});

describe("环比（compare）", () => {
  it("summary 带出上一同长度周期，本期与上期区间相邻", async () => {
    const summary = await getSummary(
      db,
      userId,
      { from: "2026-09-01", to: "2026-09-15" },
      { compare: true },
    );
    expect(summary.previous).toEqual({
      from: "2026-08-17",
      to: "2026-08-31",
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
    });
  });

  it("未请求环比时 previous 为 null", async () => {
    const summary = await getSummary(db, userId, { from: "2026-09-01", to: "2026-09-15" });
    expect(summary.previous).toBeNull();
  });

  it("上期有数据时给出上期合计", async () => {
    await createTransaction(
      db,
      userId,
      { kind: "expense", amount: "10.00", categoryId: foodCategoryId, happenedOn: "2026-08-20" },
      NOW,
    );

    const summary = await getSummary(
      db,
      userId,
      { from: "2026-09-01", to: "2026-09-15" },
      { compare: true },
    );
    expect(summary.previous?.expenseCents).toBe(1000);
    expect(summary.previous?.netCents).toBe(-1000);
    // 上期账目不影响本期
    expect(summary.expenseCents).toBe(4000);
  });
});

describe("结构占比 · 全部口径与环比", () => {
  it("kind=all 合并收支计算占比", async () => {
    const result = await getCategoryBreakdown(db, userId, {
      from: "2026-09-01",
      to: "2026-09-15",
      kind: "all",
    });

    expect(result.kind).toBe("all");
    expect(result.totalCents).toBe(14300); // 支出 4000 + 收入 10300
    expect(result.items.map((item) => item.name)).toEqual(["工资", "餐饮", "交通"]);
  });

  it("compare 同时给出上期合计与各项金额", async () => {
    await createTransaction(
      db,
      userId,
      { kind: "expense", amount: "10.00", categoryId: foodCategoryId, happenedOn: "2026-08-20" },
      NOW,
    );

    const result = await getCategoryBreakdown(db, userId, {
      from: "2026-09-01",
      to: "2026-09-15",
      compare: true,
    });

    expect(result.previousTotalCents).toBe(1000);
    expect(result.items.find((item) => item.name === "餐饮")?.previousAmountCents).toBe(1000);
    // 上期没有该项时补 0，而不是 null（null 表示「没有环比数据」）
    expect(result.items.find((item) => item.name === "交通")?.previousAmountCents).toBe(0);
  });

  it("未请求环比时 previousAmountCents 为 null", async () => {
    const result = await getCategoryBreakdown(db, userId, {
      from: "2026-09-01",
      to: "2026-09-15",
    });
    expect(result.previousTotalCents).toBeNull();
    expect(result.items.every((item) => item.previousAmountCents === null)).toBe(true);
  });
});

describe("getCategoryDetail", () => {
  it("给出总额、笔数、平均每笔、平均每月与占比", async () => {
    const detail = await getCategoryDetail(db, userId, {
      categoryId: foodCategoryId,
      from: "2026-09-01",
      to: "2026-09-30",
    });

    expect(detail.totalCents).toBe(2500); // 20.00 + 5.00
    expect(detail.transactionCount).toBe(2);
    expect(detail.averagePerTransactionCents).toBe(1250);
    expect(detail.monthCount).toBe(1);
    expect(detail.averagePerMonthCents).toBe(2500);
    expect(detail.sharePercentage).toBe(62.5); // 2500 / 4000
    expect(detail.refundCents).toBe(0);
  });

  it("平均每月按区间覆盖的月数摊分", async () => {
    const detail = await getCategoryDetail(db, userId, {
      categoryId: foodCategoryId,
      from: "2026-09-01",
      to: "2026-10-31",
    });
    expect(detail.monthCount).toBe(2);
    expect(detail.averagePerMonthCents).toBe(1250); // 2500 / 2
  });

  it("按标签收窄时，指标与占比分母一起跟着变", async () => {
    const tag = await createTag(db, userId, { name: "出差", color: "#3b82f6" });
    await createTransaction(
      db,
      userId,
      {
        kind: "expense",
        amount: "30.00",
        categoryId: foodCategoryId,
        accountId: bankAccountId,
        happenedOn: "2026-09-20",
        tagIds: [tag.id],
      },
      NOW,
    );

    const all = await getCategoryDetail(db, userId, {
      categoryId: foodCategoryId,
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(all.totalCents).toBe(5500); // 20.00 + 5.00 + 30.00
    expect(all.transactionCount).toBe(3);

    const tagged = await getCategoryDetail(db, userId, {
      categoryId: foodCategoryId,
      from: "2026-09-01",
      to: "2026-09-30",
      tagId: tag.id,
    });
    expect(tagged.totalCents).toBe(3000);
    expect(tagged.transactionCount).toBe(1);
    // 分母也收窄到「同区间、同类型、同标签」：只有这一笔，占比 100%
    expect(tagged.sharePercentage).toBe(100);
  });

  it("退款合计只统计来源支出属于该分类的退款", async () => {
    const list = await listTransactions(db, userId, {
      page: 1,
      pageSize: 100,
      from: "2026-09-15",
      to: "2026-09-15",
      kind: "expense",
    });
    await refundTransaction(db, userId, list.items[0].id, NOW);

    const detail = await getCategoryDetail(db, userId, {
      categoryId: foodCategoryId,
      from: "2026-09-01",
      to: "2026-09-30",
    });

    expect(detail.refundCents).toBe(500);
    // 退款是收入记录，不会冲减该分类的支出金额
    expect(detail.totalCents).toBe(2500);
    expect(detail.transactionCount).toBe(2);
  });
});

describe("转账口径", () => {
  async function makeWallet() {
    return createAccount(db, userId, {
      name: "微信钱包",
      type: "wechat",
      icon: "wallet",
      initialBalance: "0.00",
      sortOrder: 1,
    });
  }

  it("转账对转出账户扣减、对转入账户增加，并各计一笔流水", async () => {
    const wallet = await makeWallet();
    await createTransaction(
      db,
      userId,
      { kind: "transfer", amount: "30.00", accountId: bankAccountId, toAccountId: wallet.id, happenedOn: "2026-09-12" },
      NOW,
    );

    const balances = await getAccountBalances(db, userId);
    const bank = balances.find((item) => item.id === bankAccountId);
    const target = balances.find((item) => item.id === wallet.id);

    expect(bank?.balanceCents).toBe(13300); // 16300 - 3000
    expect(bank?.transactionCount).toBe(6);
    expect(target?.balanceCents).toBe(3000);
    expect(target?.transactionCount).toBe(1);
  });

  it("转账不计入收支，但单独计入 transferCount", async () => {
    const wallet = await makeWallet();
    await createTransaction(
      db,
      userId,
      { kind: "transfer", amount: "30.00", accountId: bankAccountId, toAccountId: wallet.id, happenedOn: "2026-09-12" },
      NOW,
    );

    const summary = await getSummary(db, userId, { from: "2026-09-01", to: "2026-09-30" });
    expect(summary.incomeCents).toBe(10300);
    expect(summary.expenseCents).toBe(4000);
    expect(summary.transactionCount).toBe(5); // 不含转账
    expect(summary.transferCount).toBe(1);
  });

  it("无转账时 transferCount 为 0", async () => {
    const summary = await getSummary(db, userId, { from: "2026-09-01", to: "2026-09-15" });
    expect(summary.transferCount).toBe(0);
    expect(summary.transactionCount).toBe(5);
  });
});