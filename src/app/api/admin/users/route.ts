import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { parseQuery } from "@/server/http/query";
import { requireAdmin } from "@/server/auth/guard";
import { pageDto, userDto } from "@/server/http/serialize";
import { adminUserListQuerySchema } from "@/server/validation/schemas";
import { listUsers } from "@/server/services/users";

/** GET /api/admin/users?keyword=&status=&page=&pageSize= */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    await requireAdmin(request, undefined, deps);

    const query = parseQuery(request, adminUserListQuerySchema);
    const page = await listUsers(deps.db, query);

    return jsonOk(pageDto(page, userDto));
  });
}