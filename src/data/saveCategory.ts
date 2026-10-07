// H5 预览 mock：saveCategory 云函数
import type { CategoryKind } from '@/types/ledger';
import { mockCategories, nextId } from './mockStore';

interface Payload {
  action: 'create' | 'update' | 'delete';
  id?: string;
  name?: string;
  kind?: CategoryKind;
  icon?: string;
  color?: string;
}

export default function saveCategory(data: Payload): { id?: string } {
  const { action } = data;

  if (action === 'delete') {
    const index = mockCategories.findIndex((item) => item._id === data.id && !item.isSystem);
    if (index >= 0) mockCategories.splice(index, 1);
    return { id: data.id };
  }

  if (action === 'update') {
    const target = mockCategories.find((item) => item._id === data.id);
    if (target) {
      Object.assign(target, {
        name: data.name || target.name,
        icon: data.icon || target.icon,
        color: data.color || target.color
      });
    }
    return { id: data.id };
  }

  const id = nextId('c');
  const kind = data.kind || 'expense';
  mockCategories.push({
    _id: id,
    name: data.name || '新分类',
    kind,
    icon: data.icon || '📝',
    color: data.color || '#86909c',
    isSystem: false,
    sortOrder: mockCategories.filter((item) => item.kind === kind).length + 1
  });
  return { id };
}
