import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/types";
import { createTestDb } from "../helpers/d1";
import { ensureDefaultAccounts, setUserStatus, upsertWechatUser } from "@/server/services/users";
import { listAccounts } from "@/server/services/accounts";

const NOW = Date.UTC(2026, 8, 27, 16, 30);

let db: Db;
let raw: ReturnType<typeof createTestDb>["raw"];

beforeEach(() => {
  ({ db, raw } = createTestDb());
});

const profile = (
  openid: string,
  unionid: string | null,
  nickname: string,
  avatarUrl: string | null = null,
) => ({
  openid,
  unionid,
  nickname,
  avatarUrl,
});

describe("upsertWechatUser", () => {
  it("首次登录创建用户并初始化 3 个默认账户", async () => {
    const user = await upsertWechatUser(db, profile("openid-1", null, "小王"), NOW);

    expect(user.openid).toBe("openid-1");
    expect(user.status).toBe("active");
    expect(user.currency).toBe("CNY");
    expect(user.last_login_at).toBe(NOW);

    const accounts = await listAccounts(db, user.id);
    expect(accounts.map((account) => account.name)).toEqual(["现金", "微信钱包", "支付宝"]);
    expect(accounts.map((account) => account.type)).toEqual(["cash", "wechat", "alipay"]);
  });

  it("二次登录复用同一用户并更新 last_login_at 与昵称", async () => {
    const first = await upsertWechatUser(db, profile("openid-1", null, "小王"), NOW);
    // 已有账户时 ensureDefaultAccounts 不应重复创建
    await ensureDefaultAccounts(db, first.id, NOW);

    const later = NOW + 86_400_000;
    const second = await upsertWechatUser(db, profile("openid-1", null, "老王"), later);

    expect(second.id).toBe(first.id);
    expect(second.nickname).toBe("老王");
    expect(second.last_login_at).toBe(later);
    expect(await listAccounts(db, first.id)).toHaveLength(3);
  });

  it("按 unionid 归并同一开放平台下的不同 openid", async () => {
    const first = await upsertWechatUser(db, profile("openid-a", "union-1", "小王"), NOW);
    const second = await upsertWechatUser(db, profile("openid-b", "union-1", "小王"), NOW + 1000);

    expect(second.id).toBe(first.id);
    expect(second.unionid).toBe("union-1");

    // 落库结果正确：同一 user 复用了 unionid，openid 更新为新值
    const row = raw
      .prepare("SELECT openid, unionid FROM users WHERE id = ?")
      .get(first.id) as { openid: string; unionid: string };
    expect(row.openid).toBe("openid-b");
    expect(row.unionid).toBe("union-1");

    const count = raw.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
    expect(count.count).toBe(1);
  });

  it("更新分支的返回值与落库结果一致（含 unionid / avatarUrl）", async () => {
    const first = await upsertWechatUser(db, profile("openid-1", null, "小王"), NOW);

    const later = NOW + 1000;
    const second = await upsertWechatUser(
      db,
      profile("openid-1", "union-1", "小王", "https://avatar.example/1.png"),
      later,
    );

    expect(second.id).toBe(first.id);
    expect(second.openid).toBe("openid-1");
    expect(second.unionid).toBe("union-1");
    expect(second.avatar_url).toBe("https://avatar.example/1.png");
    expect(second.nickname).toBe("小王");
    expect(second.last_login_at).toBe(later);
    expect(second.updated_at).toBe(later);

    // 返回值应与库中真实状态一致
    const row = raw
      .prepare("SELECT openid, unionid, avatar_url, last_login_at FROM users WHERE id = ?")
      .get(first.id) as {
      openid: string;
      unionid: string | null;
      avatar_url: string | null;
      last_login_at: number;
    };
    expect(row.unionid).toBe(second.unionid);
    expect(row.avatar_url).toBe(second.avatar_url);
    expect(row.last_login_at).toBe(second.last_login_at);
  });

  it("更新分支：profile 未提供 unionid / avatarUrl 时保留库中旧值（COALESCE 语义）", async () => {
    await upsertWechatUser(
      db,
      profile("openid-1", "union-1", "小王", "https://avatar.example/1.png"),
      NOW,
    );

    const second = await upsertWechatUser(db, profile("openid-1", null, "老王"), NOW + 1000);

    expect(second.unionid).toBe("union-1");
    expect(second.avatar_url).toBe("https://avatar.example/1.png");
    expect(second.nickname).toBe("老王");
  });

  it("已停用账号登录抛 403", async () => {
    const user = await upsertWechatUser(db, profile("openid-1", null, "小王"), NOW);
    await setUserStatus(db, user.id, "disabled");

    await expect(
      upsertWechatUser(db, profile("openid-1", null, "小王"), NOW + 1000),
    ).rejects.toMatchObject({ status: 403 });
  });
});