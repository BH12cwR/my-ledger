import { SignJWT, jwtVerify } from "jose";

/**
 * 微信 OAuth 的 state 参数。
 *
 * state 会被原样带到微信授权页再回传，因此它必须能自证来源，
 * 否则攻击者可以伪造回调把受害者登录到攻击者的账号上（CSRF / 会话固定）。
 * 这里用与会话相同的 HS256 密钥签一个短时效 JWT，并额外把 nonce 存进
 * HttpOnly Cookie 做二次比对，实现「签名 + 双提交」双重校验。
 */

const ISSUER = "my-ledger-oauth";
const ALGORITHM = "HS256";
const STATE_TTL_SECONDS = 10 * 60;

export interface OauthState {
  nonce: string;
  /** 登录成功后的回跳路径，必须是以 / 开头的站内相对路径 */
  next: string;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signOauthState(state: OauthState, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ nonce: state.nonce, next: state.next })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + STATE_TTL_SECONDS)
    .sign(secretKey(secret));
}

export async function verifyOauthState(
  token: string,
  secret: string,
): Promise<OauthState | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      issuer: ISSUER,
      algorithms: [ALGORITHM],
    });
    if (typeof payload.nonce !== "string") return null;
    const next = typeof payload.next === "string" ? payload.next : "/";
    return { nonce: payload.nonce, next: sanitizeNext(next) };
  } catch {
    return null;
  }
}

/** 只允许站内相对路径，阻断 //evil.com 这类协议相对形式的开放重定向 */
export function sanitizeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export const OAUTH_STATE_COOKIE = "ledger_oauth_state";