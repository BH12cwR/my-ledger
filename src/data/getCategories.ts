// H5 预览 mock：getCategories 云函数
import type { Category, CategoryKind } from '@/types/ledger';
import { mockCategories } from './mockStore';

interface Payload {
  kind?: CategoryKind;
}

export default function getCategories(data: Payload = {}): Category[] {
  const list = data.kind ? mockCategories.filter((item) => item.kind === data.kind) : mockCategories;
  return list
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
