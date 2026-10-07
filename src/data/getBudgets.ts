// H5 预览 mock：getBudgets 云函数
import type { Budget } from '@/types/ledger';
import { currentMonthKey } from '@/utils/dates';
import { mockBudgets } from './mockStore';

interface Payload {
  monthKey?: string;
}

export default function getBudgets(data: Payload = {}): Budget[] {
  const monthKey = data.monthKey || currentMonthKey();
  return mockBudgets.filter((item) => item.monthKey === monthKey);
}
