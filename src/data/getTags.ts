// H5 预览 mock：getTags 云函数
import type { Tag } from '@/types/ledger';
import { mockTags } from './mockStore';

export default function getTags(): Tag[] {
  return mockTags.slice();
}
