import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { usePullDownRefresh, useRouter } from '@tarojs/taro';
import classnames from 'classnames';
import type { AccountDetail } from '@/types/ledger';
import { getAccountDetail } from '@/services/ledger';
import { accountTypeMeta, isDebtAccount } from '@/utils/account-types';
import { currentMonthKey, formatMonthLabel } from '@/utils/dates';
import { formatCents } from '@/utils/money';
import CategoryIcon from '@/components/CategoryIcon';
import EmptyState from '@/components/EmptyState';
import MonthSwitcher from '@/components/MonthSwitcher';
import TransactionRow from '@/components/TransactionRow';
import styles from './index.module.scss';

const AccountDetailPage: React.FC = () => {
  const router = useRouter();
  const accountId = router.params.id || '';
  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const [detail, setDetail] = useState<AccountDetail | null>(null);

  const load = useCallback(async (target: string) => {
    try {
      const data = await getAccountDetail(accountId, target);
      setDetail(data);
    } catch (err) {
      console.error('[AccountDetail] 加载失败', err);
    }
  }, [accountId]);

  useEffect(() => {
    load(monthKey);
  }, [load, monthKey]);

  usePullDownRefresh(async () => {
    await load(monthKey);
    Taro.stopPullDownRefresh();
  });

  const goTransaction = (id: string) => {
    Taro.navigateTo({ url: `/pages/transaction-detail/index?id=${id}` });
  };

  if (!detail) {
    return (
      <View className="pageRoot">
        <EmptyState icon="⏳" title="加载中…" />
      </View>
    );
  }

  const meta = accountTypeMeta(detail.account.type);
  const negative = detail.account.balanceCents < 0;

  return (
    <View className="pageRoot">
      <View className={styles.hero}>
        <View className={styles.heroTop}>
          <CategoryIcon icon={detail.account.icon} color={detail.account.color} size={88} />
          <View className={styles.heroBody}>
            <Text className={styles.heroName}>{detail.account.name}</Text>
            <Text className={styles.heroType}>{meta.label}</Text>
          </View>
        </View>
        <Text className={styles.heroLabel}>账户余额</Text>
        <Text className={classnames(styles.heroBalance, negative && styles.debt)}>
          {formatCents(detail.account.balanceCents)}
        </Text>
        <View className={styles.heroMeta}>
          <View className={styles.metaItem}>
            <Text className={styles.metaLabel}>本月收入</Text>
            <Text className={styles.metaValue}>{formatCents(detail.incomeCents)}</Text>
          </View>
          <View className={styles.metaItem}>
            <Text className={styles.metaLabel}>本月支出</Text>
            <Text className={styles.metaValue}>{formatCents(detail.expenseCents)}</Text>
          </View>
          <View className={styles.metaItem}>
            <Text className={styles.metaLabel}>账户类型</Text>
            <Text className={styles.metaValue}>{isDebtAccount(detail.account.type) ? '负债' : '资产'}</Text>
          </View>
        </View>
      </View>

      <MonthSwitcher monthKey={monthKey} onChange={setMonthKey} />

      <View className={styles.listHeader}>
        <Text className={styles.listTitle}>{formatMonthLabel(monthKey)}流水（{detail.transactions.length}）</Text>
      </View>

      {detail.transactions.length > 0 ? (
        detail.transactions.map((item) => (
          <TransactionRow key={item._id} item={item} showAccount={false} onClick={() => goTransaction(item._id)} />
        ))
      ) : (
        <EmptyState icon="🧾" title="该月暂无流水" />
      )}
    </View>
  );
};

export default AccountDetailPage;
