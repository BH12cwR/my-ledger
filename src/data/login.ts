// H5 预览 mock：login 云函数
// 预览态始终返回 mock 用户，便于直接体验全部功能
import type { User } from '@/types/ledger';
import { mockUser } from './mockStore';

interface LoginPayload {
  action?: 'me' | 'login';
}

export default function login(_data: LoginPayload = {}): User {
  return mockUser;
}
