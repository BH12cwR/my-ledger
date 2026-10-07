// H5 预览 mock：getAccountDetail 云函数
import type { AccountDetail } from '@/types/ledger';
import { accountDetailOf } from './mockStore';

interface Payload {
  accountId: string;
  monthKey?: string;
}

export default function getAccountDetail(data: Payload): AccountDetail {
  return accountDetailOf(data.accountId, data.monthKey);
}
