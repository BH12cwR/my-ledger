import type { Db } from "../db/types";
import {
  countDaysInclusive,
  countMonthsInclusive,
  previousRange,
  resolveDayRange,
  shiftDay,
  todayInBusinessTimezone,
} from "@/lib/dates";
import { allRows, shareOfTotal } from "./common";
import { getBudgetOverview } from "./budgets";

/**
 * 统计服务。
 *
 * 所有聚合都在 SQL 中按「分」求和，不把明细拉到内存里再算，
 * 既保证精度也避免大数据量下的函数内存与执行时间开销。
 */

/** 环比用的上一同长度周期汇总 */
export interface SummaryComparison {
  from: string;
  to: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

export interface SummaryResult {
  from: string;
  to: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  /** 区间内的收支笔数（不含转账） */
  transactionCount: number;
  /** 区间内的支出笔数。平均支出以此为分母，与 transactionCount（含收入）区分开 */
  expenseCount: number;
  /** 区间内的转账笔数，单独计数，不计入收支 */
  transferCount: number;
  /** 区间内的转账金额；同样不并入收支，只用于「收支总览」展示 */
  transferCents: number;
  averageExpenseCents: number;
  /** 区间内日均支出（支出合计 ÷ 区间自然日数），用于统计页「收支总览」 */
  dailyAverageCents: number;
  /** 上一同长度周期的汇总；未请求环比时为 null */
  previous: SummaryComparison | null;
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
  /** 上一同长度周期的同项金额；未请求环比时为 null */
  previousAmountCents: number | null;
}

/** 结构占比的数据类型：「全部」表示收支合并口径 */
export type BreakdownKind = "expense" | "income" | "all";

export interface CategoryBreakdownResult {
  from: string;
  to: string;
  kind: BreakdownKind;
  dimension: "category" | "tag";
  totalCents: number;
  /** 上一同长度周期的合计；未请求环比时为 null */
  previousTotalCents: number | null;
  items: CategoryBreakdownItem[];
}

/** 分类详情页的指标（稿 9）：总额、笔数、平均每笔、平均每月、退款 */
export interface CategoryDetailResult {
  from: string;
  to: string;
  kind: "expense" | "income";
  totalCents: number;
  transactionCount: number;
  averagePerTransactionCents: number;
  averagePerMonthCents: number;
  monthCount: number;
  refundCents: number;
  /** 该分类金额占同期同类型总额的百分比 */
  sharePercentage: number;
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

/**
 * 「只保留打了指定标签的账目」的附加条件，供分类详情的三处聚合共用。
 *
 * `alias` 只会是本文件里的字面量（"t" / "o"），不是外部输入；
 * 未指定标签时返回空串，因此调用方可以直接把它拼在 WHERE 末尾，
 * 绑参顺序也始终是「原有参数 + 可选的 tagId」。
 */
function tagFilterClause(alias: "t" | "o", tagId?: string): string {
  if (!tagId) return "";
  return ` AND EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = ${alias}.id AND tt.tag_id = ?)`;
}

/** 由已算好的合计构造 summary，供单区间与首页概览复用，保证口径一致 */function buildSummary(
  from: string,
  to: string,
  incomeCents: number,
  expenseCents: number,
  transactionCount: number,
  expenseCount: number,
  transferCount: number,
  transferCents: number,
  previous: SummaryComparison | null = null,
): SummaryResult {
  // 日均支出按「区间覆盖的自然日数」摊分；单日区间（今天）分母为 1，不会除零
  const days = Math.max(countDaysInclusive(from, to), 1);
  return {
    from,
    to,
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    transactionCount,
    expenseCount,
    transferCount,
    transferCents,
    // 平均支出只按支出笔数摊分，否则会被收入笔数拉低
    averageExpenseCents: expenseCount > 0 ? Math.round(expenseCents / expenseCount) : 0,
    dailyAverageCents: Math.round(expenseCents / days),
    previous,
  };
}

type SummaryAggregateRow = {
  income_cents: number;
  expense_cents: number;
  transaction_count: number;
  expense_count: number;
  transfer_count: number;
  transfer_cents: number;
};

/** 单区间的收支聚合。本期与环比上期复用同一段 SQL，避免两处口径漂移 */
async function aggregateSummary(
  db: Db,
  userId: string,
  from: string,
  to: string,
  filter: StatsFilter,
): Promise<SummaryAggregateRow> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  appendFilters(conditions, params, userId, from, to, filter);

  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN t.kind = 'income'  THEN t.amount_cents ELSE 0 END), 0) AS income_cents,
         COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS expense_cents,
         COALESCE(SUM(CASE WHEN t.kind IN ('expense', 'income') THEN 1 ELSE 0 END), 0) AS transaction_count,
         COALESCE(SUM(CASE WHEN t.kind = 'expense'  THEN 1 ELSE 0 END), 0) AS expense_count,
         COALESCE(SUM(CASE WHEN t.kind = 'transfer' THEN 1 ELSE 0 END), 0) AS transfer_count,
         COALESCE(SUM(CASE WHEN t.kind = 'transfer' THEN t.amount_cents ELSE 0 END), 0) AS transfer_cents
       FROM transactions t
       WHERE ${conditions.join(" AND ")}`,
    )
    .bind(...params)
    .first<SummaryAggregateRow>();

  return {
    income_cents: row?.income_cents ?? 0,
    expense_cents: row?.expense_cents ?? 0,
    transaction_count: row?.transaction_count ?? 0,
    expense_count: row?.expense_count ?? 0,
    transfer_count: row?.transfer_count ?? 0,
    transfer_cents: row?.transfer_cents ?? 0,
  };
}

/**
 * 区间汇总。
 * `options.compare` 为真时额外查询「上一同长度周期」，由服务端一次返回两期，
 * 前端不需要再发一次请求（决策 5）。
 */
export async function getSummary(
  db: Db,
  userId: string,
  range: StatsFilter = {},
  options: { compare?: boolean } = {},
): Promise<SummaryResult> {
  const { from, to } = resolveDayRange(range.from, range.to);
  const current = await aggregateSummary(db, userId, from, to, range);

  let previous: SummaryComparison | null = null;
  if (options.compare) {
    const prev = previousRange(from, to);
    const stats = await aggregateSummary(db, userId, prev.from, prev.to, range);
    previous = {
      from: prev.from,
      to: prev.to,
      incomeCents: stats.income_cents,
      expenseCents: stats.expense_cents,
      netCents: stats.income_cents - stats.expense_cents,
    };
  }

  return buildSummary(
    from,
    to,
    current.income_cents,
    current.expense_cents,
    current.transaction_count,
    current.expense_count,
    current.transfer_count,
    current.transfer_cents,
    previous,
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

/** 结构占比的原始聚合行，分类与标签两种维度共用 */
interface BreakdownRow {
  id: string | null;
  name: string | null;
  icon: string | null;
  color: string | null;
  amount_cents: number;
  transaction_count: number;
}

/**
 * 单个区间的结构聚合。
 * kind 为 all 时不加类型条件，收支合并计算（统计页「全部」分段）。
 */
async function queryBreakdownRows(
  db: Db,
  userId: string,
  options: {
    from: string;
    to: string;
    kind: BreakdownKind;
    dimension: "category" | "tag";
    categoryId?: string;
    tagId?: string;
  },
): Promise<BreakdownRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  appendFilters(conditions, params, userId, options.from, options.to, options);
  if (options.kind !== "all") {
    conditions.push(`t.kind = ?`);
    params.push(options.kind);
  }
  const where = conditions.join(" AND ");

  if (options.dimension === "tag") {
    return allRows<BreakdownRow>(
      db
        .prepare(
          `SELECT tg.id   AS id,
                  tg.name AS name,
                  'tag'   AS icon,
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
  }

  return allRows<BreakdownRow>(
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
}

