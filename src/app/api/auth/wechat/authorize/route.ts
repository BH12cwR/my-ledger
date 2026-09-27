import { handleRoute, redirectTo } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { isSecureRequest, serializeCookie, withCookies } from "@/server/http/cookies";
import { ApiError } from "@/server/http/errors";
import { buildWechatAuthorizeUrl, isWechatConfigured, wechatRedirectUri } from "@/server/auth/wechat";
import { sessionSecret } from "@/server/auth/session";
import { OAUTH_STATE_COOKIE, sanitizeNext, signOauthState } from "@/server/auth/state";

const STATE_TTL_SECONDS = 600;

/**
 * GET /api/auth/wechat/authorize?next=/transactions
 *
 * 生成带签名的 state 并 302 到微信扫码页。
 * state 同时写入 HttpOnly Cookie，回调时做双提交比对，防止伪造回调。
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const { env } = defaultDeps();

    if (!isWechatConfigured(env)) {
      throw ApiError.badRequest(
        "微信登录尚未配置：请在环境变量中设置 WECHAT_APP_ID 与 WECHAT_APP_SECRET，或使用开发模式登录",
      );
    }

    const next = sanitizeNext(new URL(request.url).searchParams.get("next"));
    const nonce = crypto.randomUUID();
    const state = await signOauthState({ nonce, next }, sessionSecret(env, "user"));
    const authorizeUrl = buildWechatAuthorizeUrl(env, state, wechatRedirectUri(env, request.url));

    return withCookies(redirectTo(authorizeUrl), [
      serializeCookie(OAUTH_STATE_COOKIE, nonce, {
        maxAge: STATE_TTL_SECONDS,
        httpOnly: true,
        secure: isSecureRequest(request),
        sameSite: "Lax",
        path: "/",
      }),
    ]);
  });
}