import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { withCookies } from "@/server/http/cookies";
import { buildClearSessionCookie, resolveAuth, revokeSession } from "@/server/auth/session";
import { recordAudit } from "@/server/services/audit";

/** POST /api/admin/auth/logout —— 幂等，始终清空后台 Cookie */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const { db, env } = defaultDeps();
    const auth = await resolveAuth(db, env, request, "admin");

    if (auth) {
      await revokeSession(db, auth.sessionId);
      await recordAudit(db, {
        actorType: "admin",
        actorId: auth.principalId,
        action: "admin.logout",
        targetType: "admin_user",
        targetId: auth.principalId,
        request,
      });
    }

    return withCookies(jsonOk({ ok: true }), [buildClearSessionCookie("admin", request)]);
  });
}