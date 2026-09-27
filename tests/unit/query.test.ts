import { describe, expect, it } from "vitest";
import { ApiError } from "@/server/http/errors";
import { parseQuery, pathParam, queryFlag } from "@/server/http/query";
import { listTransactionsQuerySchema } from "@/server/validation/schemas";

const makeRequest = (query: string) => new Request(`http://localhost/api/transactions${query}`);

describe("parseQuery", () => {
  it("丢弃空字符串，让 schema 的 default() 生效", () => {
    const result = parseQuery(makeRequest("?page=&pageSize=5"), listTransactionsQuerySchema);
    expect(result.page).toBe(1); // default(1) 生效
    expect(result.pageSize).toBe(5);
  });

  it("空的可选日期不进入校验，保持 undefined", () => {
    const result = parseQuery(makeRequest("?from=&to=2026-09-01"), listTransactionsQuerySchema);
    expect(result.from).toBeUndefined();
    expect(result.to).toBe("2026-09-01");
  });

  it("非法值交给 zod 抛错", () => {
    expect(() => parseQuery(makeRequest("?page=0"), listTransactionsQuerySchema)).toThrow();
    expect(() => parseQuery(makeRequest("?from=2026-13-01"), listTransactionsQuerySchema)).toThrow();
  });
});

describe("pathParam", () => {
  it("去除首尾空格", () => {
    expect(pathParam("  abc  ")).toBe("abc");
  });

  it("空值抛 400", () => {
    const empty = (() => {
      try {
        pathParam("");
      } catch (error) {
        return error;
      }
      return null;
    })();
    expect(empty).toBeInstanceOf(ApiError);
    expect((empty as ApiError).status).toBe(400);
    expect((empty as ApiError).message).toContain("资源标识");

    expect(() => pathParam(undefined, "账户标识")).toThrowError("缺少账户标识");
    expect(() => pathParam("   ", "账户标识")).toThrowError("缺少账户标识");
  });
});

describe("queryFlag", () => {
  it("识别 1 与 true", () => {
    expect(queryFlag(makeRequest("?includeArchived=1"), "includeArchived")).toBe(true);
    expect(queryFlag(makeRequest("?includeArchived=true"), "includeArchived")).toBe(true);
  });

  it("其他取值一律为 false", () => {
    expect(queryFlag(makeRequest("?includeArchived=0"), "includeArchived")).toBe(false);
    expect(queryFlag(makeRequest("?includeArchived=TRUE"), "includeArchived")).toBe(false);
    expect(queryFlag(makeRequest("?includeArchived=yes"), "includeArchived")).toBe(false);
    expect(queryFlag(makeRequest(""), "includeArchived")).toBe(false);
  });
});