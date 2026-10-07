import React, { useCallback, useEffect, useState } from 'react';
import { Image, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { Account } from '@/types/ledger';
import { getAccounts } from '@/services/ledger';
import { formatCents } from '@/utils/money';
import { useUserStore } from '@/store/user';
import SectionCard from '@/components/SectionCard';
import styles from './index.module.scss';

const MENUS = [
  { icon: '💰', label: '账户管理', desc: '增删改账户', url: '/pages/accounts/index' },
  { icon: '🏷️', label: '分类管理', desc: '自定义收支分类', url: '/pages/categories/index' },
  { icon: '🔖', label: '标签管理', desc: '标记消费用途', url: '/pages/tags/index' },
  { icon: '🎯', label: '预算管理', desc: '月度支出计划', url: '/pages/budgets/index' }
];

const MinePage: React.FC = () => {
  const user = useUserStore((state) => state.user);
  const refresh = useUserStore((state) => state.refresh);
  const logout = useUserStore((state) => state.logout);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await getAccounts();
      setAccounts(data);
    } catch (err) {
      console.error('[Mine] 加载失败', err);
    }
  }, []);

  useEffect(() => {
    refresh().then(() => load());
  }, [load, refresh]);

  useDidShow(() => {
    load();
  });

  const netWorthCents = accounts.reduce((acc, item) => acc + item.balanceCents, 0);

  const goLogin = () => {
    Taro.navigateTo({ url: '/pages/login/index' });
  };

  const handleLogout = () => {
    Taro.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (res.confirm) {
          logout();
          Taro.showToast({ title: '已退出登录', icon: 'none' });
        }
      }
    });
  };

  return (
    <View className="pageRoot">
      <View className={styles.profile} onClick={user ? undefined : goLogin}>
        {user ? (
          <Image className={styles.avatar} src={user.avatar} mode="aspectFill" />
        ) : (
          <View className={styles.avatar} />
        )}
        <View className={styles.profileBody}>
          <Text className={styles.nickname}>{user ? user.nickname : '未登录'}</Text>
          <Text className={styles.sub}>
            {user ? `已连接微信账号 · ${accounts.length} 个账户` : '点击登录后开始记账'}
          </Text>
        </View>
      </View>

      <View
        className={styles.netWorthCard}
        onClick={() => Taro.navigateTo({ url: '/pages/assets/index' })}
      >
        <View>
          <Text className={styles.netWorthLabel}>净资产</Text>
          <Text className={styles.netWorthValue}>{formatCents(netWorthCents)}</Text>
        </View>
        <Text className={styles.netWorthArrow}>›</Text>
      </View>

      <SectionCard title="账本设置">
        {MENUS.map((menu) => (
          <View
            key={menu.url}
            className={styles.menuItem}
            onClick={() => Taro.navigateTo({ url: menu.url })}
          >
            <View className={styles.menuIcon}>
              <Text className={styles.menuIconText}>{menu.icon}</Text>
            </View>
            <Text className={styles.menuLabel}>{menu.label}</Text>
            <Text className={styles.menuValue}>{menu.desc}</Text>
            <Text className={styles.menuArrow}>›</Text>
          </View>
        ))}
      </SectionCard>

      {user ? (
        <View className={styles.logout} onClick={handleLogout}>
          <Text className={styles.logoutText}>退出登录</Text>
        </View>
      ) : null}

      <Text className={styles.version}>我的账本 · 微信小程序版 v1.0.0</Text>
    </View>
  );
};

export default MinePage;
