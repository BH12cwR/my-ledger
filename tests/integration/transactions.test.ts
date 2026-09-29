import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { ApiError } from "@/server/http/errors";
import { createTestDb } from "../helpers/d1";
import { upsertWechatUser } from "@/server/services/users";
import { createCategory } from "@/server/services/categories";
import { createTag } from "@/server/services/tags";
import { listAccounts } from "@/server/services/accounts";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from "@/server/services/transactions";
import type { ListTransactionsQuery } from "@/server/validation/schemas";

const NOON_MS = 12 * 60 * 60 * 1000;
/** 固定基准时刻：2026-09-27T16:30Z 属于业务日 2026-09-28 */
const NOW = Date.UTC(2026, 8, 27, 16, 30);

let db: Db;
let raw: ReturnType<typeof createTestDb>["raw"];

const q = (over: Partial<ListTransactionsQuery> = {}): ListTransactionsQuery => ({
  page: 1,
  pageSize: 20,
  ...over,
});

async function makeUser(openid: string) {
  return upsertWechatUser(db, { openid, unionid: null, nickname: openid, avatarUrl: null }, NOW);
}

async function makeCategory(userId: string, name: string, kind: "expense" | "income") {
  return createCategory(db, userId, {
    name,
    kind,
    icon: "tag",
    color: "#64748b",
    sortOrder: 0,
  });
}

beforeEach(() => {
  ({ db, raw } = createTestDb());
});

