import type { AccountRecord, Db, Env, UserRecord } from "../db/types";
import { ApiError } from "../http/errors";
import {
  hashPassword,
  LOCK_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
  needsRehash,
  resolvePbkdf2Iterations,
  validateUserPasswordStrength,
  verifyPassword,
} from "../auth/password";
import { createSession, USER_SESSION_TTL_SECONDS } from "../auth/session";
import { allRows, paginate, type Paginated } from "./common";
import { recordAudit } from "./audit";

/**
 * 用户与资金账户服务。
 *
 * 说明：云端 Functions 无状态，所有数据写入都必须显式指定列，
 * 不做「读-改-写」的隐式覆盖，避免并发下丢失字段。
 */

/** 用户名列在库中统一为小写，避免 `Demo` 与 `demo` 被当成两个账号 */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export interface WechatProfileInput {
  openid: string;
  unionid: string | null;
  nickname: string;
  avatarUrl: string | null;
}

/** 微信登录 upsert：优先按 unionid 归并同一开放平台下的多应用账号 */
export async function upsertWechatUser(
  db: Db,
  profile: WechatProfileInput,
  now = Date.now(),
): Promise<UserRecord> {
  const existing = await db
    .prepare(
      `SELECT * FROM users
        WHERE (unionid IS NOT NULL AND unionid = ?) OR openid = ?
        LIMIT 1`,
    )
    .bind(profile.unionid, profile.openid)
    .first<UserRecord>();

  if (existing) {
    await db
      .prepare(
        `UPDATE users
            SET openid = ?,
                unionid = COALESCE(?, unionid),
                nickname = ?,
                avatar_url = COALESCE(?, avatar_url),
                last_login_at = ?,
                updated_at = ?
          WHERE id = ?`,
      )
      .bind(
        profile.openid,
        profile.unionid,
        profile.nickname,
        profile.avatarUrl,
        now,
        now,
        existing.id,
      )
      .run();

    if (existing.status !== "active") {
      throw ApiError.forbidden("该账号已被停用，请联系管理员");
    }

    // 返回值必须与上面 SET 的结果一致：unionid / avatar_url 走 COALESCE，
    // 因此只有 profile 提供了新值时才覆盖，否则保留库中的旧值。
    return {
      ...existing,
      openid: profile.openid,
      unionid: profile.unionid ?? existing.unionid,
      nickname: profile.nickname,
      avatar_url: profile.avatarUrl ?? existing.avatar_url,
      last_login_at: now,
      updated_at: now,
    };
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO users
         (id, openid, unionid, nickname, avatar_url, status, currency, timezone, last_login_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', 'CNY', 'Asia/Shanghai', ?, ?, ?)`,
    )
    .bind(id, profile.openid, profile.unionid, profile.nickname, profile.avatarUrl, now, now, now)
    .run();

  await ensureDefaultAccounts(db, id, now);

  return {
    id,
    openid: profile.openid,
    unionid: profile.unionid,
    username: null,
    password_hash: null,
    failed_attempts: 0,
    locked_until: null,
    password_updated_at: null,
    nickname: profile.nickname,
    avatar_url: profile.avatarUrl,
    status: "active",
    currency: "CNY",
    timezone: "Asia/Shanghai",
    last_login_at: now,
    created_at: now,
    updated_at: now,
  };
}

/** 新用户首次登录时初始化默认资金账户，保证「记一笔」可以立即使用 */
export async function ensureDefaultAccounts(db: Db, userId: string, now = Date.now()): Promise<void> {
  const existing = await db
    .prepare(`SELECT COUNT(*) AS count FROM accounts WHERE user_id = ?`)
    .bind(userId)
    .first<{ count: number }>();
  if ((existing?.count ?? 0) > 0) return;

  const defaults: Array<Pick<AccountRecord, "name" | "type" | "icon" | "sort_order">> = [
    { name: "现金", type: "cash", icon: "banknote", sort_order: 10 },
    { name: "微信钱包", type: "wechat", icon: "message-circle", sort_order: 20 },
    { name: "支付宝", type: "alipay", icon: "wallet", sort_order: 30 },
  ];

  await db.batch(
    defaults.map((item) =>
      db
        .prepare(
          `INSERT INTO accounts
             (id, user_id, name, type, icon, initial_balance_cents, sort_order, archived_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?)`,
        )
        .bind(crypto.randomUUID(), userId, item.name, item.type, item.icon, item.sort_order, now, now),
    ),
  );
}

export async function getUserById(db: Db, userId: string): Promise<UserRecord | null> {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).bind(userId).first<UserRecord>();
}

