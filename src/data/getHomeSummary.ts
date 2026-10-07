// H5 预览 mock：getHomeSummary 云函数
import type { HomeSummary } from '@/types/ledger';
import { currentMonthKey } from '@/utils/dates';
import { homeSummary } from './mockStore';

interface Payload {
  monthKey?: string;
}

export default function getHomeSummary(data: Payload = {}): HomeSummary {
  return homeSummary(data.monthKey || currentMonthKey());
}
