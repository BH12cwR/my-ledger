import type { AdminRecord, AuthContext, Db, Env, PrincipalType, UserRecord } from "../db/types";
import { clearCookie, isSecureRequest, readCookie, serializeCookie } from "../http/cookies";
import { signSessionToken, verifySessionToken } from "./tokens";

/**
 * 会话管理：用户端与后台共用 sessions 表，但使用不同的 Cookie 名称与签名密钥，
 * 两者的令牌互不通用——即使其中一个密钥泄露也不会波及另一端。
 */
export const USER_SESSION_COOKIE = "ledger_session";
export const ADMIN_SESSION_COOKIE = "ledger_admin_session";

/** 用户端 30 天免登录 */
export const USER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
/** 后台 8 小时，降低管理员令牌泄露的暴露面 */
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

/** 距上次活跃超过该阈值才回写 last_seen_at，避免每个请求都产生一次写入 */
const LAST_SEEN_REFRESH_MS = 5 * 60 * 1000;

export function sessionCookieName(principalType: PrincipalType): string {
  return principalType === "admin" ? ADMIN_SESSION_COOKIE : USER_SESSION_COOKIE;
}

export function sessionSecret(env: Env, principalType: PrincipalType): string {
  const secret = principalType === "admin" ? env.ADMIN_JWT_SECRET : env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error(
      principalType === "admin"
        ? "缺少 ADMIN_JWT_SECRET，请先配置管理员会话密钥"
        : "缺少 AUTH_JWT_SECRET，请先配置用户会话密钥",
    );
  }
  return secret;
}

function clientMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    request.headers.get("cf-connecting-ip") ??
    (forwarded ? forwarded.split(",")[0]?.trim() : null) ??
    null;
  const userAgent = request.headers.get("user-agent");
  return {
    ip: ip ? ip.slice(0, 64) : null,
    userAgent: userAgent ? userAgent.slice(0, 255) : null,
  };
}

export interface CreateSessionResult {
  token: string;
  sessionId: string;
  expiresAt: number;
}

export async function createSession(
  db: Db,
  env: Env,
  options: {
    principalType: PrincipalType;
    principalId: string;
    role?: AdminRecord["role"];
    request: Request;
    ttlSeconds: number;
  },
): Promise<CreateSessionResult> {
  const { principalType, principalId, role, request, ttlSeconds } = options;
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;
  const meta = clientMeta(request);

  await db
    .prepare(
      `INSERT INTO sessions
         (id, principal_type, principal_id, expires_at, revoked_at, user_agent, ip, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    )
    .bind(sessionId, principalType, principalId, expiresAt, meta.userAgent, meta.ip, now, now)
    .run();

  const token = await signSessionToken(
    { sub: principalId, sid: sessionId, typ: principalType, ...(role ? { role } : {}) },
    sessionSecret(env, principalType),
    ttlSeconds,
  );

  return { token, sessionId, expiresAt };
}

export function buildSessionCookie(
  principalType: PrincipalType,
  token: string,
  request: Request,
  ttlSeconds: number,
): string {
  return serializeCookie(sessionCookieName(principalType), token, {
    maxAge: ttlSeconds,
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "Lax",
    path: "/",
  });
}

export function buildClearSessionCookie(principalType: PrincipalType, request: Request): string {
  return clearCookie(sessionCookieName(principalType), {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "Lax",
    path: "/",
  });
}

/**
 * 解析并校验当前请求的会话。
 * 校验链路：Cookie 存在 → JWT 签名/有效期 → 主体类型匹配 → sessions 行未吊销未过期 → 主体状态为 active。
 */
export async function resolveAuth(
  db: Db,
  env: Env,
  request: Request,
  principalType: PrincipalType,
): Promise<AuthContext | null> {
  const token = readCookie(request, sessionCookieName(principalType));
  if (!token) return null;

  const claims = await verifySessionToken(token, sessionSecret(env, principalType));
  if (!claims || claims.typ !== principalType) return null;

  const session = await db
    .prepare(
      `SELECT id, principal_id, expires_at, revoked_at, last_seen_at
         FROM sessions
        WHERE id = ? AND principal_type = ?`,
    )
    .bind(claims.sid, principalType)
    .first<{ id: string; principal_id: string; expires_at: number; revoked_at: number | null; last_seen_at: number }>();

  if (!session || session.revoked_at !== null || session.expires_at <= Date.now()) {
    return null;
  }
  if (session.principal_id !== claims.sub) return null;

  const now = Date.now();
  if (now - session.last_seen_at > LAST_SEEN_REFRESH_MS) {
    await db
      .prepare(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`)
      .bind(now, session.id)
      .run();
  }

  if (principalType === "admin") {
    const admin = await db
      .prepare(`SELECT id, username, role, status FROM admin_users WHERE id = ?`)
      .bind(claims.sub)
      .first<Pick<AdminRecord, "id" | "username" | "role" | "status">>();
    if (!admin || admin.status !== "active") return null;
    return {
      principalType,
      principalId: admin.id,
      sessionId: session.id,
      adminRole: admin.role,
      adminUsername: admin.username,
    };
  }

  const user = await db
    .prepare(`SELECT id, status FROM users WHERE id = ?`)
    .bind(claims.sub)
    .first<Pick<UserRecord, "id" | "status">>();
  if (!user || user.status !== "active") return null;

  return { principalType, principalId: user.id, sessionId: session.id };
}

export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db
    .prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`)
    .bind(Date.now(), sessionId)
    .run();
}

/** 管理员禁用用户 / 修改口令时，一次性吊销该主体的全部会话 */
export async function revokeAllSessions(
  db: Db,
  principalType: PrincipalType,
  principalId: string,
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE sessions SET revoked_at = ?
        WHERE principal_type = ? AND principal_id = ? AND revoked_at IS NULL`,
    )
    .bind(Date.now(), principalType, principalId)
    .run();
  return result.meta?.changes ?? 0;
}

/** 清理过期会话，供管理后台或定时任务调用 */
export async function purgeExpiredSessions(db: Db, olderThanMs = Date.now()): Promise<number> {
  const result = await db
    .prepare(`DELETE FROM sessions WHERE expires_at <= ?`)
    .bind(olderThanMs)
    .run();
  return result.meta?.changes ?? 0;
}