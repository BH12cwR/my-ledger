import type { Db, Env } from "../db/types";
import { getBindings } from "../db/client";

/** 路由处理器依赖集合，便于集成测试注入内存 SQLite 与伪造环境变量 */
export interface RouteDeps {
  db: Db;
  env: Env;
}

export function defaultDeps(): RouteDeps {
  const env = getBindings();
  return { db: env.DB, env };
}

export function resolveDeps(deps?: RouteDeps): RouteDeps {
  return deps ?? defaultDeps();
}