/**
 * 结构占比。
 * `options.compare` 为真时同时给出上一同长度周期的合计与各项金额，供排行行的环比徽章使用。
 */
export async function getCategoryBreakdown(
  db: Db,
  userId: string,
  options: StatsFilter & {
    kind?: BreakdownKind;
    dimension?: "category" | "tag";
    compare?: boolean;
  } = {},
): Promise<CategoryBreakdownResult> {
  const { from, to } = resolveDayRange(options.from, options.to);
  const kind = options.kind ?? "expense";
  const dimension = options.dimension ?? "category";
  const scope = { dimension, categoryId: options.categoryId, tagId: options.tagId };

  const rows = await queryBreakdownRows(db, userId, { from, to, kind, ...scope });
  const totalCents = rows.reduce((sum, row) => sum + row.amount_cents, 0);

  let previousTotalCents: number | null = null;
  let previousById: Map<string | null, number> | null = null;
  if (options.compare) {
    const prev = previousRange(from, to);
    const previousRows = await queryBreakdownRows(db, userId, { ...prev, kind, ...scope });
    previousTotalCents = previousRows.reduce((sum, row) => sum + row.amount_cents, 0);
    previousById = new Map(previousRows.map((row) => [row.id, row.amount_cents]));
  }

  return {
    from,
    to,
    kind,
    dimension,
    totalCents,
    previousTotalCents,
    items: rows.map((row) => ({
      id: row.id,
      name: row.name ?? (dimension === "tag" ? "未打标签" : "未分类"),
      icon: row.icon ?? "circle-help",
      color: row.color ?? "#94a3b8",
      amountCents: row.amount_cents,
      transactionCount: row.transaction_count,
      percentage: shareOfTotal(row.amount_cents, totalCents),
      previousAmountCents: previousById ? (previousById.get(row.id) ?? 0) : null,
    })),
  };
}

