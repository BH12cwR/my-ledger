import type { AdminRecord, AdminRole, AuditLogRecord, Db, Env } from "../db/types";
import { ApiError } from "../http/errors";
import {
  hashPassword,
  LOCK_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
  needsRehash,
  resolvePbkdf2Iterations,
  validateAdminPasswordStrength,
  verifyPassword,
} from "../auth/password";
import { createSession, revokeAllSessions } from "../auth/session";
import { allRows, nowMs, paginate } from "./common";
import { recordAudit } from "./audit";

/**
 * 管理员服务：与普通用户完全隔离的账户体系。
 * 口令永不落库明文，登录失败次数与锁定时间存在 admin_users 上，无需额外的限流组件。
 */

export function pbkdf2Iterations(env: Env): number {
  return resolvePbkdf2Iterations(env.ADMIN_PBKDF2_ITERATIONS);
}

export async function getAdminByUsername(db: Db, username: string): Promise<AdminRecord | null> {
  return db
    .prepare(`SELECT * FROM admin_users WHERE username = ?`)
    .bind(username)
    .first<AdminRecord>();
}

export async function getAdminById(db: Db, adminId: string): Promise<AdminRecord | null> {
  return db.prepare(`SELECT * FROM admin_users WHERE id = ?`).bind(adminId).first<AdminRecord>();
}

export async function countAdmins(db: Db): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS count FROM admin_users`)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function createAdminAccount(
  db: Db,
  env: Env,
  input: { username: string; displayName: string; password: string; role?: AdminRole },
  now = nowMs(),
): Promise<AdminRecord> {
  const strengthError = validateAdminPasswordStrength(input.password);
  if (strengthError) throw ApiError.badRequest(strengthError);

  const existing = await getAdminByUsername(db, input.username);
  if (existing) throw ApiError.conflict("该管理员用户名已被占用");

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password, pbkdf2Iterations(env));

  await db
    .prepare(
      `INSERT INTO admin_users
         (id, username, display_name, password_hash, role, status,
          failed_attempts, locked_until, must_change_password, last_login_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', 0, NULL, 0, NULL, ?, ?)`,
    )
    .bind(id, input.username, input.displayName, passwordHash, input.role ?? "admin", now, now)
    .run();

  const created = await getAdminById(db, id);
  if (!created) throw ApiError.internal("创建管理员失败");
  return created;
}

export interface AdminLoginResult {
  admin: AdminRecord;
  token: string;
  sessionId: string;
  expiresAt: number;
}

/** 管理员登录：口令校验 + 失败次数限制 + 会话签发 */
export async function authenticateAdmin(
  db: Db,
  env: Env,
  input: { username: string; password: string },
  request: Request,
  ttlSeconds: number,
): Promise<AdminLoginResult> {
  const now = nowMs();
  const admin = await getAdminByUsername(db, input.username);

  // 统一错误文案，避免暴露「用户名是否存在」
  const genericFailure = ApiError.unauthorized("用户名或密码不正确");

  if (!admin) {
    await recordAudit(db, {
      actorType: "system",
      action: "admin.login.failed",
      targetType: "admin_user",
      targetId: input.username,
      detail: { reason: "unknown_username" },
      request,
    });
    throw genericFailure;
  }

  if (admin.locked_until && admin.locked_until > now) {
    const minutes = Math.ceil((admin.locked_until - now) / 60000);
    throw ApiError.tooManyRequests(`账号因多次登录失败已被锁定，请 ${minutes} 分钟后再试`);
  }

  if (admin.status !== "active") {
    throw ApiError.forbidden("该管理员账号已被停用");
  }

  const passwordMatched = await verifyPassword(input.password, admin.password_hash);

  if (!passwordMatched) {
    const failedAttempts = admin.failed_attempts + 1;
    const lockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS ? now + LOCK_DURATION_MS : null;
    await db
      .prepare(`UPDATE admin_users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?`)
      .bind(failedAttempts, lockedUntil, now, admin.id)
      .run();

    await recordAudit(db, {
      actorType: "system",
      action: "admin.login.failed",
      targetType: "admin_user",
      targetId: admin.id,
      detail: { failedAttempts, locked: lockedUntil !== null },
      request,
    });

    if (lockedUntil) {
      throw ApiError.tooManyRequests(
        `密码连续错误 ${MAX_FAILED_ATTEMPTS} 次，账号已锁定 ${LOCK_DURATION_MS / 60000} 分钟`,
      );
    }
    throw genericFailure;
  }

  // 登录成功：重置失败计数；若哈希迭代次数低于当前策略则透明升级
  const iterations = pbkdf2Iterations(env);
  const passwordHash = needsRehash(admin.password_hash, iterations)
    ? await hashPassword(input.password, iterations)
    : admin.password_hash;

  await db
    .prepare(
      `UPDATE admin_users
          SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ?, password_hash = ?
        WHERE id = ?`,
    )
    .bind(now, now, passwordHash, admin.id)
    .run();

  const session = await createSession(db, env, {
    principalType: "admin",
    principalId: admin.id,
    role: admin.role,
    request,
    ttlSeconds,
  });

  await recordAudit(db, {
    actorType: "admin",
    actorId: admin.id,
    action: "admin.login.success",
    targetType: "admin_user",
    targetId: admin.id,
    request,
  });

  return {
    admin: { ...admin, failed_attempts: 0, locked_until: null, last_login_at: now, password_hash: passwordHash },
    token: session.token,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
  };
}

