import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { requireUser } from "@/server/auth/guard";
import { tagDto } from "@/server/http/serialize";
import { createTagSchema } from "@/server/validation/schemas";
import { createTag, listTags } from "@/server/services/tags";

/** GET /api/tags */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const tags = await listTags(deps.db, auth.principalId);
    return jsonOk({ items: tags.map(tagDto) });
  });
}

/** POST /api/tags */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const input = createTagSchema.parse(await readJsonBody(request));
    const tag = await createTag(deps.db, auth.principalId, input);

    return jsonOk({ tag: tagDto(tag) }, 201);
  });
}