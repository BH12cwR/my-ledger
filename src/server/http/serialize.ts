import type {
  AccountRecord,
  AdminRecord,
  AuditLogRecord,
  CategoryRecord,
  TagRecord,
  UserRecord,
} from "../db/types";
import type { Paginated } from "../services/common";
import type { TransactionView } from "../services/transactions";

/**
 * API 输出的唯一出口。
 *
 * 目的有二：
 *  1. 把数据库的 snake_case 列名收敛为 camelCase 契约，前端无需感知表结构；
 *  2. 显式白名单字段，杜绝 password_hash / openid 之类的敏感列被顺手带出去。
 *
 * 任何新增的对外字段都必须先在这里登记。
 */

export interface UserDto {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  status: "active" | "disabled";
  currency: string;
  timezone: string;
  lastLoginAt: number | null;
  createdAt: number;
}

export function userDto(user: UserRecord): UserDto {
  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatar_url,
    status: user.status,
    currency: user.currency,
    timezone: user.timezone,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
  };
}

export interface AdminDto {
  id: string;
  username: string;
  displayName: string;
  role: AdminRecord["role"];
  status: AdminRecord["status"];
  mustChangePassword: boolean;
  lockedUntil: number | null;
  lastLoginAt: number | null;
  createdAt: number;
}

export function adminDto(admin: Omit<AdminRecord, "password_hash">): AdminDto {
  return {
    id: admin.id,
    username: admin.username,
    displayName: admin.display_name,
    role: admin.role,
    status: admin.status,
    mustChangePassword: admin.must_change_password === 1,
    lockedUntil: admin.locked_until,
    lastLoginAt: admin.last_login_at,
    createdAt: admin.created_at,
  };
}

export interface AccountDto {
  id: string;
  name: string;
  type: AccountRecord["type"];
  icon: string;
  initialBalanceCents: number;
  sortOrder: number;
  archived: boolean;
  createdAt: number;
}

export function accountDto(account: AccountRecord): AccountDto {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    icon: account.icon,
    initialBalanceCents: account.initial_balance_cents,
    sortOrder: account.sort_order,
    archived: account.archived_at !== null,
    createdAt: account.created_at,
  };
}

export interface CategoryDto {
  id: string;
  name: string;
  kind: CategoryRecord["kind"];
  icon: string;
  color: string;
  sortOrder: number;
  /** true 表示系统内置分类，用户不可修改 */
  system: boolean;
  archived: boolean;
}

export function categoryDto(category: CategoryRecord): CategoryDto {
  return {
    id: category.id,
    name: category.name,
    kind: category.kind,
    icon: category.icon,
    color: category.color,
    sortOrder: category.sort_order,
    system: category.user_id === null,
    archived: category.archived_at !== null,
  };
}

export interface TagDto {
  id: string;
  name: string;
  color: string;
}

export function tagDto(tag: TagRecord): TagDto {
  return { id: tag.id, name: tag.name, color: tag.color };
}

export interface TransactionDto {
  id: string;
  kind: TransactionView["kind"];
  /** 金额始终以「分」为单位的整数传输，前端负责展示层格式化 */
  amountCents: number;
  currency: string;
  note: string | null;
  happenedAt: number;
  happenedOn: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  accountId: string | null;
  accountName: string | null;
  accountType: string | null;
  tags: string[];
  /** 仅管理端查询携带 */
  userId?: string;
  userNickname?: string | null;
  createdAt: number;
}

export function transactionDto(view: TransactionView): TransactionDto {
  const dto: TransactionDto = {
    id: view.id,
    kind: view.kind,
    amountCents: view.amount_cents,
    currency: view.currency,
    note: view.note,
    happenedAt: view.happened_at,
    happenedOn: view.happened_on,
    categoryId: view.category_id,
    categoryName: view.category_name,
    categoryIcon: view.category_icon,
    categoryColor: view.category_color,
    accountId: view.account_id,
    accountName: view.account_name,
    accountType: view.account_type,
    tags: view.tags,
    createdAt: view.created_at,
  };
  if (view.user_nickname !== undefined) {
    dto.userId = view.user_id;
    dto.userNickname = view.user_nickname;
  }
  return dto;
}

export interface AuditLogDto {
  id: string;
  actorType: AuditLogRecord["actor_type"];
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
  createdAt: number;
}

export function auditLogDto(row: AuditLogRecord): AuditLogDto {
  let detail: Record<string, unknown> | null = null;
  if (row.detail) {
    try {
      detail = JSON.parse(row.detail) as Record<string, unknown>;
    } catch {
      // 历史脏数据不应导致接口 500，退化为原文透出
      detail = { raw: row.detail };
    }
  }
  return {
    id: row.id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    detail,
    ip: row.ip,
    createdAt: row.created_at,
  };
}

/** 分页结果映射，统一 items / total / page / pageSize / totalPages 结构 */
export function pageDto<TSource, TTarget>(
  page: Paginated<TSource>,
  map: (item: TSource) => TTarget,
): Paginated<TTarget> {
  return {
    items: page.items.map(map),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
  };
}