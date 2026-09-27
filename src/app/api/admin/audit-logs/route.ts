import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { parseQuery } from "@/server/http/query";
import { requireAdmin } from "@/server/auth/guard";
import { auditLogDto, pageDto } from "@/server/http/serialize";
import { adminAuditLogQuerySchema } from "@/server/validation/schemas";
import { listAuditLogs } from "@/server/services/admin";

/** GET /api/admin/audit-logs?action=&actorType=&page=&pageSize= */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    await requireAdmin(request, undefined, deps);

    const query = parseQuery(request, adminAuditLogQuerySchema);
    const page = await listAuditLogs(deps.db, query);

    return jsonOk(pageDto(page, auditLogDto));
  });
}