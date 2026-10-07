// H5 预览 mock：saveBudget 云函数
import { currentMonthKey } from '@/utils/dates';
import { mockBudgets, nextId } from './mockStore';

interface Payload {
  action: 'create' | 'update' | 'delete';
  id?: string;
  monthKey?: string;
  categoryId?: string;
  amountCents?: number;
}

export default function saveBudget(data: Payload): { id?: string } {
  const { action } = data;

  if (action === 'delete') {
    const index = mockBudgets.findIndex((item) => item._id === data.id);
    if (index >= 0) mockBudgets.splice(index, 1);
    return { id: data.id };
  }

  if (action === 'update') {
    const target = mockBudgets.find((item) => item._id === data.id);
    if (target) {
      Object.assign(target, {
        monthKey: data.monthKey || target.monthKey,
        categoryId: data.categoryId,
        amountCents: typeof data.amountCents === 'number' ? data.amountCents : target.amountCents
      });
    }
    return { id: data.id };
  }

  const monthKey = data.monthKey || currentMonthKey();
  const existing = mockBudgets.find(
    (item) => item.monthKey === monthKey && item.categoryId === data.categoryId
  );
  if (existing) {
    existing.amountCents = data.amountCents || 0;
    return { id: existing._id };
  }

  const id = nextId('b');
  mockBudgets.push({ _id: id, monthKey, categoryId: data.categoryId, amountCents: data.amountCents || 0 });
  return { id };
}
