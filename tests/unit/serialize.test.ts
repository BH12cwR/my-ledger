import { describe, expect, it } from "vitest";
import type { AdminRecord, AuditLogRecord, UserRecord } from "@/server/db/types";
import type { TransactionView } from "@/server/services/transactions";
import { adminDto, auditLogDto, transactionDto, userDto } from "@/server/http/serialize";

const baseUser: UserRecord = {
  id: "u1",
  openid: "openid-1",
  unionid: "unionid-1",
  username: "demo",
  password_hash: "pbkdf2$sha256$1000$salt$hash",
  failed_attempts: 0,
  locked_until: null,
  password_updated_at: null,
  nickname: "小王",
  avatar_url: "https://cdn.example.com/a.png",
  status: "active",
  currency: "CNY",
  timezone: "Asia/Shanghai",
  last_login_at: 1758902400000,
  created_at: 1758902400000,
  updated_at: 1758902400000,
};

const baseAdmin: AdminRecord = {
  id: "a1",
  username: "root",
  display_name: "超级管理员",
  password_hash: "pbkdf2$sha256$1000$salt$hash",
  role: "super_admin",
  status: "active",
  failed_attempts: 0,
  locked_until: null,
  must_change_password: 1,
  last_login_at: null,
  created_at: 1758902400000,
  updated_at: 1758902400000,
};

const baseTransaction: TransactionView = {
  id: "t1",
  user_id: "u1",
  account_id: "acc1",
  category_id: "c1",
  kind: "expense",
  amount_cents: 1234,
  currency: "CNY",
  note: "午餐",
  happened_at: 1758902400000,
  happened_on: "2026-09-27",
  transfer_peer_id: null,
  created_at: 1758902400000,
  updated_at: 1758902400000,
  deleted_at: null,
  category_name: "餐饮",
  category_icon: "utensils",
  category_color: "#f97316",
  account_name: "现金",
  account_type: "cash",
  tags: ["出差"],
};

describe("userDto", () => {
  it("只输出白名单字段", () => {
    expect(Object.keys(userDto(baseUser)).sort()).toEqual([
      "avatarUrl",
      "createdAt",
      "currency",
      "id",
      "lastLoginAt",
      "nickname",
      "status",
      "timezone",
    ]);
  });

  it("绝不泄露 openid / unionid", () => {
    const dto = userDto(baseUser);
    expect(dto).not.toHaveProperty("openid");
    expect(dto).not.toHaveProperty("unionid");
  });
});

describe("adminDto", () => {
  it("绝不泄露 password_hash", () => {
    const dto = adminDto(baseAdmin);
    expect(dto).not.toHaveProperty("password_hash");
    expect(dto).not.toHaveProperty("passwordHash");
  });

  it("把 must_change_password 转成布尔", () => {
    expect(adminDto(baseAdmin).mustChangePassword).toBe(true);
    expect(adminDto({ ...baseAdmin, must_change_password: 0 }).mustChangePassword).toBe(false);
  });
});

describe("auditLogDto", () => {
  const baseAudit: AuditLogRecord = {
    id: "log1",
    actor_type: "admin",
    actor_id: "a1",
    action: "admin.login.success",
    target_type: "admin_user",
    target_id: "a1",
    detail: null,
    ip: "1.2.3.4",
    user_agent: "vitest",
    created_at: 1758902400000,
  };

  it("合法 JSON 解析为对象", () => {
    const dto = auditLogDto({ ...baseAudit, detail: JSON.stringify({ reason: "unknown_username" }) });
    expect(dto.detail).toEqual({ reason: "unknown_username" });
  });

  it("非法 JSON 退化为 { raw }", () => {
    const dto = auditLogDto({ ...baseAudit, detail: "{not-json" });
    expect(dto.detail).toEqual({ raw: "{not-json" });
  });

  it("detail 为空时返回 null", () => {
    expect(auditLogDto(baseAudit).detail).toBeNull();
  });
});

describe("transactionDto", () => {
  it("普通查询不输出 userId / userNickname", () => {
    const dto = transactionDto(baseTransaction);
    expect(dto).not.toHaveProperty("userId");
    expect(dto).not.toHaveProperty("userNickname");
    expect(dto.tags).toEqual(["出差"]);
  });

  it("管理端查询（userNickname 已定义）输出 userId / userNickname", () => {
    const dto = transactionDto({ ...baseTransaction, user_nickname: "小王" });
    expect(dto.userId).toBe("u1");
    expect(dto.userNickname).toBe("小王");
  });

  it("userNickname 为 null 时同样输出（字段定义为 undefined 才省略）", () => {
    const dto = transactionDto({ ...baseTransaction, user_nickname: null });
    expect(dto).toHaveProperty("userId");
    expect(dto.userNickname).toBeNull();
  });
});