// H5 预览 mock：getAccounts 云函数
import type { Account } from '@/types/ledger';
import { accountWithBalance } from './mockStore';

export default function getAccounts(): Account[] {
  return accountWithBalance().sort((a, b) => a.sortOrder - b.sortOrder);
}
