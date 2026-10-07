import type { AccountType } from '@/types/ledger';

export interface AccountTypeMeta {
  value: AccountType;
  label: string;
  icon: string;
  color: string;
}

export const ACCOUNT_TYPES: AccountTypeMeta[] = [
  { value: 'cash', label: '现金', icon: '💵', color: '#00b578' },
  { value: 'alipay', label: '支付宝', icon: '🅰️', color: '#1677ff' },
  { value: 'wechat', label: '微信', icon: '💬', color: '#07c160' },
  { value: 'bank', label: '银行卡', icon: '🏦', color: '#ff8f1f' },
  { value: 'credit', label: '信用卡', icon: '💳', color: '#f5222d' },
  { value: 'investment', label: '投资', icon: '📈', color: '#7a5af8' },
  { value: 'other', label: '其他', icon: '📦', color: '#86909c' }
];

export function accountTypeMeta(type: AccountType): AccountTypeMeta {
  return ACCOUNT_TYPES.find((item) => item.value === type) || ACCOUNT_TYPES[ACCOUNT_TYPES.length - 1];
}

/** 负债类账户（余额为负向语义） */
export function isDebtAccount(type: AccountType): boolean {
  return type === 'credit';
}
