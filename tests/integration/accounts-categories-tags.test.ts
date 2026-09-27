import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { createTestDb } from "../helpers/d1";
import { upsertWechatUser } from "@/server/services/users";
import {
  archiveAccount,
  createAccount,
  getAccount,
  listAccounts,
  updateAccount,
} from "@/server/services/accounts";
import {
  archiveCategory,
  createCategory,
  getCategory,
  listCategories,
  updateCategory,
} from "@/server/services/categories";
import { createTag, deleteTag, getTag, listTags, updateTag } from "@/server/services/tags";

const NOW = Date.UTC(2026, 8, 27, 16, 30);
const SYSTEM_EXPENSE_CATEGORY = "cat_sys_expense_food";

let db: Db;
let raw: ReturnType<typeof createTestDb>["raw"];
let userId: string;

beforeEach(async () => {
  ({ db, raw } = createTestDb());
  const user = await upsertWechatUser(
    db,
    { openid: "openid-a", unionid: null, nickname: "小王", avatarUrl: null },
    NOW,
  );
  userId = user.id;
});

describe("accounts", () => {
  it("创建并按分保存初始余额", async () => {
    const account = await createAccount(db, userId, {
      name: "招商银行",
      type: "bank",
      icon: "credit-card",
      initialBalance: "500.00",
      sortOrder: 1,
    });
    expect(account.initial_balance_cents).toBe(50000);
    expect(account.archived_at).toBeNull();
    expect((await listAccounts(db, userId)).map((item) => item.id)).toContain(account.id);
  });

  it("更新名称与初始余额", async () => {
    const account = await createAccount(db, userId, {
      name: "招商银行",
      type: "bank",
      icon: "credit-card",
      sortOrder: 1,
    });
    const updated = await updateAccount(db, userId, account.id, { name: "招行", initialBalance: "600.00" }, NOW);
    expect(updated.name).toBe("招行");
    expect(updated.initial_balance_cents).toBe(60000);
  });

  it("归档后默认列表不含，includeArchived 才含", async () => {
    const account = await createAccount(db, userId, {
      name: "招商银行",
      type: "bank",
      icon: "credit-card",
      sortOrder: 1,
    });
    const archived = await archiveAccount(db, userId, account.id, true, NOW);
    expect(archived.archived_at).toBe(NOW);

    expect((await listAccounts(db, userId)).map((item) => item.id)).not.toContain(account.id);
    expect((await listAccounts(db, userId, { includeArchived: true })).map((item) => item.id)).toContain(account.id);

    // 恢复
    const restored = await archiveAccount(db, userId, account.id, false, NOW);
    expect(restored.archived_at).toBeNull();
  });

  it("至少保留一个可用账户", async () => {
    const accounts = await listAccounts(db, userId); // 默认 3 个
    expect(accounts).toHaveLength(3);
    await archiveAccount(db, userId, accounts[0].id, true, NOW);
    await archiveAccount(db, userId, accounts[1].id, true, NOW);
    await expect(archiveAccount(db, userId, accounts[2].id, true, NOW)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("跨用户不可访问他人账户", async () => {
    const account = await createAccount(db, userId, {
      name: "招商银行",
      type: "bank",
      icon: "credit-card",
      sortOrder: 1,
    });
    const other = await upsertWechatUser(
      db,
      { openid: "openid-b", unionid: null, nickname: "b", avatarUrl: null },
      NOW,
    );
    expect(await getAccount(db, other.id, account.id)).toBeNull();
    await expect(updateAccount(db, other.id, account.id, { name: "x" }, NOW)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("categories", () => {
  it("同名同类型分类冲突，不同类型可共存", async () => {
    await createCategory(db, userId, { name: "宠物", kind: "expense", icon: "tag", color: "#64748b", sortOrder: 0 });
    await expect(
      createCategory(db, userId, { name: "宠物", kind: "expense", icon: "tag", color: "#64748b", sortOrder: 0 }),
    ).rejects.toMatchObject({ status: 409 });
    // 收入下同名允许
    const income = await createCategory(db, userId, {
      name: "宠物",
      kind: "income",
      icon: "tag",
      color: "#64748b",
      sortOrder: 0,
    });
    expect(income.kind).toBe("income");
  });

  it("列表同时包含系统分类与自定义分类", async () => {
    await createCategory(db, userId, { name: "宠物", kind: "expense", icon: "tag", color: "#64748b", sortOrder: 0 });
    const all = await listCategories(db, userId);
    expect(all.some((item) => item.id === SYSTEM_EXPENSE_CATEGORY)).toBe(true);
    expect(all.some((item) => item.name === "宠物" && item.user_id === userId)).toBe(true);
  });

  it("系统分类不可修改", async () => {
    expect(await getCategory(db, userId, SYSTEM_EXPENSE_CATEGORY)).not.toBeNull();
    await expect(
      updateCategory(db, userId, SYSTEM_EXPENSE_CATEGORY, { name: "改名" }, NOW),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("归档自定义分类后默认列表不含", async () => {
    const category = await createCategory(db, userId, {
      name: "宠物",
      kind: "expense",
      icon: "tag",
      color: "#64748b",
      sortOrder: 0,
    });
    await archiveCategory(db, userId, category.id, true, NOW);
    expect((await listCategories(db, userId)).map((item) => item.id)).not.toContain(category.id);
    expect(
      (await listCategories(db, userId, { includeArchived: true })).map((item) => item.id),
    ).toContain(category.id);
  });
});

describe("tags", () => {
  it("创建标签并去重", async () => {
    const tag = await createTag(db, userId, { name: "出差", color: "#ff0000" });
    expect(tag.name).toBe("出差");
    expect(tag.color).toBe("#ff0000");

    await expect(createTag(db, userId, { name: "出差", color: "#00ff00" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("重命名冲突时抛错", async () => {
    await createTag(db, userId, { name: "出差", color: "#ff0000" });
    const second = await createTag(db, userId, { name: "报销", color: "#00ff00" });
    await expect(updateTag(db, userId, second.id, { name: "出差" }, NOW)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("删除为物理删除", async () => {
    const tag = await createTag(db, userId, { name: "出差", color: "#ff0000" });
    await deleteTag(db, userId, tag.id);
    expect(await getTag(db, userId, tag.id)).toBeNull();
    expect((await listTags(db, userId)).map((item) => item.id)).not.toContain(tag.id);
    const row = raw.prepare("SELECT id FROM tags WHERE id = ?").get(tag.id);
    expect(row).toBeUndefined();

    await expect(deleteTag(db, userId, tag.id)).rejects.toMatchObject({ status: 404 });
  });
});