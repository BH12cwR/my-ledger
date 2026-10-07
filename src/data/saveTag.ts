// H5 预览 mock：saveTag 云函数
import { mockTags, nextId } from './mockStore';

interface Payload {
  action: 'create' | 'update' | 'delete';
  id?: string;
  name?: string;
  color?: string;
}

export default function saveTag(data: Payload): { id?: string } {
  const { action } = data;

  if (action === 'delete') {
    const index = mockTags.findIndex((item) => item._id === data.id);
    if (index >= 0) mockTags.splice(index, 1);
    return { id: data.id };
  }

  if (action === 'update') {
    const target = mockTags.find((item) => item._id === data.id);
    if (target) {
      Object.assign(target, {
        name: data.name || target.name,
        color: data.color || target.color
      });
    }
    return { id: data.id };
  }

  const id = nextId('g');
  mockTags.push({ _id: id, name: data.name || '新标签', color: data.color || '#1677ff' });
  return { id };
}
