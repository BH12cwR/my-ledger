import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { createTestDb } from "../helpers/d1";
import { upsertWechatUser } from "@/server/services/users";
import { createAccount } from "@/server/services/accounts";
import { createCategory } from "@/server/services/categories";
import { createTransaction, deleteTransaction, listTransactions } from "@/server/services/transactions";
import {
  getAccountBalances,
  getCategoryBreakdown,
  getDailyTrend,
  getSummary,
} from "@/server/services/stats";

const NOW = Date.UTC(2026, 8, 27, 16, 30);

let db: Db;
let userId: string;
let bankAccountId: string;

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
  });

  it("空区间返回全 0", async () => {
    const summary = await getSummary(db, userId, { from: "2026-01-01", to: "2026-01-31" });
    expect(summary.incomeCents).toBe(0);
    expect(summary.expenseCents).toBe(0);
    expect(summary.netCents).toBe(0);
    expect(summary.transactionCount).toBe(0);
    expect(summary.expenseCount).toBe(0);
    expect(summary.averageExpenseCents).toBe(0);
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