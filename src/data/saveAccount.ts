// H5 预览 mock：saveAccount 云函数
import type { AccountType } from '@/types/ledger';
import { mockAccounts, nextId } from './mockStore';

interface Payload {
  action: 'create' | 'update' | 'delete';
  id?: string;
  name?: string;
  type?: AccountType;
  icon?: string;
  color?: string;
  initialBalanceCents?: number;
}

export default function saveAccount(data: Payload): { id?: string } {
  const { action } = data;

  if (action === 'delete') {
    const index = mockAccounts.findIndex((item) => item._id === data.id);
    if (index >= 0) mockAccounts.splice(index, 1);
    return { id: data.id };
  }

  if (action === 'update') {
    const target = mockAccounts.find((item) => item._id === data.id);
    if (target) {
      Object.assign(target, {
        name: data.name || target.name,
        type: data.type || target.type,
        icon: data.icon || target.icon,
        color: data.color || target.color,
        initialBalanceCents:
          typeof data.initialBalanceCents === 'number' ? data.initialBalanceCents : target.initialBalanceCents
      });
    }
    return { id: data.id };
  }

  const id = nextId('a');
  mockAccounts.push({
    _id: id,
    name: data.name || '新账户',
    type: data.type || 'other',
    icon: data.icon || '📦',
    color: data.color || '#86909c',
    initialBalanceCents: data.initialBalanceCents || 0,
    balanceCents: data.initialBalanceCents || 0,
    archived: false,
    sortOrder: mockAccounts.length + 1
  });
  return { id };
}
