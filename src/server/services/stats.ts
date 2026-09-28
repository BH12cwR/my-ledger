import type { Db } from "../db/types";
import { resolveDayRange, shiftDay, todayInBusinessTimezone } from "@/lib/dates";
import { allRows, shareOfTotal } from "./common";
import { getBudgetOverview } from "./budgets";

/**
 * 统计服务。
 *
 * 所有聚合都在 SQL 中按「分」求和，不把明细拉到内存里再算，
 * 既保证精度也避免大数据量下的函数内存与执行时间开销。
 */

export interface SummaryResult {
  from: string;
  to: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  transactionCount: number;
  /** 区间内的支出笔数。平均支出以此为分母，与 transactionCount（含收入）区分开 */
  expenseCount: number;
  averageExpenseCents: number;
}

export interface TrendPoint {
  day: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

export interface CategoryBreakdownItem {
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  amountCents: number;
  transactionCount: number;
  percentage: number;
}

export interface AccountBalanceItem {
  id: string;
  name: string;
  type: string;
  icon: string;
  balanceCents: number;
  transactionCount: number;
}

export async function getSummary(
  db: Db,
  userId: string,
  range: { from?: string; to?: string } = {},
): Promise<SummaryResult> {
  const { from, to } = resolveDayRange(range.from, range.to);

  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'income'  THEN amount_cents ELSE 0 END), 0) AS income_cents,
         COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents,
         COUNT(*) AS transaction_count,
         COALESCE(SUM(CASE WHEN kind = 'expense' THEN 1 ELSE 0 END), 0) AS expense_count
       FROM transactions
       WHERE user_id = ? AND deleted_at IS NULL AND happened_on BETWEEN ? AND ?`,
    )
    .bind(userId, from, to)
    .first<{
      income_cents: number;
      expense_cents: number;
      transaction_count: number;
      expense_count: number;
    }>();

  const incomeCents = row?.income_cents ?? 0;
  const expenseCents = row?.expense_cents ?? 0;
  const transactionCount = row?.transaction_count ?? 0;
  const expenseCount = row?.expense_count ?? 0;

  return {
    from,
    to,
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    transactionCount,
    expenseCount,
    // 平均支出只按支出笔数摊分，否则会被收入笔数拉低
    averageExpenseCents: expenseCount > 0 ? Math.round(expenseCents / expenseCount) : 0,
  };
}

/** 按自然日聚合，并补齐区间内没有账目的日期，方便前端直接绘图 */
export async function getDailyTrend(
  db: Db,
  userId: string,
  range: { from?: string; to?: string } = {},
): Promise<{ from: string; to: string; points: TrendPoint[] }> {
  const { from, to } = resolveDayRange(range.from, range.to);

  const rows = await allRows<{ day: string; income_cents: number; expense_cents: number }>(
    db
      .prepare(
        `SELECT happened_on AS day,
                COALESCE(SUM(CASE WHEN kind = 'income'  THEN amount_cents ELSE 0 END), 0) AS income_cents,
                COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents
           FROM transactions
          WHERE user_id = ? AND deleted_at IS NULL AND happened_on BETWEEN ? AND ?
          GROUP BY happened_on
          ORDER BY happened_on ASC`,
      )
      .bind(userId, from, to),
  );

  const byDay = new Map(rows.map((row) => [row.day, row]));
  const points: TrendPoint[] = [];
  let cursor = from;
  // 上限保护：避免异常区间导致无限循环
  for (let guard = 0; guard < 400 && cursor <= to; guard++) {
    const row = byDay.get(cursor);
    const incomeCents = row?.income_cents ?? 0;
    const expenseCents = row?.expense_cents ?? 0;
    points.push({ day: cursor, incomeCents, expenseCents, netCents: incomeCents - expenseCents });
    cursor = shiftDay(cursor, 1);
  }

  return { from, to, points };
}

/** 按月聚合，用于年视图 */
export async function getMonthlyTrend(
  db: Db,
  userId: string,
  range: { from?: string; to?: string } = {},
): Promise<TrendPoint[]> {
  const { from, to } = resolveDayRange(range.from, range.to);

  const rows = await allRows<{ month: string; income_cents: number; expense_cents: number }>(
    db
      .prepare(
        `SELECT substr(happened_on, 1, 7) AS month,
                COALESCE(SUM(CASE WHEN kind = 'income'  THEN amount_cents ELSE 0 END), 0) AS income_cents,
                COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents
           FROM transactions
          WHERE user_id = ? AND deleted_at IS NULL AND happened_on BETWEEN ? AND ?
          GROUP BY month
          ORDER BY month ASC`,
      )
      .bind(userId, from, to),
  );

  return rows.map((row) => ({
    // 复用 day 字段承载月份，前端按 granularity 渲染
    day: row.month,
    incomeCents: row.income_cents,
    expenseCents: row.expense_cents,
    netCents: row.income_cents - row.expense_cents,
  }));
}

export async function getCategoryBreakdown(
  db: Db,
  userId: string,
  options: { from?: string; to?: string; kind?: "expense" | "income" } = {},
): Promise<{ from: string; to: string; kind: "expense" | "income"; totalCents: number; items: CategoryBreakdownItem[] }> {
  const { from, to } = resolveDayRange(options.from, options.to);
  const kind = options.kind ?? "expense";

  const rows = await allRows<{
    category_id: string | null;
    name: string | null;
    icon: string | null;
    color: string | null;
    amount_cents: number;
    transaction_count: number;
  }>(
    db
      .prepare(
        `SELECT t.category_id AS category_id,
                c.name  AS name,
                c.icon  AS icon,
                c.color AS color,
                COALESCE(SUM(t.amount_cents), 0) AS amount_cents,
                COUNT(*) AS transaction_count
           FROM transactions t
           LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.kind = ?
            AND t.happened_on BETWEEN ? AND ?
          GROUP BY t.category_id
          ORDER BY amount_cents DESC`,
      )
      .bind(userId, kind, from, to),
  );

  const totalCents = rows.reduce((sum, row) => sum + row.amount_cents, 0);

  return {
    from,
    to,
    kind,
    totalCents,
    items: rows.map((row) => ({
      categoryId: row.category_id,
      name: row.name ?? "未分类",
      icon: row.icon ?? "circle-help",
      color: row.color ?? "#94a3b8",
      amountCents: row.amount_cents,
      transactionCount: row.transaction_count,
      percentage: shareOfTotal(row.amount_cents, totalCents),
    })),
  };
}

/** 账户余额 = 初始余额 + 收入 - 支出 */
export async function getAccountBalances(
  db: Db,
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<AccountBalanceItem[]> {
  const where = options.includeArchived ? "" : "AND a.archived_at IS NULL";
  const rows = await allRows<{
    id: string;
    name: string;
    type: string;
    icon: string;
    initial_balance_cents: number;
    net_cents: number;
    transaction_count: number;
  }>(
    db
      .prepare(
        `SELECT a.id AS id,
                a.name AS name,
                a.type AS type,
                a.icon AS icon,
                a.initial_balance_cents AS initial_balance_cents,
                COALESCE(SUM(
                  CASE t.kind
                    WHEN 'income'  THEN t.amount_cents
                    WHEN 'expense' THEN -t.amount_cents
                    ELSE 0
                  END
                ), 0) AS net_cents,
                COUNT(t.id) AS transaction_count
           FROM accounts a
           LEFT JOIN transactions t
                  ON t.account_id = a.id AND t.deleted_at IS NULL
          WHERE a.user_id = ? ${where}
          GROUP BY a.id
          ORDER BY a.sort_order ASC, a.created_at ASC`,
      )
      .bind(userId),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    icon: row.icon,
    balanceCents: row.initial_balance_cents + row.net_cents,
    transactionCount: row.transaction_count,
  }));
}

/** 首页概览：本月与今日的关键指标，以及当前周期的预算使用情况 */
export async function getDashboardOverview(db: Db, userId: string) {
  const today = todayInBusinessTimezone();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [month, todaySummary, breakdown, budgets] = await Promise.all([
    getSummary(db, userId, { from: monthStart, to: today }),
    getSummary(db, userId, { from: today, to: today }),
    getCategoryBreakdown(db, userId, { from: monthStart, to: today, kind: "expense" }),
    getBudgetOverview(db, userId, today),
  ]);

  return {
    month,
    today: todaySummary,
    topCategories: breakdown.items.slice(0, 5),
    budgets,
  };
}