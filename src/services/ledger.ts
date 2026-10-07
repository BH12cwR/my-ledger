// ============================================
// 业务服务层：统一通过 services/cloud.ts 调用云函数
// 微信平台走真实云函数，H5/其它平台自动走 src/data/<functionName>.ts mock
// ============================================
import { callFunction } from '@/services/cloud';
import type {
  Account,
  AccountDetail,
  Budget,
  Category,
  CategoryKind,
  HomeSummary,
  StatsOverview,
  Tag,
  Transaction,
  TransactionQuery,
  TransactionView,
  User
} from '@/types/ledger';

/* ---------------- 登录 ---------------- */
export function fetchMe(): Promise<User | null> {
  return callFunction<User | null>('login', { action: 'me' });
}

export function wechatLogin(): Promise<User> {
  return callFunction<User>('login', { action: 'login' });
}

/* ---------------- 首页 ---------------- */
export function getHomeSummary(monthKey: string): Promise<HomeSummary> {
  return callFunction<HomeSummary>('getHomeSummary', { monthKey });
}

/* ---------------- 流水 ---------------- */
export function getTransactions(query: TransactionQuery): Promise<TransactionView[]> {
  return callFunction<TransactionView[]>('getTransactions', query);
}

export interface SaveTransactionPayload {
  action: 'create' | 'update' | 'delete' | 'refund';
  id?: string;
  type?: Transaction['type'];
  amountCents?: number;
  accountId?: string;
  toAccountId?: string;
  categoryId?: string;
  tagIds?: string[];
  happenedAt?: number;
  note?: string;
  refundedFromId?: string;
}

export function mutateTransaction(payload: SaveTransactionPayload): Promise<{ id?: string }> {
  return callFunction<{ id?: string }>('saveTransaction', payload as unknown as Record<string, unknown>);
}

/* ---------------- 统计 ---------------- */
export interface StatsParams {
  monthKey: string;
  categoryId?: string;
}

export function getStats(params: StatsParams): Promise<StatsOverview> {
  return callFunction<StatsOverview>('getStats', params as unknown as Record<string, unknown>);
}

/* ---------------- 账户 ---------------- */
export function getAccounts(): Promise<Account[]> {
  return callFunction<Account[]>('getAccounts', {});
}

export interface SaveAccountPayload {
  action: 'create' | 'update' | 'delete';
  id?: string;
  name?: string;
  type?: Account['type'];
  icon?: string;
  color?: string;
  initialBalanceCents?: number;
}

export function mutateAccount(payload: SaveAccountPayload): Promise<{ id?: string }> {
  return callFunction<{ id?: string }>('saveAccount', payload as unknown as Record<string, unknown>);
}

export function getAccountDetail(accountId: string, monthKey?: string): Promise<AccountDetail> {
  return callFunction<AccountDetail>('getAccountDetail', { accountId, monthKey });
}

/* ---------------- 分类 ---------------- */
export function getCategories(kind?: CategoryKind): Promise<Category[]> {
  return callFunction<Category[]>('getCategories', { kind });
}

export interface SaveCategoryPayload {
  action: 'create' | 'update' | 'delete';
  id?: string;
  name?: string;
  kind?: CategoryKind;
  icon?: string;
  color?: string;
}

export function mutateCategory(payload: SaveCategoryPayload): Promise<{ id?: string }> {
  return callFunction<{ id?: string }>('saveCategory', payload as unknown as Record<string, unknown>);
}

/* ---------------- 标签 ---------------- */
export function getTags(): Promise<Tag[]> {
  return callFunction<Tag[]>('getTags', {});
}

export interface SaveTagPayload {
  action: 'create' | 'update' | 'delete';
  id?: string;
  name?: string;
  color?: string;
}

export function mutateTag(payload: SaveTagPayload): Promise<{ id?: string }> {
  return callFunction<{ id?: string }>('saveTag', payload as unknown as Record<string, unknown>);
}

/* ---------------- 预算 ---------------- */
export function getBudgets(monthKey?: string): Promise<Budget[]> {
  return callFunction<Budget[]>('getBudgets', { monthKey });
}

export interface SaveBudgetPayload {
  action: 'create' | 'update' | 'delete';
  id?: string;
  monthKey?: string;
  categoryId?: string;
  amountCents?: number;
}

export function mutateBudget(payload: SaveBudgetPayload): Promise<{ id?: string }> {
  return callFunction<{ id?: string }>('saveBudget', payload as unknown as Record<string, unknown>);
}