export async function changeAdminPassword(
  db: Db,
  env: Env,
  adminId: string,
  newPassword: string,
  now = nowMs(),
): Promise<void> {
  const strengthError = validateAdminPasswordStrength(newPassword);
  if (strengthError) throw ApiError.badRequest(strengthError);

  const passwordHash = await hashPassword(newPassword, pbkdf2Iterations(env));
  const result = await db
    .prepare(
      `UPDATE admin_users
          SET password_hash = ?, must_change_password = 0, failed_attempts = 0, locked_until = NULL, updated_at = ?
        WHERE id = ?`,
    )
    .bind(passwordHash, now, adminId)
    .run();
  if ((result.meta?.changes ?? 0) === 0) throw ApiError.notFound("管理员不存在");

  await revokeAllSessions(db, "admin", adminId);
}

export async function setAdminStatus(
  db: Db,
  adminId: string,
  status: "active" | "disabled",
  now = nowMs(),
): Promise<void> {
  const result = await db
    .prepare(`UPDATE admin_users SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(status, now, adminId)
    .run();
  if ((result.meta?.changes ?? 0) === 0) throw ApiError.notFound("管理员不存在");

  if (status === "disabled") await revokeAllSessions(db, "admin", adminId);
}

export async function listAdmins(db: Db): Promise<Array<Omit<AdminRecord, "password_hash">>> {
  return allRows<Omit<AdminRecord, "password_hash">>(
    db.prepare(
      `SELECT id, username, display_name, role, status, failed_attempts, locked_until,
              must_change_password, last_login_at, created_at, updated_at
         FROM admin_users
         ORDER BY created_at ASC`,
    ),
  );
}

// ---------------------------------------------------------------------------
// 监控指标
// ---------------------------------------------------------------------------

export interface OverviewMetrics {
  users: {
    total: number;
    active: number;
    disabled: number;
    newInRange: number;
    activeInRange: number;
  };
  transactions: {
    total: number;
    inRange: number;
    expenseCentsInRange: number;
    incomeCentsInRange: number;
  };
  sessions: { activeNow: number };
  admins: { total: number };
  range: { days: number; since: number };
}

export async function getOverviewMetrics(db: Db, days = 7, now = nowMs()): Promise<OverviewMetrics> {
  const since = now - days * 24 * 60 * 60 * 1000;
  const sinceDay = new Date(since).toISOString().slice(0, 10);

  const [users, transactions, sessions, admins] = await Promise.all([
    db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active,
           COALESCE(SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END), 0) AS disabled,
           COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS new_in_range
         FROM users`,
      )
      .bind(since)
      .first<{ total: number; active: number; disabled: number; new_in_range: number }>(),
    db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN happened_at >= ? THEN 1 ELSE 0 END), 0) AS in_range,
           COALESCE(SUM(CASE WHEN happened_at >= ? AND kind = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_in_range,
           COALESCE(SUM(CASE WHEN happened_at >= ? AND kind = 'income'  THEN amount_cents ELSE 0 END), 0) AS income_in_range
         FROM transactions
         WHERE deleted_at IS NULL`,
      )
      .bind(since, since, since)
      .first<{ total: number; in_range: number; expense_in_range: number; income_in_range: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS active_now
           FROM sessions
          WHERE revoked_at IS NULL AND expires_at > ?`,
      )
      .bind(now)
      .first<{ active_now: number }>(),
    db.prepare(`SELECT COUNT(*) AS total FROM admin_users`).first<{ total: number }>(),
  ]);

  const activeInRangeRow = await db
    .prepare(
      `SELECT COUNT(DISTINCT user_id) AS count
         FROM transactions
        WHERE deleted_at IS NULL AND happened_on >= ?`,
    )
    .bind(sinceDay)
    .first<{ count: number }>();

  return {
    users: {
      total: users?.total ?? 0,
      active: users?.active ?? 0,
      disabled: users?.disabled ?? 0,
      newInRange: users?.new_in_range ?? 0,
      activeInRange: activeInRangeRow?.count ?? 0,
    },
    transactions: {
      total: transactions?.total ?? 0,
      inRange: transactions?.in_range ?? 0,
      expenseCentsInRange: transactions?.expense_in_range ?? 0,
      incomeCentsInRange: transactions?.income_in_range ?? 0,
    },
    sessions: { activeNow: sessions?.active_now ?? 0 },
    admins: { total: admins?.total ?? 0 },
    range: { days, since },
  };
}

