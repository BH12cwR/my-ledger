import type { TransactionType } from '@/types/ledger';

/** 金额符号：支出 -、收入 +、转账空 */
export function amountSign(type: TransactionType): string {
  if (type === 'expense') return '-';
  if (type === 'income') return '+';
  return '';
}

export const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  expense: '支出',
  income: '收入',
  transfer: '转账'
};

/** 文本首字（用于无图标时的占位） */
export function initialOf(text: string): string {
  return (text || '?').trim().slice(0, 1);
}
