import type { CategoryRecord, Db } from "../db/types";
import { ApiError } from "../http/errors";
import { allRows, nowMs } from "./common";
import type { CreateCategoryInput, UpdateCategoryInput } from "../validation/schemas";

/**
 * 分类服务。
 * 系统内置分类（user_id IS NULL）对所有用户可见且只读，用户自定义分类归属其本人。
 */

export async function listCategories(
  db: Db,
  userId: string,
  options: { kind?: "expense" | "income"; includeArchived?: boolean } = {},
): Promise<CategoryRecord[]> {
  const conditions = [`(user_id IS NULL OR user_id = ?)`];
  const params: unknown[] = [userId];

  if (options.kind) {
    conditions.push(`kind = ?`);
    params.push(options.kind);
  }
  if (!options.includeArchived) {
    conditions.push(`archived_at IS NULL`);
  }

  return allRows<CategoryRecord>(
    db
      .prepare(
        `SELECT * FROM categories
          WHERE ${conditions.join(" AND ")}
          ORDER BY kind ASC, sort_order ASC, name ASC`,
      )
      .bind(...params),
  );
}

export async function getCategory(
  db: Db,
  userId: string,
  categoryId: string,
): Promise<CategoryRecord | null> {
  return db
    .prepare(`SELECT * FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)`)
    .bind(categoryId, userId)
    .first<CategoryRecord>();
}

/** 仅允许用户修改自己创建的分类 */
async function getOwnCategory(db: Db, userId: string, categoryId: string): Promise<CategoryRecord> {
  const category = await db
    .prepare(`SELECT * FROM categories WHERE id = ? AND user_id = ?`)
    .bind(categoryId, userId)
    .first<CategoryRecord>();
  if (!category) {
    throw ApiError.notFound("分类不存在，或该分类为系统内置分类不可修改");
  }
  return category;
}

export async function createCategory(
  db: Db,
  userId: string,
  input: CreateCategoryInput,
  now = nowMs(),
): Promise<CategoryRecord> {
  const duplicated = await db
    .prepare(`SELECT id FROM categories WHERE user_id = ? AND kind = ? AND name = ?`)
    .bind(userId, input.kind, input.name)
    .first<{ id: string }>();
  if (duplicated) throw ApiError.conflict("已存在同名分类");

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO categories
         (id, user_id, name, kind, icon, color, sort_order, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(id, userId, input.name, input.kind, input.icon, input.color, input.sortOrder, now, now)
    .run();

  const created = await getCategory(db, userId, id);
  if (!created) throw ApiError.internal("创建分类失败");
  return created;
}

export async function updateCategory(
  db: Db,
  userId: string,
  categoryId: string,
  input: UpdateCategoryInput,
  now = nowMs(),
): Promise<CategoryRecord> {
  await getOwnCategory(db, userId, categoryId);

  const assignments: string[] = [];
  const params: unknown[] = [];
  const push = (column: string, value: unknown) => {
    assignments.push(`${column} = ?`);
    params.push(value);
  };

  if (input.name !== undefined) push("name", input.name);
  if (input.icon !== undefined) push("icon", input.icon);
  if (input.color !== undefined) push("color", input.color);
  if (input.sortOrder !== undefined) push("sort_order", input.sortOrder);
  push("updated_at", now);

  await db
    .prepare(`UPDATE categories SET ${assignments.join(", ")} WHERE id = ? AND user_id = ?`)
    .bind(...params, categoryId, userId)
    .run();

  const updated = await getCategory(db, userId, categoryId);
  if (!updated) throw ApiError.internal("更新分类失败");
  return updated;
}

/** 归档分类：保留历史账目的分类归属，仅从记账选择器中移除 */
export async function archiveCategory(
  db: Db,
  userId: string,
  categoryId: string,
  archived: boolean,
  now = nowMs(),
): Promise<CategoryRecord> {
  await getOwnCategory(db, userId, categoryId);

  await db
    .prepare(`UPDATE categories SET archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
    .bind(archived ? now : null, now, categoryId, userId)
    .run();

  const updated = await getCategory(db, userId, categoryId);
  if (!updated) throw ApiError.internal("更新分类状态失败");
  return updated;
}

/** 校验账目引用的分类对当前用户可见，防止越权引用他人分类 */
export async function assertCategoryAccessible(
  db: Db,
  userId: string,
  categoryId: string,
): Promise<CategoryRecord> {
  const category = await getCategory(db, userId, categoryId);
  if (!category) throw ApiError.badRequest("所选分类不存在");
  if (category.archived_at !== null) throw ApiError.badRequest("所选分类已归档");
  return category;
}