import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { createTestDb } from "../helpers/d1";
import { upsertWechatUser } from "@/server/services/users";
import { createAccount } from "@/server/services/accounts";
import { createCategory } from "@/server/services/categories";
import { createTransaction, deleteTransaction, listTransactions } from "@/server/services/transactions";
import {
  createBudget,
  deleteBudget,
  getBudgetOverview,
  listBudgets,
  updateBudget,
} from "@/server/services/budgets";

const NOW = Date.UTC(2026, 8, 27, 16, 30);
/** 固定「今天」，让月/年周期的区间可预期 */
const TODAY = "2026-09-15";

let db: Db;
let userId: string;
let bankAccountId: string;
let foodId: string;
let transportId: string;

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

  foodId = (await makeCategory("餐饮", "expense")).id;
  transportId = (await makeCategory("交通", "expense")).id;

  // 本月支出：餐饮 25.00 + 交通 15.00 = 40.00；另有 1 月的一笔餐饮 10.00 只计入年预算
  const add = (amount: string, categoryId: string, happenedOn: string) =>
    createTransaction(
      db,
      userId,
      { kind: "expense", amount, categoryId, accountId: bankAccountId, happenedOn },
      NOW,
    );
  await add("20.00", foodId, "2026-09-01");
  await add("5.00", foodId, "2026-09-10");
  await add("15.00", transportId, "2026-09-12");
  await add("10.00", foodId, "2026-01-20");
});

describe("createBudget", () => {
  it("创建分类预算并回带分类展示字段", async () => {
    const budget = await createBudget(
      db,
      userId,
      { categoryId: foodId, period: "monthly", amount: "500.00" },
      NOW,
    );
    expect(budget.category_id).toBe(foodId);
    expect(budget.category_name).toBe("餐饮");
    expect(budget.period).toBe("monthly");
    expect(budget.amount_cents).toBe(50000);
  });

  it("省略分类即「总预算」", async () => {
    const budget = await createBudget(db, userId, { period: "monthly", amount: "1000.00" }, NOW);
    expect(budget.category_id).toBeNull();
    expect(budget.category_name).toBeNull();
  });

  it("同一周期同一范围不允许重复", async () => {
    await createBudget(db, userId, { period: "monthly", amount: "1000.00" }, NOW);
    await expect(
      createBudget(db, userId, { period: "monthly", amount: "2000.00" }, NOW),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("总预算与分类预算互不冲突，月与年也互不冲突", async () => {
    await createBudget(db, userId, { period: "monthly", amount: "1000.00" }, NOW);
    await createBudget(db, userId, { period: "monthly", categoryId: foodId, amount: "500.00" }, NOW);
    await createBudget(db, userId, { period: "yearly", amount: "12000.00" }, NOW);
    expect(await listBudgets(db, userId)).toHaveLength(3);
  });

  it("拒绝为收入分类设置预算", async () => {
    const salary = await makeCategory("工资", "income");
    await expect(
      createBudget(db, userId, { categoryId: salary.id, period: "monthly", amount: "1.00" }, NOW),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("getBudgetOverview", () => {
  it("按月聚合已用金额并给出剩余与百分比", async () => {
    await createBudget(db, userId, { categoryId: foodId, period: "monthly", amount: "100.00" }, NOW);
    await createBudget(db, userId, { period: "monthly", amount: "200.00" }, NOW);

    const [total, food] = await getBudgetOverview(db, userId, TODAY);
    // 总预算优先排序，其次按月/年、创建时间
    expect(total.categoryId).toBeNull();
    expect(total.periodStart).toBe("2026-09-01");
    expect(total.periodEnd).toBe(TODAY);
    expect(total.spentCents).toBe(4000);
    expect(total.remainingCents).toBe(16000);
    expect(total.percentage).toBe(20);

    expect(food.categoryId).toBe(foodId);
    expect(food.spentCents).toBe(2500);
    expect(food.remainingCents).toBe(7500);
    expect(food.percentage).toBe(25);
  });

  it("年周期累计全年支出", async () => {
    await createBudget(db, userId, { categoryId: foodId, period: "yearly", amount: "1000.00" }, NOW);
    const [food] = await getBudgetOverview(db, userId, TODAY);
    expect(food.periodStart).toBe("2026-01-01");
    expect(food.periodEnd).toBe(TODAY);
    // 9 月的 25.00 + 1 月的 10.00
    expect(food.spentCents).toBe(3500);
  });

  it("超支时剩余为负且百分比大于 100", async () => {
    await createBudget(db, userId, { period: "monthly", amount: "10.00" }, NOW);
    const [total] = await getBudgetOverview(db, userId, TODAY);
    expect(total.spentCents).toBe(4000);
    expect(total.remainingCents).toBe(-3000);
    expect(total.percentage).toBe(400);
  });

  it("软删除的账目不计入已用金额", async () => {
    await createBudget(db, userId, { period: "monthly", amount: "200.00" }, NOW);
    const list = await listTransactions(db, userId, {
      page: 1,
      pageSize: 100,
      from: "2026-09-10",
      to: "2026-09-10",
      kind: "expense",
    });
    await deleteTransaction(db, userId, list.items[0].id, NOW);

    const [total] = await getBudgetOverview(db, userId, TODAY);
    expect(total.spentCents).toBe(3500);
  });

  it("没有预算时返回空数组", async () => {
    expect(await getBudgetOverview(db, userId, TODAY)).toEqual([]);
  });
});

describe("updateBudget", () => {
  it("只调整额度，范围保持不变", async () => {
    const budget = await createBudget(
      db,
      userId,
      { categoryId: foodId, period: "monthly", amount: "100.00" },
      NOW,
    );
    const updated = await updateBudget(db, userId, budget.id, { amount: "300.00" }, NOW + 1);
    expect(updated.amount_cents).toBe(30000);
    expect(updated.category_id).toBe(foodId);
    expect(updated.period).toBe("monthly");
    expect(updated.updated_at).toBe(NOW + 1);
  });

  it("他人的预算不可见", async () => {
    const other = await upsertWechatUser(
      db,
      { openid: "openid-b", unionid: null, nickname: "b", avatarUrl: null },
      NOW,
    );
    const budget = await createBudget(db, userId, { period: "monthly", amount: "100.00" }, NOW);
    await expect(
      updateBudget(db, other.id, budget.id, { amount: "200.00" }, NOW),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("deleteBudget", () => {
  it("物理删除后不可再查", async () => {
    const budget = await createBudget(db, userId, { period: "monthly", amount: "100.00" }, NOW);
    await deleteBudget(db, userId, budget.id);
    expect(await listBudgets(db, userId)).toHaveLength(0);
    await expect(deleteBudget(db, userId, budget.id)).rejects.toMatchObject({ status: 404 });
  });

  it("删除后可重建相同范围", async () => {
    const budget = await createBudget(db, userId, { period: "monthly", amount: "100.00" }, NOW);
    await deleteBudget(db, userId, budget.id);
    const rebuilt = await createBudget(db, userId, { period: "monthly", amount: "150.00" }, NOW);
    expect(rebuilt.amount_cents).toBe(15000);
  });
});
