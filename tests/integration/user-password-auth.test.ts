import { beforeEach, describe, expect, it } from "vitest";
import type { Db, Env } from "@/server/db/types";
import { createTestDb } from "../helpers/d1";
import { userDto } from "@/server/http/serialize";
import {
  authenticateUserWithPassword,
  getUserByUsername,
  registerUserWithPassword,
  upsertWechatUser,
} from "@/server/services/users";

const PASSWORD = "Demo1234";

let db: Db;
let raw: ReturnType<typeof createTestDb>["raw"];
let env: Env;

const makeRequest = () =>
  new Request("https://ledger.example.com/api/auth/login", {
    method: "POST",
    headers: { "user-agent": "vitest", "cf-connecting-ip": "1.2.3.4" },
  });

beforeEach(() => {
  ({ db, raw } = createTestDb());
  env = {
    DB: db,
    AUTH_JWT_SECRET: "user-secret",
    ADMIN_JWT_SECRET: "admin-secret",
    USER_PBKDF2_ITERATIONS: "1000",
  };
});

async function register(username = "demo") {
  return registerUserWithPassword(db, env, { username, password: PASSWORD }, makeRequest());
}

describe("registerUserWithPassword", () => {
  it("注册成功：签发用户会话、初始化默认账户、用户名归一为小写", async () => {
    const result = await register("DemoUser");

    expect(result.user.username).toBe("demouser");
    expect(result.user.password_hash).toMatch(/^pbkdf2\$sha256\$1000\$/);
    expect(result.user.openid).toBeNull();
    expect(result.user.failed_attempts).toBe(0);
    expect(result.token.split(".")).toHaveLength(3);

    const session = raw
      .prepare("SELECT principal_type, principal_id FROM sessions WHERE id = ?")
      .get(result.sessionId) as { principal_type: string; principal_id: string };
    expect(session.principal_type).toBe("user");
    expect(session.principal_id).toBe(result.user.id);

    const accounts = raw
      .prepare("SELECT COUNT(*) AS count FROM accounts WHERE user_id = ?")
      .get(result.user.id) as { count: number };
    expect(accounts.count).toBe(3);

    // UserDto 白名单必须过滤掉凭据字段
    const dto = userDto(result.user) as unknown as Record<string, unknown>;
    expect(dto).not.toHaveProperty("password_hash");
    expect(dto).not.toHaveProperty("username");
    expect(dto).not.toHaveProperty("openid");
  });

  it("昵称缺省时回落到用户名", async () => {
    const result = await register("demo");
    expect(result.user.nickname).toBe("demo");
  });

  it("重复用户名（含大小写差异）返回 409", async () => {
    await register("demo");
    await expect(register("DEMO")).rejects.toMatchObject({ status: 409, code: "conflict" });
  });

  it("弱口令被拒绝", async () => {
    await expect(
      registerUserWithPassword(db, env, { username: "weak", password: "short" }, makeRequest()),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("authenticateUserWithPassword", () => {
  it("口令正确时签发会话并重置失败计数", async () => {
    const created = await register("demo");

    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        authenticateUserWithPassword(
          db,
          env,
          { username: "demo", password: "wrong" },
          makeRequest(),
        ),
      ).rejects.toMatchObject({ status: 401 });
    }
    expect((await getUserByUsername(db, "demo"))?.failed_attempts).toBe(2);

    const result = await authenticateUserWithPassword(
      db,
      env,
      { username: "demo", password: PASSWORD },
      makeRequest(),
    );
    expect(result.user.id).toBe(created.user.id);
    expect(result.user.failed_attempts).toBe(0);
    expect(result.user.locked_until).toBeNull();

    const session = raw
      .prepare("SELECT principal_type FROM sessions WHERE id = ?")
      .get(result.sessionId) as { principal_type: string };
    expect(session.principal_type).toBe("user");
  });

  it("用户名不区分大小写", async () => {
    await register("demo");
    const result = await authenticateUserWithPassword(
      db,
      env,
      { username: "DEMO", password: PASSWORD },
      makeRequest(),
    );
    expect(result.user.username).toBe("demo");
  });

  it("连续 5 次错误后锁定，第 6 次即使用正确口令也拒绝", async () => {
    await register("demo");

    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(
        authenticateUserWithPassword(
          db,
          env,
          { username: "demo", password: "wrong" },
          makeRequest(),
        ),
      ).rejects.toMatchObject({ status: 401 });
    }

    await expect(
      authenticateUserWithPassword(db, env, { username: "demo", password: "wrong" }, makeRequest()),
    ).rejects.toMatchObject({ status: 429, code: "too_many_requests" });

    const locked = await getUserByUsername(db, "demo");
    expect(locked?.failed_attempts).toBe(5);
    expect(locked?.locked_until ?? 0).toBeGreaterThan(Date.now());

    await expect(
      authenticateUserWithPassword(db, env, { username: "demo", password: PASSWORD }, makeRequest()),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("用户名不存在时返回统一 401 并写审计日志", async () => {
    await expect(
      authenticateUserWithPassword(db, env, { username: "ghost", password: PASSWORD }, makeRequest()),
    ).rejects.toMatchObject({ status: 401 });

    const logs = raw
      .prepare("SELECT action, detail FROM audit_logs WHERE action = ?")
      .all("user.login.failed") as Array<{ action: string; detail: string }>;
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0].detail)).toEqual({ reason: "unknown_username" });
  });

  it("纯微信账号（无口令）返回统一 401 并在审计中标记原因", async () => {
    const wechat = await upsertWechatUser(db, {
      openid: "openid-1",
      unionid: null,
      nickname: "微信用户",
      avatarUrl: null,
    });
    // 手工补一个用户名但保留 password_hash = NULL，模拟「有用户名却未设密码」的账号
    raw.prepare("UPDATE users SET username = ? WHERE id = ?").run("wechat", wechat.id);

    await expect(
      authenticateUserWithPassword(db, env, { username: "wechat", password: PASSWORD }, makeRequest()),
    ).rejects.toMatchObject({ status: 401 });

    const logs = raw
      .prepare("SELECT detail FROM audit_logs WHERE action = ?")
      .all("user.login.failed") as Array<{ detail: string }>;
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0].detail)).toEqual({ reason: "password_not_set" });
  });

  it("停用的用户被拒绝", async () => {
    const created = await register("demo");
    raw.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(created.user.id);

    await expect(
      authenticateUserWithPassword(db, env, { username: "demo", password: PASSWORD }, makeRequest()),
    ).rejects.toMatchObject({ status: 403 });
  });
});
