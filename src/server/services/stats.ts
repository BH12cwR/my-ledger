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
  /** 分类 id 或标签 id；未分类/未打标签时为 null */
  id: string | null;
  name: string;
  icon: string;
  color: string;
  amountCents: number;
  transactionCount: number;
  percentage: number;
}

export interface CategoryBreakdownResult {
  from: string;
  to: string;
  kind: "expense" | "income";
  dimension: "category" | "tag";
  totalCents: number;
  items: CategoryBreakdownItem[];
}

export interface AccountBalanceItem {
  id: string;
  name: string;
  type: string;
  icon: string;
  balanceCents: number;
  transactionCount: number;
}

/** 统计筛选条件：时间区间 + 可选的分类 / 标签过滤 */
interface StatsFilter {
  from?: string;
  to?: string;
  categoryId?: string;
  tagId?: string;
}

/** 统一拼装统计查询的 WHERE 条件，保证各聚合口径一致 */
function appendFilters(
  conditions: string[],
  params: unknown[],
  userId: string,
  from: string,
  to: string,
  filter: { categoryId?: string; tagId?: string } = {},
): void {
  conditions.push(`t.user_id = ?`, `t.deleted_at IS NULL`, `t.happened_on BETWEEN ? AND ?`);
  params.push(userId, from, to);
  if (filter.categoryId) {
    conditions.push(`t.category_id = ?`);
    params.push(filter.categoryId);
  }
  if (filter.tagId) {
    conditions.push(
      `EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = t.id AND tt.tag_id = ?)`,
    );
    params.push(filter.tagId);
  }
}