export async function getUserByUsername(db: Db, username: string): Promise<UserRecord | null> {
  return db
    .prepare(`SELECT * FROM users WHERE username = ?`)
    .bind(normalizeUsername(username))
    .first<UserRecord>();
}

export interface UserAuthResult {
  user: UserRecord;
  token: string;
  sessionId: string;
  expiresAt: number;
}

/**
 * 账号密码自助注册：创建账号 -> 初始化默认账户 -> 直接签发会话（注册即登录）。
 * 用户名唯一性由 idx_users_username 保证，这里先查一次是为了给出友好的 409 文案。
 */
export async function registerUserWithPassword(
  db: Db,
  env: Env,
  input: { username: string; password: string; nickname?: string },
  request: Request,
  now = Date.now(),
): Promise<UserAuthResult> {
  const strengthError = validateUserPasswordStrength(input.password);
  if (strengthError) throw ApiError.badRequest(strengthError);

  const username = normalizeUsername(input.username);
  const existing = await getUserByUsername(db, username);
  if (existing) throw ApiError.conflict("该用户名已被注册");

  const id = crypto.randomUUID();
  const nickname = (input.nickname?.trim() || input.username.trim()).slice(0, 20);
  const passwordHash = await hashPassword(
    input.password,
    resolvePbkdf2Iterations(env.USER_PBKDF2_ITERATIONS),
  );

  await db
    .prepare(
      `INSERT INTO users
         (id, openid, unionid, username, password_hash, failed_attempts, locked_until,
          password_updated_at, nickname, avatar_url, status, currency, timezone,
          last_login_at, created_at, updated_at)
       VALUES (?, NULL, NULL, ?, ?, 0, NULL, ?, ?, NULL, 'active', 'CNY', 'Asia/Shanghai', ?, ?, ?)`,
    )
    .bind(id, username, passwordHash, now, nickname, now, now, now)
    .run();

  await ensureDefaultAccounts(db, id, now);

  const user = await getUserById(db, id);
  if (!user) throw ApiError.internal("创建用户失败");

  const session = await createSession(db, env, {
    principalType: "user",
    principalId: id,
    request,
    ttlSeconds: USER_SESSION_TTL_SECONDS,
  });

  await recordAudit(db, {
    actorType: "user",
    actorId: id,
    action: "user.register",
    targetType: "user",
    targetId: id,
    detail: { username },
    request,
  });

  return {
    user,
    token: session.token,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
  };
}

/**
 * 账号密码登录：口令校验 + 失败次数限制 + 会话签发。
 * 策略与管理员登录完全一致（统一文案、5 次锁定 15 分钟），仅落库表不同。
 */
