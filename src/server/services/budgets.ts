import type { BudgetPeriod, BudgetRecord, Db } from "../db/types";
import { resolveBudgetPeriodRange, todayInBusinessTimezone } from "@/lib/dates";
import { ApiError } from "../http/errors";
import { allRows, nowMs, toCents } from "./common";
import { assertCategoryAccessible } from "./categories";
import type { CreateBudgetInput, UpdateBudgetInput } from "../validation/schemas";

/**
 * 预算服务。
 *
 * 一条预算即「每个自然月 / 自然年」循环生效的限额，不按周期存多行；
 * 当前周期的已用金额在查询时根据 transactions 实时聚合，因此
 * 本模块刻意不依赖 stats 服务，避免 stats → budgets 的反向引用形成循环依赖。
 */

/** 预算记录 + 关联分类的展示字段（总预算的分类字段为 NULL） */
export interface BudgetWithCategory extends BudgetRecord {
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
}

/** 对外视图：预算配置 + 当前周期实时用量 */
export interface BudgetView {
  id: string;
  /** null 表示总预算 */
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  period: BudgetPeriod;
  amountCents: number;
  /** 当前周期生效区间的起止业务日（右端为「今天」） */
  periodStart: string;
  periodEnd: string;
  spentCents: number;
  /** 剩余额度，超支时为负 */
  remainingCents: number;
  /** 已用百分比，超支可大于 100 */
  percentage: number;
}

/** 新增 / 编辑后的即时返回：只含配置，用量由列表接口给出 */
export interface BudgetConfigDto {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  period: BudgetPeriod;
  amountCents: number;
}

export function budgetConfigDto(budget: BudgetWithCategory): BudgetConfigDto {
  return {
    id: budget.id,
    categoryId: budget.category_id,
    categoryName: budget.category_name,
    categoryIcon: budget.category_icon,
    categoryColor: budget.category_color,
    period: budget.period,
    amountCents: budget.amount_cents,
  };
}

const BUDGET_SELECT = `SELECT b.*,
                              c.name  AS category_name,
                              c.icon  AS category_icon,
                              c.color AS category_color
                         FROM budgets b
                         LEFT JOIN categories c ON c.id = b.category_id`;

export async function listBudgets(db: Db, userId: string): Promise<BudgetWithCategory[]> {
  return allRows<BudgetWithCategory>(
    db
      .prepare(
        `${BUDGET_SELECT}
          WHERE b.user_id = ?
          ORDER BY (b.category_id IS NULL) DESC, b.period ASC, b.created_at ASC`,
      )
      .bind(userId),
  );
}

export async function getBudget(
  db: Db,
  userId: string,
  budgetId: string,
): Promise<BudgetWithCategory | null> {
  return db
    .prepare(`${BUDGET_SELECT} WHERE b.id = ? AND b.user_id = ?`)
    .bind(budgetId, userId)
    .first<BudgetWithCategory>();
}

async function getOwnBudget(db: Db, userId: string, budgetId: string): Promise<BudgetWithCategory> {
  const budget = await getBudget(db, userId, budgetId);
  if (!budget) throw ApiError.notFound("预算不存在");
  return budget;
}

export async function createBudget(
  db: Db,
  userId: string,
  input: CreateBudgetInput,
  now = nowMs(),
): Promise<BudgetWithCategory> {
  const amountCents = toCents(input.amount);
  const categoryId = input.categoryId ?? null;

  if (categoryId) {
    const category = await assertCategoryAccessible(db, userId, categoryId);
    if (category.kind !== "expense") throw ApiError.badRequest("只能为支出分类设置预算");
  }

  const duplicated = await db
    .prepare(
      `SELECT id FROM budgets
        WHERE user_id = ? AND period = ? AND COALESCE(category_id, '') = COALESCE(?, '')`,
    )
    .bind(userId, input.period, categoryId)
    .first<{ id: string }>();
  if (duplicated) throw ApiError.conflict("该周期下已存在相同范围的预算");

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO budgets (id, user_id, category_id, period, amount_cents, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, userId, categoryId, input.period, amountCents, now, now)
    .run();

  const created = await getBudget(db, userId, id);
  if (!created) throw ApiError.internal("创建预算失败");
  return created;
}

/** 编辑预算只调整限额；改变范围（周期 / 分类）请删除后重建 */
export async function updateBudget(
  db: Db,
  userId: string,
  budgetId: string,
  input: UpdateBudgetInput,
  now = nowMs(),
): Promise<BudgetWithCategory> {
  await getOwnBudget(db, userId, budgetId);
  const amountCents = toCents(input.amount);

  await db
    .prepare(`UPDATE budgets SET amount_cents = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
    .bind(amountCents, now, budgetId, userId)
    .run();

  const updated = await getBudget(db, userId, budgetId);
  if (!updated) throw ApiError.internal("更新预算失败");
  return updated;
}

export async function deleteBudget(db: Db, userId: string, budgetId: string): Promise<void> {
  const result = await db
    .prepare(`DELETE FROM budgets WHERE id = ? AND user_id = ?`)
    .bind(budgetId, userId)
    .run();
  if ((result.meta?.changes ?? 0) === 0) throw ApiError.notFound("预算不存在");
}

/**
 * 按分类聚合区间内的支出（分）。
 * Map 的 key 为 category_id；额外以 null 为键写入全部支出合计，供总预算使用。
 */
async function spentByCategory(
  db: Db,
  userId: string,
  from: string,
  to: string,
): Promise<Map<string | null, number>> {
  const rows = await allRows<{ category_id: string | null; amount_cents: number }>(
    db
      .prepare(
        `SELECT category_id, COALESCE(SUM(amount_cents), 0) AS amount_cents
           FROM transactions
          WHERE user_id = ? AND deleted_at IS NULL AND kind = 'expense'
            AND happened_on BETWEEN ? AND ?
          GROUP BY category_id`,
      )
      .bind(userId, from, to),
  );

  const map = new Map<string | null, number>();
  let total = 0;
  for (const row of rows) {
    map.set(row.category_id, row.amount_cents);
    total += row.amount_cents;
  }
  // 覆盖 null 键为合计：未分类支出也计入总预算
  map.set(null, total);
  return map;
}

/** 组装预算视图：每个周期只做一次聚合查询，再按预算逐条匹配 */
export async function getBudgetOverview(
  db: Db,
  userId: string,
  today = todayInBusinessTimezone(),
): Promise<BudgetView[]> {
  const budgets = await listBudgets(db, userId);
  if (budgets.length === 0) return [];

  const periods = [...new Set(budgets.map((budget) => budget.period))];
  const spendByPeriod = new Map<BudgetPeriod, Map<string | null, number>>();
  await Promise.all(
    periods.map(async (period) => {
      const { from, to } = resolveBudgetPeriodRange(period, today);
      spendByPeriod.set(period, await spentByCategory(db, userId, from, to));
    }),
  );

  return budgets.map((budget) => {
    const { from, to } = resolveBudgetPeriodRange(budget.period, today);
    const spentCents = spendByPeriod.get(budget.period)?.get(budget.category_id) ?? 0;
    return {
      id: budget.id,
      categoryId: budget.category_id,
      categoryName: budget.category_name,
      categoryIcon: budget.category_icon,
      categoryColor: budget.category_color,
      period: budget.period,
      amountCents: budget.amount_cents,
      periodStart: from,
      periodEnd: to,
      spentCents,
      remainingCents: budget.amount_cents - spentCents,
      percentage: budget.amount_cents > 0 ? Math.round((spentCents / budget.amount_cents) * 10000) / 100 : 0,
    };
  });
}
