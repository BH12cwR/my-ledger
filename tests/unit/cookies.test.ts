import { describe, expect, it } from "vitest";
import { clearCookie, isSecureRequest, readCookie, serializeCookie } from "@/server/http/cookies";

describe("serializeCookie", () => {
  it("默认附带 Path、HttpOnly 与 SameSite=Lax", () => {
    expect(serializeCookie("sid", "abc")).toBe("sid=abc; Path=/; HttpOnly; SameSite=Lax");
  });

  it("对值做 URL 编码", () => {
    expect(serializeCookie("sid", "a b")).toBe("sid=a%20b; Path=/; HttpOnly; SameSite=Lax");
  });

  it("按需追加 Max-Age / Secure / SameSite / Domain", () => {
    expect(
      serializeCookie("sid", "abc", {
        maxAge: 3600.9,
        secure: true,
        sameSite: "Strict",
        domain: "example.com",
      }),
    ).toBe("sid=abc; Path=/; Max-Age=3600; Domain=example.com; HttpOnly; Secure; SameSite=Strict");
  });

  it("httpOnly=false 时不输出 HttpOnly", () => {
    expect(serializeCookie("sid", "abc", { httpOnly: false })).toBe("sid=abc; Path=/; SameSite=Lax");
  });

  it("支持 Expires 与自定义 Path", () => {
    const expires = new Date(Date.UTC(2026, 0, 1));
    const cookie = serializeCookie("sid", "abc", { expires, path: "/api" });
    expect(cookie).toContain("Path=/api");
    expect(cookie).toContain(`Expires=${expires.toUTCString()}`);
  });
});

describe("clearCookie", () => {
  it("生成同名的立即过期 Cookie", () => {
    const cookie = clearCookie("sid");
    expect(cookie).toBe("sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
  });
});

describe("readCookie", () => {
  const makeRequest = (cookie: string) =>
    new Request("http://localhost/", { headers: { cookie } });

  it("解析单个 Cookie 并解码", () => {
    expect(readCookie(makeRequest("sid=a%20b"), "sid")).toBe("a b");
  });

  it("从多个 Cookie 中取出目标项", () => {
    const request = makeRequest("theme=dark; ledger_session=tok123; other=x");
    expect(readCookie(request, "ledger_session")).toBe("tok123");
    expect(readCookie(request, "theme")).toBe("dark");
  });

  it("无 Cookie 头或目标项缺失时返回 undefined", () => {
    expect(readCookie(new Request("http://localhost/"), "sid")).toBeUndefined();
    expect(readCookie(makeRequest("a=1; b=2"), "sid")).toBeUndefined();
    expect(readCookie(makeRequest("novalue"), "sid")).toBeUndefined();
  });
});

describe("isSecureRequest", () => {
  it("按协议判断", () => {
    expect(isSecureRequest(new Request("https://ledger.example.com/"))).toBe(true);
    expect(isSecureRequest(new Request("http://localhost:3000/"))).toBe(false);
  });
});