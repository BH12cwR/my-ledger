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
  getTransactionDateRange,
  getTransactionsSummary,
  listTransactions,
  refundTransaction,
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

  it("sort=amount_desc / amount_asc 按金额排序", async () => {
    const desc = await listTransactions(db, userId, q({ sort: "amount_desc" }));
    expect(desc.items.map((item) => item.amount_cents)).toEqual([5000, 3000, 2000, 1000]);

    const asc = await listTransactions(db, userId, q({ sort: "amount_asc" }));
    expect(asc.items.map((item) => item.amount_cents)).toEqual([1000, 2000, 3000, 5000]);
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

  it("按账号过滤同时命中转出与转入（转账对两端都算）", async () => {
    const [from, to] = await listAccounts(db, userId);
    await createTransaction(
      db,
      userId,
      {
        kind: "transfer",
        amount: "30.00",
        accountId: from.id,
        toAccountId: to.id,
        happenedOn: "2026-09-12",
      },
      NOW,
    );

    // 只匹配 account_id 会让流入 to 的转账凭空消失，与账户余额的双向下账对不上
    const outgoing = await listTransactions(db, userId, q({ accountId: from.id }));
    const incoming = await listTransactions(db, userId, q({ accountId: to.id }));
    expect(outgoing.total).toBe(1);
    expect(incoming.total).toBe(1);
    expect(outgoing.items[0].to_account_name).toBe(to.name);

    const summary = await getTransactionsSummary(db, userId, { accountId: to.id });
    expect(summary.transferCents).toBe(3000);
    expect(summary.total).toBe(1);
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

describe("搜索：关键字匹配金额与排序", () => {
  let userId: string;

  beforeEach(async () => {
    const user = await makeUser("openid-a");
    userId = user.id;
    await createTransaction(
      db,
      userId,
      { kind: "expense", amount: "19.50", note: "煎饺油条豆浆", happenedOn: "2026-09-05" },
      NOW,
    );
    await createTransaction(
      db,
      userId,
      { kind: "expense", amount: "344.02", note: "聚餐", happenedOn: "2026-09-06" },
      NOW,
    );
    await createTransaction(
      db,
      userId,
      { kind: "expense", amount: "10.00", note: "迅雷", happenedOn: "2026-09-07" },
      NOW,
    );
  });

  it("关键字按「元」匹配金额，整数与小数都命中", async () => {
    const byDecimal = await listTransactions(db, userId, q({ keyword: "19.5" }));
    expect(byDecimal.total).toBe(1);
    expect(byDecimal.items[0].amount_cents).toBe(1950);

    const byInteger = await listTransactions(db, userId, q({ keyword: "344" }));
    expect(byInteger.total).toBe(1);
    expect(byInteger.items[0].amount_cents).toBe(34402);
  });

  it("关键字仍匹配备注，且不会因金额分支而误伤", async () => {
    const list = await listTransactions(db, userId, q({ keyword: "迅雷" }));
    expect(list.total).toBe(1);
    expect(list.items[0].note).toBe("迅雷");
  });

  it("sort=asc 按时间正序，缺省时从新到旧", async () => {
    const ascending = await listTransactions(db, userId, q({ sort: "asc" }));
    expect(ascending.items.map((item) => item.happened_on)).toEqual([
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
    ]);

    const descending = await listTransactions(db, userId, q({ sort: "desc" }));
    expect(descending.items.map((item) => item.happened_on)).toEqual([
      "2026-09-07",
      "2026-09-06",
      "2026-09-05",
    ]);
  });
});

describe("getTransactionsSummary", () => {
  const RANGE = { from: "2026-09-01", to: "2026-09-30" };
  let userId: string;
  let expenseId: string;

  beforeEach(async () => {
    const user = await makeUser("openid-a");
    userId = user.id;
    const [from, to] = await listAccounts(db, user.id);
    const category = await makeCategory(user.id, "伙食", "expense");

    expenseId = (
      await createTransaction(
        db,
        userId,
        { kind: "expense", amount: "100.00", categoryId: category.id, happenedOn: "2026-09-05" },
        NOW,
      )
    ).id;
    await createTransaction(
      db,
      userId,
      { kind: "income", amount: "300.00", happenedOn: "2026-09-06" },
      NOW,
    );
    await createTransaction(
      db,
      userId,
      {
        kind: "transfer",
        amount: "50.00",
        accountId: from.id,
        toAccountId: to.id,
        happenedOn: "2026-09-07",
      },
      NOW,
    );
    await refundTransaction(db, userId, expenseId, NOW);
  });

  it("五项汇总口径正确，且 total 与列表总数一致", async () => {
    const summary = await getTransactionsSummary(db, userId, RANGE);

    expect(summary.expenseCents).toBe(10000);
    // 支出 100 + 收入 300 + 退款生成的等额收入 100
    expect(summary.incomeCents).toBe(40000);
    expect(summary.netCents).toBe(30000);
    expect(summary.transferCents).toBe(5000);
    expect(summary.refundCents).toBe(10000);
    expect(summary.total).toBe(4);

    const list = await listTransactions(db, userId, { ...RANGE, page: 1, pageSize: 20 });
    expect(list.total).toBe(summary.total);
  });

  it("转账单独成项、不并入收支；退款不受类型筛选影响", async () => {
    const summary = await getTransactionsSummary(db, userId, { ...RANGE, kind: "transfer" });

    expect(summary.total).toBe(1);
    expect(summary.transferCents).toBe(5000);
    expect(summary.expenseCents).toBe(0);
    expect(summary.incomeCents).toBe(0);
    // 退款恒为收入记录，带上 kind 过滤就永远统计不到，因此汇总里的退款口忽略类型
    expect(summary.refundCents).toBe(10000);
  });

  it("时间区间外与已删除的账目都不计入", async () => {
    await deleteTransaction(db, userId, expenseId, NOW + 1000);

    const summary = await getTransactionsSummary(db, userId, RANGE);
    // 支出被删掉，连带其退款记录一并软删除
    expect(summary.expenseCents).toBe(0);
    expect(summary.incomeCents).toBe(30000);
    expect(summary.refundCents).toBe(0);

    const outside = await getTransactionsSummary(db, userId, {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(outside.total).toBe(0);
  });

  it("关键字与类型条件下的汇总与列表同步收窄", async () => {
    const summary = await getTransactionsSummary(db, userId, { ...RANGE, keyword: "300" });
    expect(summary.total).toBe(1);
    expect(summary.incomeCents).toBe(30000);
    expect(summary.transferCents).toBe(0);
  });
});

describe("getTransactionDateRange", () => {
  it("返回最早 / 最晚业务日", async () => {
    const user = await makeUser("openid-a");
    expect(await getTransactionDateRange(db, user.id)).toEqual({ firstDay: null, lastDay: null });

    await createTransaction(
      db,
      user.id,
      { kind: "expense", amount: "1.00", happenedOn: "2025-03-04" },
      NOW,
    );
    await createTransaction(
      db,
      user.id,
      { kind: "expense", amount: "2.00", happenedOn: "2026-09-07" },
      NOW,
    );

    expect(await getTransactionDateRange(db, user.id)).toEqual({
      firstDay: "2025-03-04",
      lastDay: "2026-09-07",
    });
  });

  it("只统计当前用户且排除软删除的账目", async () => {
    const userA = await makeUser("openid-a");
    const userB = await makeUser("openid-b");
    const mine = await createTransaction(
      db,
      userA.id,
      { kind: "expense", amount: "1.00", happenedOn: "2025-03-04" },
      NOW,
    );
    await createTransaction(
      db,
      userA.id,
      { kind: "expense", amount: "2.00", happenedOn: "2026-09-07" },
      NOW,
    );
    await createTransaction(
      db,
      userB.id,
      { kind: "expense", amount: "3.00", happenedOn: "2020-01-01" },
      NOW,
    );

    // 他人更早的账目不应把区间的起点拉走
    expect(await getTransactionDateRange(db, userA.id)).toEqual({
      firstDay: "2025-03-04",
      lastDay: "2026-09-07",
    });

    await deleteTransaction(db, userA.id, mine.id, NOW + 1000);
    expect(await getTransactionDateRange(db, userA.id)).toEqual({
      firstDay: "2026-09-07",
      lastDay: "2026-09-07",
    });
  });
});