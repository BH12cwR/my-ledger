import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "@/server/auth/tokens";

const SECRET = "unit-test-secret-key";

describe("signSessionToken / verifySessionToken", () => {
  it("往返后保留主体、会话与角色", async () => {
    const token = await signSessionToken(
      { sub: "user-1", sid: "session-1", typ: "user" },
      SECRET,
      3600,
    );
    await expect(verifySessionToken(token, SECRET)).resolves.toEqual({
      sub: "user-1",
      sid: "session-1",
      typ: "user",
    });
  });

  it("管理员令牌携带 role", async () => {
    const token = await signSessionToken(
      { sub: "admin-1", sid: "session-2", typ: "admin", role: "super_admin" },
      SECRET,
      3600,
    );
    const claims = await verifySessionToken(token, SECRET);
    expect(claims?.typ).toBe("admin");
    expect(claims?.role).toBe("super_admin");
  });

  it("篡改 payload 后校验失败", async () => {
    const token = await signSessionToken(
      { sub: "user-1", sid: "session-1", typ: "user" },
      SECRET,
      3600,
    );
    const [header, payload, signature] = token.split(".");
    const flipped = payload.slice(0, -1) + (payload.endsWith("A") ? "B" : "A");
    await expect(verifySessionToken(`${header}.${flipped}.${signature}`, SECRET)).resolves.toBeNull();
  });

  it("使用错误密钥校验失败", async () => {
    const token = await signSessionToken(
      { sub: "user-1", sid: "session-1", typ: "user" },
      SECRET,
      3600,
    );
    await expect(verifySessionToken(token, "another-secret")).resolves.toBeNull();
  });

  it("过期令牌校验失败", async () => {
    const token = await signSessionToken(
      { sub: "user-1", sid: "session-1", typ: "user" },
      SECRET,
      -10,
    );
    await expect(verifySessionToken(token, SECRET)).resolves.toBeNull();
  });
});