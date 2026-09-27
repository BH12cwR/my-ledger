import { describe, expect, it } from "vitest";
import {
  DEFAULT_PBKDF2_ITERATIONS,
  hashPassword,
  needsRehash,
  timingSafeEqual,
  validateAdminPasswordStrength,
  verifyPassword,
} from "@/server/auth/password";

// 用较小迭代次数加速：格式与校验链路完全一致
const FAST_ITERATIONS = 1000;

describe("hashPassword", () => {
  it("输出 pbkdf2$sha256$<iterations>$<saltB64>$<hashB64> 格式", async () => {
    const hash = await hashPassword("Str0ng-Password!", FAST_ITERATIONS);
    expect(hash).toMatch(/^pbkdf2\$sha256\$1000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(hash.split("$")).toHaveLength(5);
  });

  it("同一口令两次哈希不同（随机盐）", async () => {
    const first = await hashPassword("Str0ng-Password!", FAST_ITERATIONS);
    const second = await hashPassword("Str0ng-Password!", FAST_ITERATIONS);
    expect(first).not.toBe(second);
  });

  it("默认迭代次数与常量一致", async () => {
    const hash = await hashPassword("Str0ng-Password!");
    expect(hash.split("$")[2]).toBe(String(DEFAULT_PBKDF2_ITERATIONS));
  });
});

describe("verifyPassword", () => {
  it("正确口令通过、错误口令拒绝", async () => {
    const hash = await hashPassword("Str0ng-Password!", FAST_ITERATIONS);
    await expect(verifyPassword("Str0ng-Password!", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("格式非法的存量哈希直接拒绝", async () => {
    await expect(verifyPassword("x", "not-a-hash")).resolves.toBe(false);
    await expect(verifyPassword("x", "pbkdf2$sha256$abc$s$h")).resolves.toBe(false);
  });
});

describe("needsRehash", () => {
  it("迭代次数低于目标时返回 true", async () => {
    const hash = await hashPassword("Str0ng-Password!", FAST_ITERATIONS);
    expect(needsRehash(hash, 20000)).toBe(true);
    expect(needsRehash(hash, FAST_ITERATIONS)).toBe(false);
  });

  it("格式非法时视为需要重算", () => {
    expect(needsRehash("garbage", 1000)).toBe(true);
  });
});

describe("timingSafeEqual", () => {
  it("等长且内容相同返回 true，否则 false", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe("validateAdminPasswordStrength", () => {
  it("长度不足 12 位时报错", () => {
    expect(validateAdminPasswordStrength("Abc123!")).toContain("12");
  });

  it("长度超过 128 位时报错", () => {
    expect(validateAdminPasswordStrength(`Aa1!${"x".repeat(130)}`)).toContain("128");
  });

  it("字符种类少于三类时报错", () => {
    expect(validateAdminPasswordStrength("abcdefghijkl")).toContain("三类");
    expect(validateAdminPasswordStrength("abcdefghijkl1")).not.toBeNull();
  });

  it("满足长度与三类字符时通过", () => {
    expect(validateAdminPasswordStrength("Abcdefgh1234")).toBeNull();
    expect(validateAdminPasswordStrength("Abcdefghij1!")).toBeNull();
  });
});