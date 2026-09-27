/**
 * 统一的接口错误类型。
 * 业务层抛出 ApiError，由 handleRoute 统一转换为 JSON 响应，
 * 保证所有 /api 路由的错误结构一致： { error: { code, message, details? } }
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = "请求参数不正确", details?: unknown) {
    return new ApiError(400, "bad_request", message, details);
  }

  static unauthorized(message = "请先登录后再操作") {
    return new ApiError(401, "unauthorized", message);
  }

  static forbidden(message = "没有权限执行该操作") {
    return new ApiError(403, "forbidden", message);
  }

  static notFound(message = "资源不存在") {
    return new ApiError(404, "not_found", message);
  }

  static conflict(message = "资源已存在", details?: unknown) {
    return new ApiError(409, "conflict", message, details);
  }

  static tooManyRequests(message = "操作过于频繁，请稍后再试") {
    return new ApiError(429, "too_many_requests", message);
  }

  static internal(message = "服务内部错误") {
    return new ApiError(500, "internal_error", message);
  }
}