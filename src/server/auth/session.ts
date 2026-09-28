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

  // 用一条 LEFT JOIN 同时取回会话与主体状态，把每次鉴权从两次往返压缩为一次。
  // LEFT JOIN 保证主体缺失时仍能拿到会话行，从而与原先「先查会话、再查主体」的判定等价。
  if (principalType === "admin") {
    const row = await db
      .prepare(
        `SELECT s.id AS session_id, s.principal_id, s.expires_at, s.revoked_at, s.last_seen_at,
                a.id AS admin_id, a.username AS admin_username, a.role AS admin_role, a.status AS admin_status
           FROM sessions s
           LEFT JOIN admin_users a ON a.id = s.principal_id
          WHERE s.id = ? AND s.principal_type = ?`,
      )
      .bind(claims.sid, principalType)
      .first<{
        session_id: string;
        principal_id: string;
        expires_at: number;
        revoked_at: number | null;
        last_seen_at: number;
        admin_id: string | null;
        admin_username: string | null;
        admin_role: AdminRecord["role"] | null;
        admin_status: AdminRecord["status"] | null;
      }>();

    if (!validateSessionRow(row, claims.sub)) return null;
    if (!row.admin_id || row.admin_status !== "active" || !row.admin_role) return null;

    await touchSession(db, row.session_id, row.last_seen_at);
    return {
      principalType,
      principalId: row.admin_id,
      sessionId: row.session_id,
      adminRole: row.admin_role,
      adminUsername: row.admin_username ?? undefined,
    };
  }

  const row = await db
    .prepare(
      `SELECT s.id AS session_id, s.principal_id, s.expires_at, s.revoked_at, s.last_seen_at,
              u.id AS user_id, u.status AS user_status
         FROM sessions s
         LEFT JOIN users u ON u.id = s.principal_id
        WHERE s.id = ? AND s.principal_type = ?`,
    )
    .bind(claims.sid, principalType)
    .first<{
      session_id: string;
      principal_id: string;
      expires_at: number;
      revoked_at: number | null;
      last_seen_at: number;
      user_id: string | null;
      user_status: UserRecord["status"] | null;
    }>();

  if (!validateSessionRow(row, claims.sub)) return null;
  if (!row.user_id || row.user_status !== "active") return null;

  await touchSession(db, row.session_id, row.last_seen_at);
  return { principalType, principalId: row.user_id, sessionId: row.session_id };
}

interface SessionRow {
  session_id: string;
  principal_id: string;
  expires_at: number;
  revoked_at: number | null;
  last_seen_at: number;
}

/** 会话行有效性：存在、未吊销、未过期、主体与令牌声明一致 */
function validateSessionRow(
  row: SessionRow | null,
  claimedSub: string,
): row is SessionRow {
  return (
    row !== null &&
    row.revoked_at === null &&
    row.expires_at > Date.now() &&
    row.principal_id === claimedSub
  );
}

/** 距上次活跃超过阈值才回写 last_seen_at，避免每个请求都产生一次写入 */
async function touchSession(db: Db, sessionId: string, lastSeenAt: number): Promise<void> {
  const now = Date.now();
  if (now - lastSeenAt <= LAST_SEEN_REFRESH_MS) return;
  await db
    .prepare(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`)
    .bind(now, sessionId)
    .run();
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

/** 机会式清理的最小间隔：避免每个鉴权请求都触发一次 DELETE */
const SESSION_PURGE_INTERVAL_MS = 10 * 60 * 1000;
let lastPurgeAt = 0;

/**
 * 机会式清理过期会话。
 *
 * 以模块级时间戳做近似节流（Workers 隔离实例内有效）：大多数鉴权请求只做一次
 * 时间戳比较，只有超过间隔的那一次才真正发起 DELETE，从而消除每个请求一次写操作。
 */
export function maybePurgeExpiredSessions(db: Db, now = Date.now()): void {
  if (now - lastPurgeAt < SESSION_PURGE_INTERVAL_MS) return;
  lastPurgeAt = now;
  void purgeExpiredSessions(db, now).catch(() => undefined);
}