/** 后台首页图表：近 N 天的新增用户与记账笔数趋势 */
export async function getPlatformTrend(db: Db, days = 14, now = nowMs()) {
  const since = now - days * 24 * 60 * 60 * 1000;
  const sinceDay = new Date(since).toISOString().slice(0, 10);

  const [userRows, txRows] = await Promise.all([
    allRows<{ day: string; count: number }>(
      db
        .prepare(
          `SELECT substr(datetime(created_at / 1000, 'unixepoch', '+8 hours'), 1, 10) AS day, COUNT(*) AS count
             FROM users
            WHERE created_at >= ?
            GROUP BY day
            ORDER BY day ASC`,
        )
        .bind(since),
    ),
    allRows<{ day: string; count: number; amount_cents: number }>(
      db
        .prepare(
          `SELECT happened_on AS day, COUNT(*) AS count, COALESCE(SUM(amount_cents), 0) AS amount_cents
             FROM transactions
            WHERE deleted_at IS NULL AND happened_on >= ?
            GROUP BY happened_on
            ORDER BY happened_on ASC`,
        )
        .bind(sinceDay),
    ),
  ]);

  const userByDay = new Map(userRows.map((row) => [row.day, row.count]));
  const txByDay = new Map(txRows.map((row) => [row.day, row]));

  const points: Array<{ day: string; newUsers: number; transactions: number; amountCents: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const tx = txByDay.get(day);
    points.push({
      day,
      newUsers: userByDay.get(day) ?? 0,
      transactions: tx?.count ?? 0,
      amountCents: tx?.amount_cents ?? 0,
    });
  }

  return { days, points };
}

export interface ListAuditLogQuery {
  action?: string;
  actorType?: "user" | "admin" | "system";
  page: number;
  pageSize: number;
}

export async function listAuditLogs(db: Db, query: ListAuditLogQuery) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.action) {
    conditions.push(`action LIKE ?`);
    params.push(`%${query.action}%`);
  }
  if (query.actorType) {
    conditions.push(`actor_type = ?`);
    params.push(query.actorType);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (query.page - 1) * query.pageSize;

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS count FROM audit_logs ${where}`)
    .bind(...params)
    .first<{ count: number }>();

  const items = await allRows<AuditLogRecord>(
    db
      .prepare(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...params, query.pageSize, offset),
  );

  return paginate(items, totalRow?.count ?? 0, query.page, query.pageSize);
}