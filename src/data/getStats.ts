// H5 预览 mock：getStats 云函数
import type { StatsOverview } from '@/types/ledger';
import { currentMonthKey } from '@/utils/dates';
import { statsOf } from './mockStore';

interface Payload {
  monthKey?: string;
  categoryId?: string;
}

export default function getStats(data: Payload = {}): StatsOverview {
  return statsOf(data.monthKey || currentMonthKey(), data.categoryId);
}
