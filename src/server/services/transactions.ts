import type { Db, TransactionRecord } from "../db/types";
import { ApiError } from "../http/errors";
import { fromBusinessDay, resolveDayRange, todayInBusinessTimezone } from "@/lib/dates";
import { assertCategoryAccessible } from "./categories";
import { getAccount } from "./accounts";
import { allRows, nowMs, paginate, placeholders, type Paginated, toCents } from "./common";
import type { CreateTransactionInput, ListTransactionsQuery, UpdateTransactionInput } from "../validation/schemas";

/**
 * 账目服务。
 *
 * 关键约束：
 *  * 金额一律以「分」存储，写入前由 toCents 完成字符串到整数的转换。
 *  * 删除采用软删除（deleted_at），保证统计口径可追溯、误删可恢复。
 *  * 除管理端监控（listTransactions 传 null）外，所有查询都强制带 user_id 条件，
 *    从数据库层面隔离多租户数据。
 */

export interface TransactionView extends TransactionRecord {
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  account_name: string | null;
  account_type: string | null;
  tags: string[];
  /** 仅在管理端跨用户查询时填充 */
  user_nickname?: string | null;
}

const NOON_MS = 12 * 60 * 60 * 1000;

/** 由「业务日」推导出 happened_at：今天就取当前时刻，历史日期取当日中午，避免时区边界抖动 */
function resolveHappenedAt(happenedOn: string | undefined, now: number): { happenedAt: number; happenedOn: string } {
  if (!happenedOn) {
    return { happenedAt: now, happenedOn: todayInBusinessTimezone(now) };
  }
  const today = todayInBusinessTimezone(now);
  if (happenedOn === today) return { happenedAt: now, happenedOn };
  return { happenedAt: fromBusinessDay(happenedOn) + NOON_MS, happenedOn };
}

async function assertAccountAccessible(db: Db, userId: string, accountId: string): Promise<void> {
  const account = await getAccount(db, userId, accountId);
  if (!account) throw ApiError.badRequest("所选账户不存在");
  if (account.archived_at !== null) throw ApiError.badRequest("所选账户已归档");
}

/** 校验标签归属，防止把账目关联到他人标签 */
async function assertTagsAccessible(db: Db, userId: string, tagIds: string[]): Promise<void> {
  if (tagIds.length === 0) return;
  const rows = await allRows<{ id: string }>(
    db
      .prepare(`SELECT id FROM tags WHERE user_id = ? AND id IN (${placeholders(tagIds.length)})`)
      .bind(userId, ...tagIds),
  );
  if (rows.length !== tagIds.length) throw ApiError.badRequest("存在无效的标签");
}

async function replaceTransactionTags(
  db: Db,
  transactionId: string,
  tagIds: string[],
): Promise<void> {
  const statements = [
    db.prepare(`DELETE FROM transaction_tags WHERE transaction_id = ?`).bind(transactionId),
    ...tagIds.map((tagId) =>
      db
        .prepare(`INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)`)
        .bind(transactionId, tagId),
    ),
  ];
  await db.batch(statements);
}

async function loadTagsFor(db: Db, transactionIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (transactionIds.length === 0) return result;

  const rows = await allRows<{ transaction_id: string; name: string }>(
    db
      .prepare(
        `SELECT tt.transaction_id AS transaction_id, tg.name AS name
           FROM transaction_tags tt
           JOIN tags tg ON tg.id = tt.tag_id
          WHERE tt.transaction_id IN (${placeholders(transactionIds.length)})
          ORDER BY tg.name ASC`,
      )
      .bind(...transactionIds),
  );

  for (const row of rows) {
    const list = result.get(row.transaction_id) ?? [];
    list.push(row.name);
    result.set(row.transaction_id, list);
  }
  return result;
}

/**
 * 账目视图查询。includeUser 仅在管理端跨用户查询时开启，
 * 其他场景都要显式带上 `t.user_id = ?` 条件，避免无意间全表扫描。
 */
function selectView(includeUser = false): string {
  return `
  SELECT t.*,
         c.name  AS category_name,
         c.icon  AS category_icon,
         c.color AS category_color,
         a.name  AS account_name,
         a.type  AS account_type${includeUser ? `,
         u.nickname AS user_nickname` : ""}
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN accounts   a ON a.id = t.account_id${includeUser ? `
    LEFT JOIN users      u ON u.id = t.user_id` : ""}
`;
}

export async function getTransaction(
  db: Db,
  userId: string,
  transactionId: string,
): Promise<TransactionView | null> {
  const row = await db
    .prepare(`${selectView()} WHERE t.id = ? AND t.user_id = ? AND t.deleted_at IS NULL`)
    .bind(transactionId, userId)
    .first<Omit<TransactionView, "tags">>();
  if (!row) return null;
  const tags = await loadTagsFor(db, [row.id]);
  return { ...row, tags: tags.get(row.id) ?? [] };
}

/**
 * 账目列表。
 * userId 为 null 表示不限用户（仅管理端使用），否则强制按 user_id 隔离。
 */
