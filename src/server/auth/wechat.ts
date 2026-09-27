import type { Env } from "../db/types";
import { ApiError } from "../http/errors";

/**
 * 微信开放平台「网站应用」扫码登录。
 *
 * 流程：
 *   1. GET /api/auth/wechat/authorize  → 302 到微信二维码授权页（state 为签名后的短期 JWT）
 *   2. GET /api/auth/wechat/callback   → 用 code 换取 access_token + openid
 *   3. 拉取用户资料 → upsert users → 建立会话 → 302 回业务页
 */

const AUTHORIZE_ENDPOINT = "https://open.weixin.qq.com/connect/qrconnect";
const ACCESS_TOKEN_ENDPOINT = "https://api.weixin.qq.com/sns/oauth2/access_token";
const USERINFO_ENDPOINT = "https://api.weixin.qq.com/sns/userinfo";

export interface WechatProfile {
  openid: string;
  unionid: string | null;
  nickname: string;
  avatarUrl: string | null;
}

interface WechatErrorPayload {
  errcode?: number;
  errmsg?: string;
}

export function isWechatConfigured(env: Env): boolean {
  return Boolean(env.WECHAT_APP_ID && env.WECHAT_APP_SECRET);
}

export function wechatRedirectUri(env: Env, requestUrl: string): string {
  const base = env.WECHAT_OAUTH_REDIRECT_BASE?.trim();
  if (base) {
    return `${base.replace(/\/$/, "")}/api/auth/wechat/callback`;
  }
  // 未显式配置时退化为当前请求的 origin，方便本地联调
  return `${new URL(requestUrl).origin}/api/auth/wechat/callback`;
}

export function buildWechatAuthorizeUrl(env: Env, state: string, redirectUri: string): string {
  if (!isWechatConfigured(env)) {
    throw ApiError.badRequest(
      "微信登录尚未配置：请先设置 WECHAT_APP_ID 与 WECHAT_APP_SECRET，或改用开发模式登录",
    );
  }
  const params = new URLSearchParams({
    appid: env.WECHAT_APP_ID as string,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: env.WECHAT_OAUTH_SCOPE?.trim() || "snsapi_login",
    state,
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}#wechat_redirect`;
}

async function requestWechatJson<T>(url: string): Promise<T & WechatErrorPayload> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" } });
  } catch {
    throw ApiError.internal("无法连接微信开放平台，请稍后重试");
  }
  if (!response.ok) {
    throw ApiError.internal(`微信开放平台返回异常状态码 ${response.status}`);
  }
  return (await response.json()) as T & WechatErrorPayload;
}

export async function exchangeWechatCode(
  env: Env,
  code: string,
): Promise<{ accessToken: string; openid: string; unionid: string | null }> {
  if (!isWechatConfigured(env)) {
    throw ApiError.badRequest("微信登录尚未配置");
  }
  const params = new URLSearchParams({
    appid: env.WECHAT_APP_ID as string,
    secret: env.WECHAT_APP_SECRET as string,
    code,
    grant_type: "authorization_code",
  });
  const payload = await requestWechatJson<{
    access_token?: string;
    openid?: string;
    unionid?: string;
  }>(`${ACCESS_TOKEN_ENDPOINT}?${params.toString()}`);

  if (payload.errcode || !payload.access_token || !payload.openid) {
    // 40029 = code 无效；40163 = code 已被使用
    throw ApiError.unauthorized(
      payload.errcode === 40029 || payload.errcode === 40163
        ? "微信授权码已失效，请重新扫码登录"
        : `微信授权失败：${payload.errmsg ?? "未知错误"}`,
    );
  }
  return {
    accessToken: payload.access_token,
    openid: payload.openid,
    unionid: payload.unionid ?? null,
  };
}

export async function fetchWechatProfile(
  env: Env,
  accessToken: string,
  openid: string,
): Promise<WechatProfile> {
  const params = new URLSearchParams({ access_token: accessToken, openid, lang: "zh_CN" });
  const payload = await requestWechatJson<{
    openid?: string;
    nickname?: string;
    headimgurl?: string;
    unionid?: string;
  }>(`${USERINFO_ENDPOINT}?${params.toString()}`);

  if (payload.errcode || !payload.openid) {
    throw ApiError.unauthorized(`获取微信用户资料失败：${payload.errmsg ?? "未知错误"}`);
  }

  return {
    openid: payload.openid,
    unionid: payload.unionid ?? null,
    // 新版微信对未授权用户可能返回空昵称，做一次兜底
    nickname: payload.nickname?.trim() || "记账用户",
    avatarUrl: payload.headimgurl ?? null,
  };
}