// ============================================
// 账本业务类型定义
// ============================================

export type TransactionType = 'expense' | 'income' | 'transfer';

export type AccountType = 'cash' | 'bank' | 'credit' | 'alipay' | 'wechat' | 'investment' | 'other';

export type CategoryKind = 'expense' | 'income';

export interface User {
  _id?: string;
  openid: string;
  nickname: string;
  avatar: string;
  createdAt?: number;
}

export interface Account {
  _id: string;
  name: string;
  type: AccountType;
  icon: string;
  color: string;
  initialBalanceCents: number;
  /** 由云函数聚合出的当前余额（分） */
  balanceCents: number;
  archived: boolean;
  sortOrder: number;
}

export interface Category {
  _id: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  isSystem: boolean;
  sortOrder: number;
}

export interface Tag {
  _id: string;
  name: string;
  color: string;
}

export interface Transaction {
  _id: string;
  type: TransactionType;
  amountCents: number;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  tagIds: string[];
  /** Unix 毫秒（UTC） */
  happenedAt: number;
  /** YYYY-MM-DD（UTC+8） */
  happenedOn: string;
  /** YYYY-MM（UTC+8） */
  monthKey: string;
  note: string;
  refundedFromId?: string;
  refundedAmountCents?: number;
  createdAt?: number;
}

export interface Budget {
  _id: string;
  /** YYYY-MM；为空表示通用预算 */
  monthKey: string;
  categoryId?: string;
  amountCents: number;
}

/** 首页汇总 */
export interface HomeSummary {
  monthKey: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  /** 近七日支出，按日期升序 */
  recentDays: { dateKey: string; expenseCents: number }[];
  /** 最近流水 */
  recentTransactions: Transaction[];
}

/** 统计概览 */
export interface StatsOverview {
  monthKey: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  /** 分类排行 */
  categoryRanks: { categoryId: string; name: string; icon: string; color: string; amountCents: number; ratio: number }[];
  /** 按日趋势 */
  trend: { dateKey: string; incomeCents: number; expenseCents: number }[];
}

/** 账户明细 */
export interface AccountDetail {
  account: Account;
  incomeCents: number;
  expenseCents: number;
  transactions: Transaction[];
}

/** 交易列表查询参数 */
export interface TransactionQuery {
  monthKey?: string;
  keyword?: string;
  type?: TransactionType | '';
  categoryId?: string;
  accountId?: string;
  tagId?: string;
  minAmountCents?: number;
  maxAmountCents?: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
  skip?: number;
}

/** 搜索筛选条件 */
export interface SearchFilters {
  keyword?: string;
  type?: TransactionType | '';
  categoryId?: string;
  accountId?: string;
  tagId?: string;
  minAmountCents?: number;
  maxAmountCents?: number;
  startDate?: string;
  endDate?: string;
}

/** 交易聚合后的展示态（附带名称，减少页面侧查表） */
export interface TransactionView extends Transaction {
  accountName: string;
  toAccountName?: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  tagNames: string[];
}
