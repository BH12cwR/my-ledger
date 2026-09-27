import { SignJWT, jwtVerify } from "jose";
import type { AdminRole, PrincipalType } from "../db/types";

/**
 * 会话令牌（JWT, HS256）。
 *
 * 令牌本身只承载主体标识与会话 id，是否有效仍需回查 sessions 表，
 * 因此「禁用用户 / 吊销会话」可以立即生效，而不必等 JWT 自然过期。
 */
export interface SessionTokenClaims {
  /** 主体 id（用户 id 或管理员 id） */
  sub: string;
  /** 会话 id，对应 sessions.id */
  sid: string;
  /** 主体类型，用户端与后台使用不同密钥，这里再做一次显式校验 */
  typ: PrincipalType;
  /** 仅管理员令牌携带 */
  role?: AdminRole;
}

const ISSUER = "my-ledger";
const ALGORITHM = "HS256";

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  claims: SessionTokenClaims,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: claims.sid, typ: claims.typ, ...(claims.role ? { role: claims.role } : {}) })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secretKey(secret));
}

/** 校验签名与有效期；任何异常都视为无效令牌，返回 null */
export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<SessionTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      issuer: ISSUER,
      algorithms: [ALGORITHM],
    });
    const typ = payload.typ;
    const sid = payload.sid;
    const sub = payload.sub;
    if ((typ !== "user" && typ !== "admin") || typeof sid !== "string" || typeof sub !== "string") {
      return null;
    }
    const role = payload.role;
    return {
      sub,
      sid,
      typ,
      ...(role === "super_admin" || role === "admin" || role === "auditor" ? { role } : {}),
    };
  } catch {
    return null;
  }
}