/**
 * 分类详情指标（稿 9）。
 *
 * 「平均每月」按区间覆盖的自然月数摊分；「退款合计」统计区间内退款记录中
 * 来源支出属于该分类的部分（退款本身是收入记录，不带分类）。
 */
export async function getCategoryDetail(
  db: Db,
  userId: string,
  options: {
    categoryId: string;
    from?: string;
    to?: string;
    kind?: "expense" | "income";
    /** 可选：只看打了该标签的账目 */
    tagId?: string;
  },
): Promise<CategoryDetailResult> {
  const { from, to } = resolveDayRange(options.from, options.to);
  const kind = options.kind ?? "expense";
  const tagParams = options.tagId ? [options.tagId] : [];

  const [totals, refund, period] = await Promise.all([
    db
      .prepare(
        `SELECT COALESCE(SUM(t.amount_cents), 0) AS total_cents,
                COUNT(*) AS transaction_count
           FROM transactions t
          WHERE t.user_id = ? AND t.deleted_at IS NULL
            AND t.kind = ? AND t.category_id = ?
            AND t.happened_on BETWEEN ? AND ?${tagFilterClause("t", options.tagId)}`,
      )
      .bind(userId, kind, options.categoryId, from, to, ...tagParams)
      .first<{ total_cents: number; transaction_count: number }>(),
    // 退款记录的标签挂在被退的那笔支出上，所以标签条件加在 o 上而不是 r 上；
    // 否则退款的标签若没被继承，这里会永远统计成 0
    db
      .prepare(
        `SELECT COALESCE(SUM(r.amount_cents), 0) AS refund_cents
           FROM transactions r
           JOIN transactions o ON o.id = r.refund_of_id
          WHERE r.user_id = ? AND r.deleted_at IS NULL
            AND o.category_id = ?
            AND r.happened_on BETWEEN ? AND ?${tagFilterClause("o", options.tagId)}`,
      )
      .bind(userId, options.categoryId, from, to, ...tagParams)
      .first<{ refund_cents: number }>(),
    // 占比的分母必须跟着标签一起收窄，否则「某标签占该分类的比例」会被全量分母稀释
    db
      .prepare(
        `SELECT COALESCE(SUM(t.amount_cents), 0) AS total_cents
           FROM transactions t
          WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.kind = ?
            AND t.happened_on BETWEEN ? AND ?${tagFilterClause("t", options.tagId)}`,
      )
      .bind(userId, kind, from, to, ...tagParams)
      .first<{ total_cents: number }>(),
  ]);

  const totalCents = totals?.total_cents ?? 0;
  const transactionCount = totals?.transaction_count ?? 0;
  const monthCount = countMonthsInclusive(from, to);

  return {
    from,
    to,
    kind,
    totalCents,
    transactionCount,
    averagePerTransactionCents: transactionCount > 0 ? Math.round(totalCents / transactionCount) : 0,
    averagePerMonthCents: monthCount > 0 ? Math.round(totalCents / monthCount) : 0,
    monthCount,
    refundCents: refund?.refund_cents ?? 0,
    sharePercentage: shareOfTotal(totalCents, period?.total_cents ?? 0),
  };
}