export async function listTransactions(
  db: Db,
  userId: string | null,
  query: ListTransactionsQuery,
  extra: { userId?: string; includeUser?: boolean } = {},
): Promise<Paginated<TransactionView>> {
  const scopedUserId = extra.userId ?? userId;
  const conditions: string[] = [`t.deleted_at IS NULL`];
  const params: unknown[] = [];

  if (scopedUserId) {
    conditions.push(`t.user_id = ?`);
    params.push(scopedUserId);
  }
  if (query.from || query.to) {
    const range = resolveDayRange(query.from, query.to);
    conditions.push(`t.happened_on BETWEEN ? AND ?`);
    params.push(range.from, range.to);
  }
  if (query.kind) {
    conditions.push(`t.kind = ?`);
    params.push(query.kind);
  }
  if (query.categoryId) {
    conditions.push(`t.category_id = ?`);
    params.push(query.categoryId);
  }
  if (query.accountId) {
    conditions.push(`t.account_id = ?`);
    params.push(query.accountId);
  }
  if (query.keyword) {
    conditions.push(`(t.note LIKE ? OR c.name LIKE ?)`);
    const like = `%${query.keyword}%`;
    params.push(like, like);
  }

  const where = conditions.join(" AND ");
  const offset = (query.page - 1) * query.pageSize;

  const totalRow = await db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE ${where}`,
    )
    .bind(...params)
    .first<{ count: number }>();

  const rows = await allRows<Omit<TransactionView, "tags">>(
    db
      .prepare(
        `${selectView(extra.includeUser)} WHERE ${where} ORDER BY t.happened_at DESC, t.created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...params, query.pageSize, offset),
  );

  const tagMap = await loadTagsFor(db, rows.map((row) => row.id));
  const items = rows.map((row) => ({ ...row, tags: tagMap.get(row.id) ?? [] }));

  return paginate(items, totalRow?.count ?? 0, query.page, query.pageSize);
}

export async function createTransaction(
  db: Db,
  userId: string,
  input: CreateTransactionInput,
  now = nowMs(),
): Promise<TransactionView> {
  const { happenedAt, happenedOn } = resolveHappenedAt(input.happenedOn, now);
  const amountCents = toCents(input.amount);

  if (input.categoryId) {
    const category = await assertCategoryAccessible(db, userId, input.categoryId);
    if (category.kind !== input.kind) {
      throw ApiError.badRequest("分类类型与账目类型不一致");
    }
  }
  if (input.accountId) await assertAccountAccessible(db, userId, input.accountId);

  const tagIds = input.tagIds ?? [];
  await assertTagsAccessible(db, userId, tagIds);

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO transactions
         (id, user_id, account_id, category_id, kind, amount_cents, currency, note,
          happened_at, happened_on, transfer_peer_id, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, 'CNY', ?, ?, ?, NULL, ?, ?, NULL)`,
    )
    .bind(
      id,
      userId,
      input.accountId ?? null,
      input.categoryId ?? null,
      input.kind,
      amountCents,
      input.note ?? null,
      happenedAt,
      happenedOn,
      now,
      now,
    )
    .run();

  if (tagIds.length > 0) await replaceTransactionTags(db, id, tagIds);

  const created = await getTransaction(db, userId, id);
  if (!created) throw ApiError.internal("创建账目失败");
  return created;
}

export async function updateTransaction(
  db: Db,
  userId: string,
  transactionId: string,
  input: UpdateTransactionInput,
  now = nowMs(),
): Promise<TransactionView> {
  const existing = await getTransaction(db, userId, transactionId);
  if (!existing) throw ApiError.notFound("账目不存在或已删除");

  const nextKind = input.kind ?? existing.kind;

  if (input.categoryId !== undefined) {
    if (input.categoryId === null) {
      // 允许清空分类
    } else {
      const category = await assertCategoryAccessible(db, userId, input.categoryId);
      if (category.kind !== nextKind) throw ApiError.badRequest("分类类型与账目类型不一致");
    }
  }
  if (input.accountId !== undefined && input.accountId !== null) {
    await assertAccountAccessible(db, userId, input.accountId);
  }
  if (input.tagIds !== undefined) await assertTagsAccessible(db, userId, input.tagIds);

  const assignments: string[] = [];
  const params: unknown[] = [];
  const push = (column: string, value: unknown) => {
    assignments.push(`${column} = ?`);
    params.push(value);
  };

  if (input.kind !== undefined) push("kind", input.kind);
  if (input.amount !== undefined) push("amount_cents", toCents(input.amount));
  if (input.categoryId !== undefined) push("category_id", input.categoryId ?? null);
  if (input.accountId !== undefined) push("account_id", input.accountId ?? null);
  if (input.note !== undefined) push("note", input.note ?? null);
  if (input.happenedOn !== undefined) {
    const resolved = resolveHappenedAt(input.happenedOn, now);
    push("happened_at", resolved.happenedAt);
    push("happened_on", resolved.happenedOn);
  }
  push("updated_at", now);

  await db
    .prepare(`UPDATE transactions SET ${assignments.join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...params, transactionId, userId)
    .run();

  if (input.tagIds !== undefined) await replaceTransactionTags(db, transactionId, input.tagIds);

  const updated = await getTransaction(db, userId, transactionId);
  if (!updated) throw ApiError.internal("更新账目失败");
  return updated;
}

/** 软删除：保留数据用于统计追溯与误删恢复 */
export async function deleteTransaction(
  db: Db,
  userId: string,
  transactionId: string,
  now = nowMs(),
): Promise<void> {
  const result = await db
    .prepare(
      `UPDATE transactions SET deleted_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    )
    .bind(now, now, transactionId, userId)
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    throw ApiError.notFound("账目不存在或已删除");
  }
}

/** 批量软删除，供「清空某天」等场景使用 */
export async function deleteTransactionsByIds(
  db: Db,
  userId: string,
  transactionIds: string[],
  now = nowMs(),
): Promise<number> {
  if (transactionIds.length === 0) return 0;
  const result = await db
    .prepare(
      `UPDATE transactions SET deleted_at = ?, updated_at = ?
        WHERE user_id = ? AND deleted_at IS NULL
          AND id IN (${placeholders(transactionIds.length)})`,
    )
    .bind(now, now, userId, ...transactionIds)
    .run();
  return result.meta?.changes ?? 0;
}