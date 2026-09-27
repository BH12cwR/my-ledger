import { beforeEach, describe, expect, it } from "vitest";
import type { Db, Env } from "@/server/db/types";
import { createTestDb } from "../helpers/d1";
import { adminDto } from "@/server/http/serialize";
import {
  authenticateAdmin,
  createAdminAccount,
  getAdminById,
  getAdminByUsername,
  getOverviewMetrics,
  setAdminStatus,
} from "@/server/services/admin";

const PASSWORD = "Str0ng-Passw0rd!";

let db: Db;
let raw: ReturnType<typeof createTestDb>["raw"];
let env: Env;

const makeRequest = () =>
  new Request("https://ledger.example.com/api/admin/login", {
    method: "POST",
    headers: { "user-agent": "vitest", "cf-connecting-ip": "1.2.3.4" },
  });

beforeEach(() => {
  ({ db, raw } = createTestDb());
  env = {
    DB: db,
    AUTH_JWT_SECRET: "user-secret",
    ADMIN_JWT_SECRET: "admin-secret",
    ADMIN_PBKDF2_ITERATIONS: "1000",
  };
});

async function makeAdmin(username = "root", role: "super_admin" | "admin" | "auditor" = "admin") {
  return createAdminAccount(db, env, { username, displayName: "管理员", password: PASSWORD, role });
}

describe("createAdminAccount", () => {
  it("按环境变量迭代次数生成 PBKDF2 哈希", async () => {
    const admin = await makeAdmin();
    expect(admin.username).toBe("root");
    expect(admin.role).toBe("admin");
    expect(admin.status).toBe("active");
    expect(admin.failed_attempts).toBe(0);
    expect(admin.locked_until).toBeNull();
    expect(admin.must_change_password).toBe(0);
    expect(admin.password_hash).toMatch(/^pbkdf2\$sha256\$1000\$/);
  });

  it("弱口令被拒绝，重复用户名冲突", async () => {
    await expect(
      createAdminAccount(db, env, { username: "weak", displayName: "x", password: "short" }),
    ).rejects.toMatchObject({ status: 400 });

    await makeAdmin("root");
    await expect(makeAdmin("root")).rejects.toMatchObject({ status: 409 });
  });
});

describe("authenticateAdmin", () => {
  it("口令正确时签发会话并重置失败计数", async () => {
    const admin = await makeAdmin();
    const result = await authenticateAdmin(
      db,
      env,
      { username: "root", password: PASSWORD },
      makeRequest(),
      3600,
    );

    expect(result.token.split(".")).toHaveLength(3);
    expect(result.sessionId).toBeTruthy();
    expect(result.admin.failed_attempts).toBe(0);
    expect(result.admin.locked_until).toBeNull();

    const session = raw
      .prepare("SELECT principal_type, principal_id FROM sessions WHERE id = ?")
      .get(result.sessionId) as { principal_type: string; principal_id: string };
    expect(session.principal_type).toBe("admin");
    expect(session.principal_id).toBe(admin.id);
  });

  it("连续 5 次错误后锁定，第 6 次即使用正确口令也拒绝", async () => {
    await makeAdmin();

    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(
        authenticateAdmin(db, env, { username: "root", password: "wrong" }, makeRequest(), 3600),
      ).rejects.toMatchObject({ status: 401 });
    }

    await expect(
      authenticateAdmin(db, env, { username: "root", password: "wrong" }, makeRequest(), 3600),
    ).rejects.toMatchObject({ status: 429, code: "too_many_requests" });

    const locked = await getAdminByUsername(db, "root");
    expect(locked?.failed_attempts).toBe(5);
    expect(locked?.locked_until).not.toBeNull();
    expect(locked?.locked_until ?? 0).toBeGreaterThan(Date.now());

    await expect(
      authenticateAdmin(db, env, { username: "root", password: PASSWORD }, makeRequest(), 3600),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("用户名不存在时返回统一 401 并写审计日志", async () => {
    await expect(
      authenticateAdmin(db, env, { username: "ghost", password: PASSWORD }, makeRequest(), 3600),
    ).rejects.toMatchObject({ status: 401 });

    const logs = raw
      .prepare("SELECT action, detail FROM audit_logs WHERE action = ?")
      .all("admin.login.failed") as Array<{ action: string; detail: string }>;
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0].detail)).toEqual({ reason: "unknown_username" });
  });

  it("停用的管理员被拒绝", async () => {
    const admin = await makeAdmin();
    await setAdminStatus(db, admin.id, "disabled");
    await expect(
      authenticateAdmin(db, env, { username: "root", password: PASSWORD }, makeRequest(), 3600),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("must_change_password 会被如实映射到 DTO", async () => {
    const admin = await makeAdmin();
    expect(adminDto(admin).mustChangePassword).toBe(false);

    raw.prepare("UPDATE admin_users SET must_change_password = 1 WHERE id = ?").run(admin.id);
    const reloaded = await getAdminById(db, admin.id);
    expect(adminDto(reloaded!).mustChangePassword).toBe(true);
  });
});

describe("getOverviewMetrics", () => {
  it("空库上返回全 0 且不抛错", async () => {
    const metrics = await getOverviewMetrics(db, 7);
    expect(metrics.range.days).toBe(7);
    expect(metrics.users.total).toBe(0);
    expect(metrics.users.activeInRange).toBe(0);
    expect(metrics.transactions.total).toBe(0);
    expect(metrics.transactions.expenseCentsInRange).toBe(0);
    expect(metrics.sessions.activeNow).toBe(0);
    expect(metrics.admins.total).toBe(0);
  });
});