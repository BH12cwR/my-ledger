import type { AuditLogRecord, Db } from "../db/types";

/**
 * 审计日志：管理后台监控与合规追溯的数据来源。
 * 写入失败不应该影响主流程，因此内部吞掉异常并打印日志。
 */
export interface AuditEntry {
  actorType: AuditLogRecord["actor_type"];
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: Record<string, unknown> | null;
  request?: Request | null;
}

export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  try {
    const request = entry.request ?? null;
    const forwarded = request?.headers.get("x-forwarded-for") ?? null;
    const ip =
      request?.headers.get("cf-connecting-ip") ??
      (forwarded ? forwarded.split(",")[0]?.trim() : null) ??
      null;
    const userAgent = request?.headers.get("user-agent") ?? null;

    await db
      .prepare(
        `INSERT INTO audit_logs
           (id, actor_type, actor_id, action, target_type, target_id, detail, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        entry.actorType,
        entry.actorId ?? null,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.detail ? JSON.stringify(entry.detail) : null,
        ip ? ip.slice(0, 64) : null,
        userAgent ? userAgent.slice(0, 255) : null,
        Date.now(),
      )
      .run();
  } catch (error) {
    console.error("[audit] 写入审计日志失败:", error);
  }
}