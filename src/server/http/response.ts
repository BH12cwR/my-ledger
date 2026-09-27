import { ZodError } from "zod";
import { ApiError } from "./errors";

export interface ApiSuccessBody<T> {
  data: T;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export function jsonOk<T>(data: T, status = 200, headers?: HeadersInit): Response {
  const body: ApiSuccessBody<T> = { data };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...(headers as Record<string, string> | undefined) },
  });
}

export function jsonError(error: unknown): Response {
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const body: ApiErrorBody = {
      error: {
        code: "validation_failed",
        message: first?.message ?? "请求参数校验失败",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
    return new Response(JSON.stringify(body), { status: 422, headers: JSON_HEADERS });
  }

  if (error instanceof ApiError) {
    const body: ApiErrorBody = {
      error: { code: error.code, message: error.message, details: error.details },
    };
    return new Response(JSON.stringify(body), { status: error.status, headers: JSON_HEADERS });
  }

  const message = error instanceof Error ? error.message : "未知错误";
  // 未预期的异常：保留服务端可观测性，但不向外泄露堆栈
  console.error("[api] unhandled error:", message, error);
  const body: ApiErrorBody = {
    error: { code: "internal_error", message: "服务内部错误，请稍后重试" },
  };
  return new Response(JSON.stringify(body), { status: 500, headers: JSON_HEADERS });
}

/** 302 跳转，用于 OAuth 授权与登录后的回跳 */
export function redirectTo(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

/**
 * 路由处理器包装器：统一异常兜底。
 * 所有 /api 路由通过它返回响应，避免每个 handler 重复写 try/catch。
 */
export async function handleRoute(
  handler: () => Promise<Response> | Response,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return jsonError(error);
  }
}

/** 解析 JSON 请求体，空体或非法 JSON 统一报 400 */
export async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) {
    throw ApiError.badRequest("请求体不能为空");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw ApiError.badRequest("请求体不是合法的 JSON");
  }
}