import { create } from 'zustand';
import Taro from '@tarojs/taro';
import type { User } from '@/types/ledger';
import { callFunction } from '@/services/cloud';

interface UserState {
  user: User | null;
  loading: boolean;
  loaded: boolean;
  refresh: () => Promise<User | null>;
  login: () => Promise<User>;
  logout: () => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  loading: false,
  loaded: false,

  refresh: async () => {
    if (get().loading) return get().user;
    set({ loading: true });
    try {
      const user = await callFunction<User | null>('login', { action: 'me' });
      set({ user: user || null, loaded: true, loading: false });
      return user || null;
    } catch (err) {
      console.error('[UserStore] refresh 失败', err);
      set({ loading: false, loaded: true });
      return null;
    }
  },

  login: async () => {
    set({ loading: true });
    try {
      const user = await callFunction<User>('login', { action: 'login' });
      set({ user, loaded: true, loading: false });
      console.info('[UserStore] 登录成功', user.openid);
      return user;
    } catch (err) {
      console.error('[UserStore] 登录失败', err);
      set({ loading: false });
      throw err;
    }
  },

  logout: () => {
    set({ user: null, loaded: true });
    if (process.env.TARO_ENV === 'weapp') {
      Taro.removeStorageSync('ledger_user');
    }
    console.info('[UserStore] 已退出登录');
  }
}));

/** 确保已登录，未登录则跳转登录页 */
export async function ensureLogin(): Promise<User | null> {
  const state = useUserStore.getState();
  if (state.user) return state.user;
  const user = await state.refresh();
  if (!user) {
    Taro.navigateTo({ url: '/pages/login/index' });
    return null;
  }
  return user;
}
