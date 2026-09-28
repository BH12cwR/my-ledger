import type { Db, TagRecord } from "../db/types";
import { ApiError } from "../http/errors";
import { allRows, nowMs } from "./common";
import type { CreateTagInput, UpdateTagInput } from "../validation/schemas";

/**
 * 标签服务：用于跨分类的横向归类（如「出差」「报销」）。
 * 标签与账目是多对多关系，删除标签时由外键级联清理关联，不影响账目本身。
 */

export async function listTags(db: Db, userId: string): Promise<TagRecord[]> {
  return allRows<TagRecord>(
    db
      .prepare(`SELECT * FROM tags WHERE user_id = ? ORDER BY created_at ASC`)
      .bind(userId),
  );
}

export async function getTag(db: Db, userId: string, tagId: string): Promise<TagRecord | null> {
  return db
    .prepare(`SELECT * FROM tags WHERE id = ? AND user_id = ?`)
    .bind(tagId, userId)
    .first<TagRecord>();
}

export async function createTag(
  db: Db,
  userId: string,
  input: CreateTagInput,
  now = nowMs(),
): Promise<TagRecord> {
  const duplicated = await db
    .prepare(`SELECT id FROM tags WHERE user_id = ? AND name = ?`)
    .bind(userId, input.name)
    .first<{ id: string }>();
  if (duplicated) throw ApiError.conflict("已存在同名标签");

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO tags (id, user_id, name, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, userId, input.name, input.color, now, now)
    .run();

  const created = await getTag(db, userId, id);
  if (!created) throw ApiError.internal("创建标签失败");
  return created;
}

export async function updateTag(
  db: Db,
  userId: string,
  tagId: string,
  input: UpdateTagInput,
  now = nowMs(),
): Promise<TagRecord> {
  const existing = await getTag(db, userId, tagId);
  if (!existing) throw ApiError.notFound("标签不存在");

  if (input.name !== undefined && input.name !== existing.name) {
    const duplicated = await db
      .prepare(`SELECT id FROM tags WHERE user_id = ? AND name = ? AND id <> ?`)
      .bind(userId, input.name, tagId)
      .first<{ id: string }>();
    if (duplicated) throw ApiError.conflict("已存在同名标签");
  }

  const assignments: string[] = [];
  const params: unknown[] = [];
  if (input.name !== undefined) {
    assignments.push(`name = ?`);
    params.push(input.name);
  }
  if (input.color !== undefined) {
    assignments.push(`color = ?`);
    params.push(input.color);
  }
  assignments.push(`updated_at = ?`);
  params.push(now);

  await db
    .prepare(`UPDATE tags SET ${assignments.join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...params, tagId, userId)
    .run();

  const updated = await getTag(db, userId, tagId);
  if (!updated) throw ApiError.internal("更新标签失败");
  return updated;
}

export async function deleteTag(db: Db, userId: string, tagId: string): Promise<void> {
  const existing = await getTag(db, userId, tagId);
  if (!existing) throw ApiError.notFound("标签不存在");

  const linked = await db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM transaction_tags tt
         JOIN transactions t ON t.id = tt.transaction_id
        WHERE tt.tag_id = ? AND t.user_id = ? AND t.deleted_at IS NULL`,
    )
    .bind(tagId, userId)
    .first<{ count: number }>();
  if ((linked?.count ?? 0) > 0) {
    throw ApiError.badRequest("该标签已被账目使用，无法删除");
  }

  await db.prepare(`DELETE FROM tags WHERE id = ? AND user_id = ?`).bind(tagId, userId).run();
}