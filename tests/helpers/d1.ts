import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Db } from "@/server/db/types";

/**
 * 基于 node:sqlite 的内存版 D1 替身。
 *
 * 服务层只依赖 D1 的一小组能力（prepare / bind / first / all / run / batch / exec），
 * 且这些方法在 D1 中都是异步的。这里用 DatabaseSync 实现一个 API 兼容子集即可，
 * 无需启动 wrangler 或 miniflare。
 *
 * 之所以集中在 `as unknown as Db`：D1Database 来自 @cloudflare/workers-types，
 * 其类型包含大量 Workers 运行时特有的成员，node:sqlite 无法逐一满足；
 * 强制转换只允许出现在本文件，业务与测试代码拿到的仍是真实的 Db 类型。
 */

/** 迁移目录：tests/helpers -> 项目根 -> migrations */
const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => join(MIGRATIONS_DIR, name));
}

/**
 * 归一化绑定参数。
 * node:sqlite 只接受 null / number / bigint / string / Uint8Array：
 *  - undefined 若直接绑定会抛错，统一转成 null；
 *  - boolean 是 SQLite 未定义类型，转成 0/1 与 schema 中的 INTEGER 语义一致。
 */
function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

/** 兼容 D1 .all() 的返回结构，服务层通过 allRows() 只取 results */
function resultMeta(changes: number, lastRowId: number) {
  return { changes, last_row_id: lastRowId, duration: 0, rows_read: 0, rows_written: changes };
}

class TestStatement {
  constructor(
    private readonly raw: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  /** 返回新的已绑定语句，保证链式调用不共享参数 */
  bind(...values: unknown[]): TestStatement {
    return new TestStatement(this.raw, this.sql, values.map(normalize));
  }

  async first<T>(): Promise<T | null> {
    const row = this.raw.prepare(this.sql).get(...(this.params as never[]));
    return (row ?? null) as T | null;
  }

  async all<T>(): Promise<{ results: T[]; success: boolean; meta: ReturnType<typeof resultMeta> }> {
    const rows = this.raw.prepare(this.sql).all(...(this.params as never[]));
    return { results: rows as T[], success: true, meta: resultMeta(0, 0) };
  }

  async run(): Promise<{ success: boolean; meta: ReturnType<typeof resultMeta> }> {
    const info = this.raw.prepare(this.sql).run(...(this.params as never[]));
    return { success: true, meta: resultMeta(Number(info.changes), Number(info.lastInsertRowid)) };
  }
}

export interface TestDb {
  db: Db;
  raw: DatabaseSync;
}

/**
 * 新建一个内存库并跑完全部迁移。
 * 每个测试用例都应独立调用一次，避免用例间数据串扰。
 */
export function createTestDb(): TestDb {
  const raw = new DatabaseSync(":memory:");
  // 与 D1 保持一致：外键约束默认开启（SQLite CLI 默认关闭）
  raw.exec("PRAGMA foreign_keys = ON");
  for (const file of migrationFiles()) {
    raw.exec(readFileSync(file, "utf8"));
  }

  const db = {
    prepare: (sql: string) => new TestStatement(raw, sql),
    batch: async (statements: TestStatement[]) => {
      // D1 的 batch 隐含事务：全部成功才提交，任一失败则回滚
      raw.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        raw.exec("COMMIT");
        return results;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
    exec: async (sql: string) => raw.exec(sql),
    __raw: raw,
  };

  return { db: db as unknown as Db, raw };
}