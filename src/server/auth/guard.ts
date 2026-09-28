import type { AuthContext, Db, Env } from "../db/types";
import { ApiError } from "../http/errors";
import { resolveDeps, type RouteDeps } from "../http/deps";
import { maybePurgeExpiredSessions, resolveAuth } from "./session";
import type { AdminRole } from "../db/types";

/**
 * 鉴权守卫：所有需要登录的 API 都必须先经过这里。
 * 前端页面只负责展示，真正的权限边界始终在 API 层。
 */
export async function requireUser(
  request: Request,
  deps?: RouteDeps,
): Promise<AuthContext> {
  const { db, env } = resolveDeps(deps);
  return requirePrincipal(request, db, env, "user");
}

export async function requireAdmin(
  request: Request,
  options?: { roles?: AdminRole[] },
  deps?: RouteDeps,
): Promise<AuthContext> {
  const { db, env } = resolveDeps(deps);
  const auth = await requirePrincipal(request, db, env, "admin");
  if (options?.roles && auth.adminRole && !options.roles.includes(auth.adminRole)) {
    if (auth.adminRole === "auditor") {
      throw ApiError.forbidden("审计员账号仅具备只读权限");
    }
    throw ApiError.forbidden("当前管理员角色无权执行该操作");
  }
  return auth;
}

async function requirePrincipal(
  request: Request,
  db: Db,
  env: Env,
  principalType: "user" | "admin",
): Promise<AuthContext> {
  const auth = await resolveAuth(db, env, request, principalType);

  // 附带一次机会式清理（内部按时间窗口节流），避免会话表无限增长
  maybePurgeExpiredSessions(db);

  if (!auth) {
    throw principalType === "admin"
      ? ApiError.unauthorized("管理员登录状态已失效，请重新登录")
      : ApiError.unauthorized("登录状态已失效，请重新登录");
  }
  return auth;
}

/** 判断当前管理员是否具备写权限 */
export function assertCanWrite(auth: AuthContext): void {
  if (auth.principalType === "admin" && auth.adminRole === "auditor") {
    throw ApiError.forbidden("审计员账号仅具备只读权限");
  }
}