describe("createTransaction", () => {
  it("写入后可按「分」读回，业务日与标签关联均正确", async () => {
    const user = await makeUser("openid-a");
    const category = await makeCategory(user.id, "伙食", "expense");
    const tag = await createTag(db, user.id, { name: "出差", color: "#ff0000" });
    const account = (await listAccounts(db, user.id))[0];

    const created = await createTransaction(
      db,
      user.id,
      {
        kind: "expense",
        amount: "12.34",
        categoryId: category.id,
        accountId: account.id,
        note: "午餐",
        happenedOn: "2026-09-20",
        tagIds: [tag.id],
      },
      NOW,
    );

    expect(created.amount_cents).toBe(1234);
    expect(created.happened_on).toBe("2026-09-20");
    // 历史日期落在当日中午，规避时区边界抖动
    expect(created.happened_at).toBe(Date.UTC(2026, 8, 19, 16) + NOON_MS);
    expect(created.tags).toEqual(["出差"]);

    const reloaded = await getTransaction(db, user.id, created.id);
    expect(reloaded?.category_name).toBe("伙食");
    expect(reloaded?.account_name).toBe(account.name);

    const row = raw
      .prepare("SELECT amount_cents, happened_on FROM transactions WHERE id = ?")
      .get(created.id) as { amount_cents: number; happened_on: string };
    expect(row.amount_cents).toBe(1234);
    expect(row.happened_on).toBe("2026-09-20");
  });

  it("未指定业务日时按当前时刻落到业务日", async () => {
    const user = await makeUser("openid-b");
    const created = await createTransaction(
      db,
      user.id,
      { kind: "expense", amount: "1.00" },
      NOW,
    );
    expect(created.happened_on).toBe("2026-09-28");
    expect(created.happened_at).toBe(NOW);
  });

  it("分类类型与账目类型不一致时抛 400", async () => {
    const user = await makeUser("openid-c");
    const expenseCategory = await makeCategory(user.id, "伙食", "expense");

    await expect(
      createTransaction(
        db,
        user.id,
        { kind: "income", amount: "1.00", categoryId: expenseCategory.id },
        NOW,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("多租户隔离", () => {
  it("用户 B 无法读取或列出用户 A 的账目", async () => {
    const userA = await makeUser("openid-a");
    const created = await createTransaction(db, userA.id, { kind: "expense", amount: "5.00" }, NOW);

    const userB = await makeUser("openid-b");
    expect(await getTransaction(db, userB.id, created.id)).toBeNull();

    const list = await listTransactions(db, userB.id, q());
    expect(list.total).toBe(0);
    expect(list.items).toEqual([]);
  });
});

describe("listTransactions 过滤与分页", () => {
  let userId: string;
  let transport: string;
  let food: string;
  let salary: string;
  const ids: Record<string, string> = {};

  beforeEach(async () => {
    const user = await makeUser("openid-a");
    userId = user.id;
    transport = (await makeCategory(userId, "交通费", "expense")).id;
    food = (await makeCategory(userId, "餐饮费", "expense")).id;
    salary = (await makeCategory(userId, "工资", "income")).id;

    ids.t1 = (
      await createTransaction(
        db,
        userId,
        { kind: "expense", amount: "10.00", categoryId: transport, note: "地铁", happenedOn: "2026-09-01" },
        NOW,
      )
    ).id;
    ids.t2 = (
      await createTransaction(
        db,
        userId,
        { kind: "expense", amount: "20.00", categoryId: food, note: "晚餐", happenedOn: "2026-09-10" },
        NOW,
      )
    ).id;
    ids.t3 = (
      await createTransaction(
        db,
        userId,
        { kind: "income", amount: "50.00", categoryId: salary, note: "工资到账", happenedOn: "2026-09-10" },
        NOW,
      )
    ).id;
    ids.t4 = (
      await createTransaction(
        db,
        userId,
        { kind: "expense", amount: "30.00", categoryId: transport, note: "地铁月卡", happenedOn: "2026-09-20" },
        NOW,
      )
    ).id;
  });

  it("按 from/to 过滤业务日", async () => {
    const list = await listTransactions(db, userId, q({ from: "2026-09-05", to: "2026-09-15" }));
    expect(list.total).toBe(2);
    expect(list.items.map((item) => item.id).sort()).toEqual([ids.t2, ids.t3].sort());
  });

  it("按 kind 过滤", async () => {
    const list = await listTransactions(db, userId, q({ kind: "expense" }));
    expect(list.total).toBe(3);
    expect(list.items.every((item) => item.kind === "expense")).toBe(true);
  });

  it("keyword 同时匹配备注与分类名", async () => {
    const byNote = await listTransactions(db, userId, q({ keyword: "地铁" }));
    expect(byNote.total).toBe(2);
    expect(byNote.items.map((item) => item.id).sort()).toEqual([ids.t1, ids.t4].sort());

    const byCategoryName = await listTransactions(db, userId, q({ keyword: "餐饮费" }));
    expect(byCategoryName.total).toBe(1);
    expect(byCategoryName.items[0].id).toBe(ids.t2);
  });

  it("按账号过滤", async () => {
    const account = (await listAccounts(db, userId))[0];
    await createTransaction(
      db,
      userId,
      { kind: "expense", amount: "1.00", accountId: account.id, happenedOn: "2026-09-02" },
      NOW,
    );
    const list = await listTransactions(db, userId, q({ accountId: account.id }));
    expect(list.total).toBe(1);
  });

  it("分页返回 total / totalPages 且各页不重叠", async () => {
    const first = await listTransactions(db, userId, q({ page: 1, pageSize: 2 }));
    expect(first.total).toBe(4);
    expect(first.totalPages).toBe(2);
    expect(first.items).toHaveLength(2);

    const second = await listTransactions(db, userId, q({ page: 2, pageSize: 2 }));
    expect(second.items).toHaveLength(2);
    const firstIds = first.items.map((item) => item.id);
    const secondIds = second.items.map((item) => item.id);
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
  });
});

describe("updateTransaction", () => {
  it("可修改金额与分类", async () => {
    const user = await makeUser("openid-a");
    const transport = await makeCategory(user.id, "交通费", "expense");
    const food = await makeCategory(user.id, "餐饮费", "expense");
    const created = await createTransaction(
      db,
      user.id,
      { kind: "expense", amount: "10.00", categoryId: transport.id },
      NOW,
    );

    const updated = await updateTransaction(
      db,
      user.id,
      created.id,
      { amount: "99.99", categoryId: food.id },
      NOW + 1000,
    );
    expect(updated.amount_cents).toBe(9999);
    expect(updated.category_id).toBe(food.id);
    expect(updated.category_name).toBe("餐饮费");
  });

  it("改 kind 后与所选分类冲突时抛 400", async () => {
    const user = await makeUser("openid-a");
    const transport = await makeCategory(user.id, "交通费", "expense");
    const created = await createTransaction(
      db,
      user.id,
      { kind: "expense", amount: "10.00", categoryId: transport.id },
      NOW,
    );

    await expect(
      updateTransaction(db, user.id, created.id, { kind: "income", categoryId: transport.id }, NOW),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("更新不存在的账目抛 404", async () => {
    const user = await makeUser("openid-a");
    await expect(
      updateTransaction(db, user.id, "missing", { amount: "1.00" }, NOW),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("deleteTransaction", () => {
  it("软删除：查询不可见但数据库保留 deleted_at", async () => {
    const user = await makeUser("openid-a");
    const created = await createTransaction(db, user.id, { kind: "expense", amount: "8.00" }, NOW);

    await deleteTransaction(db, user.id, created.id, NOW + 5000);

    expect(await getTransaction(db, user.id, created.id)).toBeNull();
    const list = await listTransactions(db, user.id, q());
    expect(list.total).toBe(0);

    const row = raw
      .prepare("SELECT deleted_at FROM transactions WHERE id = ?")
      .get(created.id) as { deleted_at: number | null };
    expect(row).not.toBeNull();
    expect(row.deleted_at).toBe(NOW + 5000);
  });

  it("重复删除抛 404", async () => {
    const user = await makeUser("openid-a");
    const created = await createTransaction(db, user.id, { kind: "expense", amount: "8.00" }, NOW);
    await deleteTransaction(db, user.id, created.id, NOW);
    await expect(deleteTransaction(db, user.id, created.id, NOW)).rejects.toBeInstanceOf(ApiError);
  });
});

describe("转账", () => {
  it("创建转账：落库为单条记录，带转入账户且不含分类", async () => {
    const user = await makeUser("openid-a");
    const [from, to] = await listAccounts(db, user.id);

    const created = await createTransaction(
      db,
      user.id,
      { kind: "transfer", amount: "30.00", accountId: from.id, toAccountId: to.id, note: "转到微信" },
      NOW,
    );

    expect(created.kind).toBe("transfer");
    expect(created.amount_cents).toBe(3000);
    expect(created.account_id).toBe(from.id);
    expect(created.account_name).toBe(from.name);
    expect(created.to_account_id).toBe(to.id);
    expect(created.to_account_name).toBe(to.name);
    expect(created.category_id).toBeNull();
    expect(created.category_name).toBeNull();
  });

  it("缺转出/缺转入/同账户互转/携带分类均抛 400", async () => {
    const user = await makeUser("openid-a");
    const [from, to] = await listAccounts(db, user.id);
    const category = await makeCategory(user.id, "伙食", "expense");

    await expect(
      createTransaction(db, user.id, { kind: "transfer", amount: "1.00", toAccountId: to.id }, NOW),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createTransaction(db, user.id, { kind: "transfer", amount: "1.00", accountId: from.id }, NOW),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createTransaction(
        db,
        user.id,
        { kind: "transfer", amount: "1.00", accountId: from.id, toAccountId: from.id },
        NOW,
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createTransaction(
        db,
        user.id,
        { kind: "transfer", amount: "1.00", accountId: from.id, toAccountId: to.id, categoryId: category.id },
        NOW,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("非转账携带转入账户抛 400", async () => {
    const user = await makeUser("openid-a");
    const [, to] = await listAccounts(db, user.id);

    await expect(
      createTransaction(db, user.id, { kind: "expense", amount: "1.00", toAccountId: to.id }, NOW),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("转入账户不属于当前用户时抛 400", async () => {
    const userA = await makeUser("openid-a");
    const [fromA] = await listAccounts(db, userA.id);
    const userB = await makeUser("openid-b");
    const [accountB] = await listAccounts(db, userB.id);

    await expect(
      createTransaction(
        db,
        userA.id,
        { kind: "transfer", amount: "1.00", accountId: fromA.id, toAccountId: accountB.id },
        NOW,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("支出改为转账会清空分类并写入转入账户", async () => {
    const user = await makeUser("openid-a");
    const [from, to] = await listAccounts(db, user.id);
    const category = await makeCategory(user.id, "伙食", "expense");
    const created = await createTransaction(
      db,
      user.id,
      { kind: "expense", amount: "10.00", categoryId: category.id, accountId: from.id },
      NOW,
    );

    const updated = await updateTransaction(
      db,
      user.id,
      created.id,
      { kind: "transfer", toAccountId: to.id },
      NOW,
    );

    expect(updated.kind).toBe("transfer");
    expect(updated.category_id).toBeNull();
    expect(updated.category_name).toBeNull();
    expect(updated.to_account_id).toBe(to.id);
    expect(updated.to_account_name).toBe(to.name);
  });

  it("转账改为支出会清空转入账户", async () => {
    const user = await makeUser("openid-a");
    const [from, to] = await listAccounts(db, user.id);
    const category = await makeCategory(user.id, "伙食", "expense");
    const created = await createTransaction(
      db,
      user.id,
      { kind: "transfer", amount: "10.00", accountId: from.id, toAccountId: to.id },
      NOW,
    );

    const updated = await updateTransaction(
      db,
      user.id,
      created.id,
      { kind: "expense", categoryId: category.id },
      NOW,
    );

    expect(updated.kind).toBe("expense");
    expect(updated.to_account_id).toBeNull();
    expect(updated.to_account_name).toBeNull();
    expect(updated.category_id).toBe(category.id);
  });

  it("只改备注时保留转入账户", async () => {
    const user = await makeUser("openid-a");
    const [from, to] = await listAccounts(db, user.id);
    const created = await createTransaction(
      db,
      user.id,
      { kind: "transfer", amount: "10.00", accountId: from.id, toAccountId: to.id },
      NOW,
    );

    const updated = await updateTransaction(db, user.id, created.id, { note: "补个说明" }, NOW);

    expect(updated.note).toBe("补个说明");
    expect(updated.kind).toBe("transfer");
    expect(updated.to_account_id).toBe(to.id);
  });

  it("编辑转账时把转入账户改成转出账户抛 400", async () => {
    const user = await makeUser("openid-a");
    const [from, to] = await listAccounts(db, user.id);
    const created = await createTransaction(
      db,
      user.id,
      { kind: "transfer", amount: "10.00", accountId: from.id, toAccountId: to.id },
      NOW,
    );

    await expect(
      updateTransaction(db, user.id, created.id, { toAccountId: from.id }, NOW),
    ).rejects.toMatchObject({ status: 400 });
  });
});