/** 账户余额 = 初始余额 + 收入 - 支出；转账对转出账户扣减、对转入账户增加 */
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
        // 转账在 account_id（转出）与 to_account_id（转入）两侧各产生一条资金流，
        // 用 UNION ALL 展平成 (账户, 变动额) 后再逐账户聚合。
        `WITH flows AS (
           SELECT t.account_id AS account_id,
                  CASE t.kind
                    WHEN 'income'  THEN t.amount_cents
                    WHEN 'expense' THEN -t.amount_cents
                    ELSE -t.amount_cents
                  END AS delta
             FROM transactions t
            WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.account_id IS NOT NULL
           UNION ALL
           SELECT t.to_account_id AS account_id, t.amount_cents AS delta
             FROM transactions t
            WHERE t.user_id = ? AND t.deleted_at IS NULL
              AND t.kind = 'transfer' AND t.to_account_id IS NOT NULL
         )
         SELECT a.id AS id,
                a.name AS name,
                a.type AS type,
                a.icon AS icon,
                a.initial_balance_cents AS initial_balance_cents,
                COALESCE((SELECT SUM(f.delta) FROM flows f WHERE f.account_id = a.id), 0) AS net_cents,
                (SELECT COUNT(*) FROM flows f WHERE f.account_id = a.id) AS transaction_count
           FROM accounts a
          WHERE a.user_id = ? ${where}
          ORDER BY a.sort_order ASC, a.created_at ASC`,
      )
      .bind(userId, userId, userId),
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
  // 注意绑参顺序——SELECT 中的 6 个「今日」占位符排在 WHERE 参数之前。
  const [summaryRow, breakdown, budgets] = await Promise.all([
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN t.kind = 'income'  THEN t.amount_cents ELSE 0 END), 0) AS income_cents,
           COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS expense_cents,
           COALESCE(SUM(CASE WHEN t.kind IN ('expense', 'income') THEN 1 ELSE 0 END), 0) AS transaction_count,
           COALESCE(SUM(CASE WHEN t.kind = 'expense'  THEN 1 ELSE 0 END), 0) AS expense_count,
           COALESCE(SUM(CASE WHEN t.kind = 'transfer' THEN 1 ELSE 0 END), 0) AS transfer_count,
           COALESCE(SUM(CASE WHEN t.happened_on = ? AND t.kind = 'income'  THEN t.amount_cents ELSE 0 END), 0) AS today_income_cents,
           COALESCE(SUM(CASE WHEN t.happened_on = ? AND t.kind = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS today_expense_cents,
           COALESCE(SUM(CASE WHEN t.happened_on = ? AND t.kind IN ('expense', 'income') THEN 1 ELSE 0 END), 0) AS today_transaction_count,
           COALESCE(SUM(CASE WHEN t.happened_on = ? AND t.kind = 'expense' THEN 1 ELSE 0 END), 0) AS today_expense_count,
           COALESCE(SUM(CASE WHEN t.happened_on = ? AND t.kind = 'transfer' THEN 1 ELSE 0 END), 0) AS today_transfer_count,
           COALESCE(SUM(CASE WHEN t.kind = 'transfer' THEN t.amount_cents ELSE 0 END), 0) AS transfer_cents,
           COALESCE(SUM(CASE WHEN t.happened_on = ? AND t.kind = 'transfer' THEN t.amount_cents ELSE 0 END), 0) AS today_transfer_cents
         FROM transactions t
        WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.happened_on BETWEEN ? AND ?`,
      )
      .bind(today, today, today, today, today, today, userId, monthStart, today)
      .first<{
        income_cents: number;
        expense_cents: number;
        transaction_count: number;
        expense_count: number;
        transfer_count: number;
        transfer_cents: number;
        today_income_cents: number;
        today_expense_cents: number;
        today_transaction_count: number;
        today_expense_count: number;
        today_transfer_count: number;
        today_transfer_cents: number;
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
      summaryRow?.transfer_count ?? 0,
      summaryRow?.transfer_cents ?? 0,
    ),
    today: buildSummary(
      today,
      today,
      summaryRow?.today_income_cents ?? 0,
      summaryRow?.today_expense_cents ?? 0,
      summaryRow?.today_transaction_count ?? 0,
      summaryRow?.today_expense_count ?? 0,
      summaryRow?.today_transfer_count ?? 0,
      summaryRow?.today_transfer_cents ?? 0,
    ),
    topCategories: breakdown.items.slice(0, 5),
    budgets,
  };
}