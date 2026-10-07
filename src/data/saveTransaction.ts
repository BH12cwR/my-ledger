// H5 预览 mock：saveTransaction 云函数
// 直接在内存中维护 mockTransactions，保证预览可完整走通增删改退
import type { Transaction, TransactionType } from '@/types/ledger';
import { dateKeyOf, monthKeyOf } from '@/utils/dates';
import { mockTransactions, nextId } from './mockStore';

interface Payload {
  action: 'create' | 'update' | 'delete' | 'refund';
  id?: string;
  type?: TransactionType;
  amountCents?: number;
  accountId?: string;
  toAccountId?: string;
  categoryId?: string;
  tagIds?: string[];
  happenedAt?: number;
  note?: string;
  refundedFromId?: string;
}

export default function saveTransaction(data: Payload): { id?: string } {
  const { action } = data;

  if (action === 'delete') {
    const index = mockTransactions.findIndex((item) => item._id === data.id);
    if (index >= 0) mockTransactions.splice(index, 1);
    return { id: data.id };
  }

  if (action === 'update') {
    const target = mockTransactions.find((item) => item._id === data.id);
    if (target) {
      const happenedAt = data.happenedAt || target.happenedAt;
      Object.assign(target, {
        type: data.type || target.type,
        amountCents: typeof data.amountCents === 'number' ? data.amountCents : target.amountCents,
        accountId: data.accountId || target.accountId,
        toAccountId: data.toAccountId,
        categoryId: data.categoryId,
        tagIds: data.tagIds || [],
        happenedAt,
        happenedOn: dateKeyOf(happenedAt),
        monthKey: monthKeyOf(happenedAt),
        note: data.note || ''
      });
    }
    return { id: data.id };
  }

  const happenedAt = data.happenedAt || Date.now();
  const record: Transaction = {
    _id: nextId('t'),
    type: data.type || 'expense',
    amountCents: data.amountCents || 0,
    accountId: data.accountId || '',
    toAccountId: data.toAccountId,
    categoryId: data.categoryId,
    tagIds: data.tagIds || [],
    happenedAt,
    happenedOn: dateKeyOf(happenedAt),
    monthKey: monthKeyOf(happenedAt),
    note: data.note || '',
    refundedFromId: action === 'refund' ? data.refundedFromId : undefined,
    createdAt: Date.now()
  };
  mockTransactions.unshift(record);
  return { id: record._id };
}