/** 由已算好的合计构造 summary，供单区间与首页概览复用，保证口径一致 */
function buildSummary(
  from: string,
  to: string,
  incomeCents: number,
  expenseCents: number,
  transactionCount: number,
  expenseCount: number,
): SummaryResult {
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

export async function getSummary(
  db: Db,
  userId: string,
  range: StatsFilter = {},
): Promise<SummaryResult> {
  const { from, to } = resolveDayRange(range.from, range.to);

  const conditions: string[] = [];
  const params: unknown[] = [];
  appendFilters(conditions, params, userId, from, to, range);

  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN t.kind = 'income'  THEN t.amount_cents ELSE 0 END), 0) AS income_cents,
         COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS expense_cents,
         COUNT(*) AS transaction_count,
         COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN 1 ELSE 0 END), 0) AS expense_count
       FROM transactions t
       WHERE ${conditions.join(" AND ")}`,
    )
    .bind(...params)
    .first<{
      income_cents: number;
      expense_cents: number;
      transaction_count: number;
      expense_count: number;
    }>();

  return buildSummary(
    from,
    to,
    row?.income_cents ?? 0,
    row?.expense_cents ?? 0,
    row?.transaction_count ?? 0,
    row?.expense_count ?? 0,
  );
}

/** 按自然日聚合，并补齐区间内没有账目的日期，方便前端直接绘图 */
export async function getDailyTrend(
  db: Db,
  userId: string,
  range: StatsFilter = {},
): Promise<{ from: string; to: string; points: TrendPoint[] }> {
  const { from, to } = resolveDayRange(range.from, range.to);

  const conditions: string[] = [];
  const params: unknown[] = [];
  appendFilters(conditions, params, userId, from, to, range);

  const rows = await allRows<{ day: string; income_cents: number; expense_cents: number }>(
    db
      .prepare(
        `SELECT t.happened_on AS day,
                COALESCE(SUM(CASE WHEN t.kind = 'income'  THEN t.amount_cents ELSE 0 END), 0) AS income_cents,
                COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS expense_cents
           FROM transactions t
          WHERE ${conditions.join(" AND ")}
          GROUP BY t.happened_on
          ORDER BY t.happened_on ASC`,
      )
      .bind(...params),
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
  range: StatsFilter = {},
): Promise<TrendPoint[]> {
  const { from, to } = resolveDayRange(range.from, range.to);

  const conditions: string[] = [];
  const params: unknown[] = [];
  appendFilters(conditions, params, userId, from, to, range);

  const rows = await allRows<{ month: string; income_cents: number; expense_cents: number }>(
    db
      .prepare(
        `SELECT substr(t.happened_on, 1, 7) AS month,
                COALESCE(SUM(CASE WHEN t.kind = 'income'  THEN t.amount_cents ELSE 0 END), 0) AS income_cents,
                COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS expense_cents
           FROM transactions t
          WHERE ${conditions.join(" AND ")}
          GROUP BY month
          ORDER BY month ASC`,
      )
      .bind(...params),
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
  options: StatsFilter & { kind?: "expense" | "income"; dimension?: "category" | "tag" } = {},
): Promise<CategoryBreakdownResult> {
  const { from, to } = resolveDayRange(options.from, options.to);
  const kind = options.kind ?? "expense";
  const dimension = options.dimension ?? "category";

  const conditions: string[] = [];
  const params: unknown[] = [];
  appendFilters(conditions, params, userId, from, to, options);
  conditions.push(`t.kind = ?`);
  params.push(kind);
  const where = conditions.join(" AND ");

  if (dimension === "tag") {
    const rows = await allRows<{
      id: string | null;
      name: string | null;
      color: string | null;
      amount_cents: number;
      transaction_count: number;
    }>(
      db
        .prepare(
          `SELECT tg.id   AS id,
                  tg.name AS name,
                  tg.color AS color,
                  COALESCE(SUM(t.amount_cents), 0) AS amount_cents,
                  COUNT(DISTINCT t.id) AS transaction_count
             FROM transactions t
             LEFT JOIN transaction_tags tt ON tt.transaction_id = t.id
             LEFT JOIN tags tg ON tg.id = tt.tag_id
            WHERE ${where}
            GROUP BY tg.id
            ORDER BY amount_cents DESC`,
        )
        .bind(...params),
    );

    const totalCents = rows.reduce((sum, row) => sum + row.amount_cents, 0);
    return {
      from,
      to,
      kind,
      dimension,
      totalCents,
      items: rows.map((row) => ({
        id: row.id,
        name: row.name ?? "未打标签",
        icon: "tag",
        color: row.color ?? "#94a3b8",
        amountCents: row.amount_cents,
        transactionCount: row.transaction_count,
        percentage: shareOfTotal(row.amount_cents, totalCents),
      })),
    };
  }

  const rows = await allRows<{
    id: string | null;
    name: string | null;
    icon: string | null;
    color: string | null;
    amount_cents: number;
    transaction_count: number;
  }>(
    db
      .prepare(
        `SELECT t.category_id AS id,
                c.name  AS name,
                c.icon  AS icon,
                c.color AS color,
                COALESCE(SUM(t.amount_cents), 0) AS amount_cents,
                COUNT(*) AS transaction_count
           FROM transactions t
           LEFT JOIN categories c ON c.id = t.category_id
          WHERE ${where}
          GROUP BY t.category_id
          ORDER BY amount_cents DESC`,
      )
      .bind(...params),
  );

  const totalCents = rows.reduce((sum, row) => sum + row.amount_cents, 0);

  return {
    from,
    to,
    kind,
    dimension,
    totalCents,
    items: rows.map((row) => ({
      id: row.id,
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

  // 本月与今日共用一次表扫描：今日指标由 CASE WHEN 在 SELECT 中派生。
  // 注意绑参顺序——SELECT 中的 4 个「今日」占位符排在 WHERE 参数之前。
  const [summaryRow, breakdown, budgets] = await Promise.all([
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN t.kind = 'income'  THEN t.amount_cents ELSE 0 END), 0) AS income_cents,
           COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS expense_cents,
           COUNT(*) AS transaction_count,
           COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN 1 ELSE 0 END), 0) AS expense_count,
           COALESCE(SUM(CASE WHEN t.happened_on = ? AND t.kind = 'income'  THEN t.amount_cents ELSE 0 END), 0) AS today_income_cents,
           COALESCE(SUM(CASE WHEN t.happened_on = ? AND t.kind = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS today_expense_cents,
           COALESCE(SUM(CASE WHEN t.happened_on = ? THEN 1 ELSE 0 END), 0) AS today_transaction_count,
           COALESCE(SUM(CASE WHEN t.happened_on = ? AND t.kind = 'expense' THEN 1 ELSE 0 END), 0) AS today_expense_count
         FROM transactions t
        WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.happened_on BETWEEN ? AND ?`,
      )
      .bind(today, today, today, today, userId, monthStart, today)
      .first<{
        income_cents: number;
        expense_cents: number;
        transaction_count: number;
        expense_count: number;
        today_income_cents: number;
        today_expense_cents: number;
        today_transaction_count: number;
        today_expense_count: number;
      }>(),
    getCategoryBreakdown(db, userId, { from: monthStart, to: today, kind: "expense" }),
    getBudgetOverview(db, userId, today),
  ]);

  return {
    month: buildSummary(
      monthStart,
      today,
      summaryRow?.income_cents ?? 0,
      summaryRow?.expense_cents ?? 0,
      summaryRow?.transaction_count ?? 0,
      summaryRow?.expense_count ?? 0,
    ),
    today: buildSummary(
      today,
      today,
      summaryRow?.today_income_cents ?? 0,
      summaryRow?.today_expense_cents ?? 0,
      summaryRow?.today_transaction_count ?? 0,
      summaryRow?.today_expense_count ?? 0,
    ),
    topCategories: breakdown.items.slice(0, 5),
    budgets,
  };
}