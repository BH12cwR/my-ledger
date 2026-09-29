import type { D1Database } from "@cloudflare/workers-types";
import type { BudgetPeriod } from "@/lib/dates";

/**
 * D1 数据库句柄。业务服务层统一依赖该类型，便于在集成测试中注入
 * 基于 node:sqlite 的等价实现（见 tests/helpers/d1.ts）。
 */
export type Db = D1Database;

/**
 * Cloudflare Workers 的绑定与变量集合。
 * 与 wrangler.toml 的 [[d1_databases]] / [vars] 以及 .dev.vars 保持一致。
 */
export interface Env {
  DB: D1Database;
  /** 用户端会话 JWT 签名密钥 */
  AUTH_JWT_SECRET: string;
  /** 管理员会话 JWT 签名密钥，必须与用户端不同 */
  ADMIN_JWT_SECRET: string;
  /** 微信开放平台「网站应用」AppID */
  WECHAT_APP_ID?: string;
  /** 微信开放平台「网站应用」AppSecret */
  WECHAT_APP_SECRET?: string;
  /** 微信 OAuth scope，网站扫码登录固定为 snsapi_login */
  WECHAT_OAUTH_SCOPE?: string;
  /** 微信 OAuth 回调地址前缀，例如 https://ledger.example.com */
  WECHAT_OAUTH_REDIRECT_BASE?: string;
  /** 仅本地开发使用的开关，字符串 "true" 才生效 */
  AUTH_DEV_MODE?: string;
  /** 管理员口令 PBKDF2 迭代次数 */
  ADMIN_PBKDF2_ITERATIONS?: string;
  /** 普通用户口令 PBKDF2 迭代次数；未配置时回落到默认值 */
  USER_PBKDF2_ITERATIONS?: string;
  APP_ENV?: string;
}

/** 会话主体类型：普通用户 / 管理员，两套体系完全隔离 */
export type PrincipalType = "user" | "admin";

/** 管理员角色，auditor 仅可读 */
export type AdminRole = "super_admin" | "admin" | "auditor";

export interface AuthContext {
  principalType: PrincipalType;
  principalId: string;
  sessionId: string;
  /** 仅管理员会话存在 */
  adminRole?: AdminRole;
  adminUsername?: string;
}

export interface UserRecord {
  id: string;
  openid: string | null;
  unionid: string | null;
  /** 账号密码登录的登录名，微信账号为 NULL；落库前统一归一为小写 */
  username: string | null;
  /** 与 admin_users.password_hash 同格式的 PBKDF2 哈希，微信账号为 NULL */
  password_hash: string | null;
  failed_attempts: number;
  locked_until: number | null;
  password_updated_at: number | null;
  nickname: string;
  avatar_url: string | null;
  status: "active" | "disabled";
  currency: string;
  timezone: string;
  last_login_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface AdminRecord {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: AdminRole;
  status: "active" | "disabled";
  failed_attempts: number;
  locked_until: number | null;
  must_change_password: number;
  last_login_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface AccountRecord {
  id: string;
  user_id: string;
  name: string;
  type: "cash" | "bank" | "wechat" | "alipay" | "credit" | "other";
  icon: string;
  initial_balance_cents: number;
  sort_order: number;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CategoryRecord {
  id: string;
  user_id: string | null;
  name: string;
  kind: "expense" | "income";
  icon: string;
  color: string;
  sort_order: number;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface TagRecord {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: number;
  updated_at: number;
}

/** 预算周期：自然月 / 自然年 */
export type { BudgetPeriod };

export interface BudgetRecord {
  id: string;
  user_id: string;
  /** NULL 表示总预算（该周期全部支出的合计限额），否则为某个支出分类 */
  category_id: string | null;
  period: BudgetPeriod;
  amount_cents: number;
  created_at: number;
  updated_at: number;
}

export interface TransactionRecord {
  id: string;
  user_id: string;
  account_id: string | null;
  category_id: string | null;
  kind: "expense" | "income" | "transfer";
  amount_cents: number;
  currency: string;
  note: string | null;
  happened_at: number;
  happened_on: string;
  /** 转账的转入账户；非转账为 NULL（account_id 此时是转出账户） */
  to_account_id: string | null;
  /** 退款记录指向被退款的原始支出；普通账目为 NULL */
  refund_of_id: string | null;
  /** 该笔支出已被退款的时间戳；未退款为 NULL */
  refunded_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface AuditLogRecord {
  id: string;
  actor_type: "user" | "admin" | "system";
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: number;
}