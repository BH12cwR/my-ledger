import type { AccountRecord, Db } from "../db/types";
import { ApiError } from "../http/errors";
import { allRows, nowMs, toCents } from "./common";
import type { CreateAccountInput, UpdateAccountInput } from "../validation/schemas";

/** 资金账户服务：有历史账目的账户只归档，无关联账目的账户可物理删除 */

export async function listAccounts(
  db: Db,
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<AccountRecord[]> {
  const where = options.includeArchived ? "" : "AND archived_at IS NULL";
  return allRows<AccountRecord>(
    db
      .prepare(
        `SELECT * FROM accounts
          WHERE user_id = ? ${where}
          ORDER BY sort_order ASC, created_at ASC`,
      )
      .bind(userId),
  );
}

export async function getAccount(db: Db, userId: string, accountId: string): Promise<AccountRecord | null> {
  return db
    .prepare(`SELECT * FROM accounts WHERE id = ? AND user_id = ?`)
    .bind(accountId, userId)
    .first<AccountRecord>();
}

export async function createAccount(
  db: Db,
  userId: string,
  input: CreateAccountInput,
  now = nowMs(),
): Promise<AccountRecord> {
  const id = crypto.randomUUID();
  // 初始余额允许为 0（新建账户时通常就是 0），与交易金额「必须大于 0」的约束不同
  const initialBalanceCents =
    input.initialBalance === undefined ? 0 : toCents(input.initialBalance, { allowZero: true });

  await db
    .prepare(
      `INSERT INTO accounts
         (id, user_id, name, type, icon, initial_balance_cents, sort_order, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(
      id,
      userId,
      input.name,
      input.type,
      input.icon,
      initialBalanceCents,
      input.sortOrder,
      now,
      now,
    )
    .run();

  const created = await getAccount(db, userId, id);
  if (!created) throw ApiError.internal("创建账户失败");
  return created;
}

export async function updateAccount(
  db: Db,
  userId: string,
  accountId: string,
  input: UpdateAccountInput,
  now = nowMs(),
): Promise<AccountRecord> {
  const existing = await getAccount(db, userId, accountId);
  if (!existing) throw ApiError.notFound("账户不存在");

  const assignments: string[] = [];
  const params: unknown[] = [];
  const push = (column: string, value: unknown) => {
    assignments.push(`${column} = ?`);
    params.push(value);
  };

  if (input.name !== undefined) push("name", input.name);
  if (input.type !== undefined) push("type", input.type);
  if (input.icon !== undefined) push("icon", input.icon);
  if (input.initialBalance !== undefined) {
    push("initial_balance_cents", toCents(input.initialBalance, { allowZero: true }));
  }
  if (input.sortOrder !== undefined) push("sort_order", input.sortOrder);
  push("updated_at", now);

  await db
    .prepare(`UPDATE accounts SET ${assignments.join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...params, accountId, userId)
    .run();

  const updated = await getAccount(db, userId, accountId);
  if (!updated) throw ApiError.internal("更新账户失败");
  return updated;
}

/** 归档 / 恢复账户；归档后不再出现在记账页，但历史账目仍然完整 */
export async function archiveAccount(
  db: Db,
  userId: string,
  accountId: string,
  archived: boolean,
  now = nowMs(),
): Promise<AccountRecord> {
  const existing = await getAccount(db, userId, accountId);
  if (!existing) throw ApiError.notFound("账户不存在");

  if (archived) {
    const activeCount = await db
      .prepare(`SELECT COUNT(*) AS count FROM accounts WHERE user_id = ? AND archived_at IS NULL`)
      .bind(userId)
      .first<{ count: number }>();
    if ((activeCount?.count ?? 0) <= 1) {
      throw ApiError.badRequest("至少需要保留一个可用账户");
    }
  }

  await db
    .prepare(`UPDATE accounts SET archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
    .bind(archived ? now : null, now, accountId, userId)
    .run();

  const updated = await getAccount(db, userId, accountId);
  if (!updated) throw ApiError.internal("更新账户状态失败");
  return updated;
}

/** 物理删除：仅当账户下没有未删除的账目时才允许，否则会破坏历史账目归属 */
export async function deleteAccount(db: Db, userId: string, accountId: string): Promise<void> {
  const existing = await getAccount(db, userId, accountId);
  if (!existing) throw ApiError.notFound("账户不存在");

  const linked = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM transactions
        WHERE user_id = ? AND account_id = ? AND deleted_at IS NULL`,
    )
    .bind(userId, accountId)
    .first<{ count: number }>();
  if ((linked?.count ?? 0) > 0) {
    throw ApiError.badRequest("该账户下存在账目记录，无法删除；可改为归档");
  }

  await db.prepare(`DELETE FROM accounts WHERE id = ? AND user_id = ?`).bind(accountId, userId).run();
}