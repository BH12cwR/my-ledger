import React, { useCallback, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import type { Account } from '@/types/ledger';
import { getAccounts } from '@/services/ledger';
import { accountTypeMeta, isDebtAccount } from '@/utils/account-types';
import { formatCents } from '@/utils/money';
import CategoryIcon from '@/components/CategoryIcon';
import EmptyState from '@/components/EmptyState';
import SectionCard from '@/components/SectionCard';
import styles from './index.module.scss';

const AssetsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await getAccounts();
      setAccounts(data);
    } catch (err) {
      console.error('[Assets] 加载失败', err);
    }
  }, []);

  useDidShow(() => {
    load();
  });

  const netWorthCents = accounts.reduce((acc, item) => acc + item.balanceCents, 0);
  const assetCents = accounts
    .filter((item) => !isDebtAccount(item.type))
    .reduce((acc, item) => acc + item.balanceCents, 0);
  const debtCents = accounts
    .filter((item) => isDebtAccount(item.type))
    .reduce((acc, item) => acc + item.balanceCents, 0);

  return (
    <View className="pageRoot">
      <View className={styles.hero}>
        <Text className={styles.heroLabel}>净资产</Text>
        <Text className={styles.heroValue}>{formatCents(netWorthCents)}</Text>
        <View className={styles.heroMeta}>
          <View className={styles.metaItem}>
            <Text className={styles.metaLabel}>总资产</Text>
            <Text className={styles.metaValue}>{formatCents(assetCents)}</Text>
          </View>
          <View className={styles.metaItem}>
            <Text className={styles.metaLabel}>负债</Text>
            <Text className={styles.metaValue}>{formatCents(Math.abs(debtCents))}</Text>
          </View>
        </View>
      </View>

      <SectionCard
        title={`账户（${accounts.length}）`}
        extraText="管理"
        onExtraClick={() => Taro.navigateTo({ url: '/pages/accounts/index' })}
      >
        {accounts.length > 0 ? (
          accounts.map((item) => {
            const meta = accountTypeMeta(item.type);
            const negative = item.balanceCents < 0;
            return (
              <View
                key={item._id}
                className={styles.accountRow}
                onClick={() => Taro.navigateTo({ url: `/pages/account-detail/index?id=${item._id}` })}
              >
                <CategoryIcon icon={item.icon} color={item.color} size={72} />
                <View className={styles.accountBody}>
                  <Text className={styles.accountName}>{item.name}</Text>
                  <Text className={styles.accountType}>{meta.label}</Text>
                </View>
                <View className={styles.accountRight}>
                  <Text className={classnames(styles.accountBalance, negative && styles.debt)}>
                    {formatCents(item.balanceCents)}
                  </Text>
                  <Text className={styles.arrow}>›</Text>
                </View>
              </View>
            );
          })
        ) : (
          <EmptyState
            icon="💳"
            title="还没有账户"
            desc="先创建一个账户开始记账"
            actionText="去创建"
            onAction={() => Taro.navigateTo({ url: '/pages/accounts/index' })}
          />
        )}
      </SectionCard>
    </View>
  );
};

export default AssetsPage;
