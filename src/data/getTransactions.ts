// H5 预览 mock：getTransactions 云函数
import type { TransactionQuery, TransactionView } from '@/types/ledger';
import { queryTransactions } from './mockStore';

export default function getTransactions(data: TransactionQuery = {}): TransactionView[] {
  return queryTransactions(data);
}