export async function authenticateUserWithPassword(
  db: Db,
  env: Env,
  input: { username: string; password: string },
  request: Request,
  ttlSeconds = USER_SESSION_TTL_SECONDS,
  now = Date.now(),
): Promise<UserAuthResult> {
  const username = normalizeUsername(input.username);
  const user = await getUserByUsername(db, username);

  // 统一错误文案，避免暴露「用户名是否存在」
  const genericFailure = ApiError.unauthorized("用户名或密码不正确");

  if (!user) {
    await recordAudit(db, {
      actorType: "system",
      action: "user.login.failed",
      targetType: "user",
      targetId: username,
      detail: { reason: "unknown_username" },
      request,
    });
    throw genericFailure;
  }

  if (!user.password_hash) {
    // 纯微信账号没有口令，对外仍是同一个 401，仅在审计里区分原因
    await recordAudit(db, {
      actorType: "system",
      action: "user.login.failed",
      targetType: "user",
      targetId: user.id,
      detail: { reason: "password_not_set" },
      request,
    });
    throw genericFailure;
  }

  if (user.locked_until && user.locked_until > now) {
    const minutes = Math.ceil((user.locked_until - now) / 60000);
    throw ApiError.tooManyRequests(`账号因多次登录失败已被锁定，请 ${minutes} 分钟后再试`);
  }

  if (user.status !== "active") {
    throw ApiError.forbidden("该账号已被停用，请联系管理员");
  }

  const passwordMatched = await verifyPassword(input.password, user.password_hash);

  if (!passwordMatched) {
    const failedAttempts = user.failed_attempts + 1;
    const lockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS ? now + LOCK_DURATION_MS : null;
    await db
      .prepare(`UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?`)
      .bind(failedAttempts, lockedUntil, now, user.id)
      .run();

    await recordAudit(db, {
      actorType: "system",
      action: "user.login.failed",
      targetType: "user",
      targetId: user.id,
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
  const iterations = resolvePbkdf2Iterations(env.USER_PBKDF2_ITERATIONS);
  const passwordHash = needsRehash(user.password_hash, iterations)
    ? await hashPassword(input.password, iterations)
    : user.password_hash;

  await db
    .prepare(
      `UPDATE users
          SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ?, password_hash = ?
        WHERE id = ?`,
    )
    .bind(now, now, passwordHash, user.id)
    .run();

  const session = await createSession(db, env, {
    principalType: "user",
    principalId: user.id,
    request,
    ttlSeconds,
  });

  await recordAudit(db, {
    actorType: "user",
    actorId: user.id,
    action: "user.login.password",
    targetType: "user",
    targetId: user.id,
    request,
  });

  return {
    user: {
      ...user,
      password_hash: passwordHash,
      failed_attempts: 0,
      locked_until: null,
      last_login_at: now,
      updated_at: now,
    },
    token: session.token,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
  };
}

export interface ListUsersQuery {
  keyword?: string;
  status?: "active" | "disabled";
  page: number;
  pageSize: number;
}

export async function listUsers(db: Db, query: ListUsersQuery): Promise<Paginated<UserRecord>> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.keyword) {
    conditions.push(`(nickname LIKE ? OR username LIKE ? OR openid LIKE ? OR unionid LIKE ?)`);
    const like = `%${query.keyword}%`;
    params.push(like, like, like, like);
  }
  if (query.status) {
    conditions.push(`status = ?`);
    params.push(query.status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (query.page - 1) * query.pageSize;

  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS count FROM users ${where}`)
    .bind(...params)
    .first<{ count: number }>();

  const items = await allRows<UserRecord>(
    db
      .prepare(`SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...params, query.pageSize, offset),
  );

  return paginate(items, totalRow?.count ?? 0, query.page, query.pageSize);
}

export async function setUserStatus(
  db: Db,
  userId: string,
  status: "active" | "disabled",
  now = Date.now(),
): Promise<UserRecord> {
  const user = await getUserById(db, userId);
  if (!user) throw ApiError.notFound("用户不存在");

  await db
    .prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(status, now, userId)
    .run();

  return { ...user, status, updated_at: now };
}

/** 用户维度的账目统计，供后台用户列表展示 */
export async function getUserStats(db: Db, userId: string): Promise<{
  transactionCount: number;
  totalExpenseCents: number;
  totalIncomeCents: number;
  lastTransactionAt: number | null;
}> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS transaction_count,
         COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END), 0) AS total_expense_cents,
         COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_cents ELSE 0 END), 0) AS total_income_cents,
         MAX(happened_at) AS last_transaction_at
       FROM transactions
       WHERE user_id = ? AND deleted_at IS NULL`,
    )
    .bind(userId)
    .first<{
      transaction_count: number;
      total_expense_cents: number;
      total_income_cents: number;
      last_transaction_at: number | null;
    }>();

  return {
    transactionCount: row?.transaction_count ?? 0,
    totalExpenseCents: row?.total_expense_cents ?? 0,
    totalIncomeCents: row?.total_income_cents ?? 0,
    lastTransactionAt: row?.last_transaction_at ?? null,
  };
}