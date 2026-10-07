import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { usePullDownRefresh, useRouter } from '@tarojs/taro';
import type { Category, TransactionView } from '@/types/ledger';
import { getCategories, getTransactions } from '@/services/ledger';
import { currentMonthKey, formatMonthLabel } from '@/utils/dates';
import AmountText from '@/components/AmountText';
import CategoryIcon from '@/components/CategoryIcon';
import EmptyState from '@/components/EmptyState';
import MonthSwitcher from '@/components/MonthSwitcher';
import TransactionRow from '@/components/TransactionRow';
import styles from './index.module.scss';

const CategoryDetailPage: React.FC = () => {
  const router = useRouter();
  const categoryId = router.params.id || '';
  const [monthKey, setMonthKey] = useState<string>(router.params.month || currentMonthKey());
  const [category, setCategory] = useState<Category | null>(null);
  const [list, setList] = useState<TransactionView[]>([]);

  const load = useCallback(
    async (target: string) => {
      try {
        const [categories, transactions] = await Promise.all([
          getCategories(),
          getTransactions({ categoryId, monthKey: target })
        ]);
        setCategory(categories.find((item) => item._id === categoryId) || null);
        setList(transactions);
      } catch (err) {
        console.error('[CategoryDetail] 加载失败', err);
      }
    },
    [categoryId]
  );

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

  const totalCents = list.reduce((acc, item) => acc + item.amountCents, 0);

  return (
    <View className="pageRoot">
      <View className={styles.hero}>
        <CategoryIcon
          icon={category ? category.icon : '📦'}
          color={category ? category.color : '#86909c'}
          size={96}
        />
        <Text className={styles.heroName}>{category ? category.name : '分类'}</Text>
        <Text className={styles.heroKind}>{category && category.kind === 'income' ? '收入分类' : '支出分类'}</Text>
        <Text className={styles.heroLabel}>本月合计</Text>
        <AmountText
          cents={totalCents}
          type={category ? category.kind : undefined}
          size="xl"
          className={styles.heroTotal}
        />
        <Text className={styles.heroCount}>共 {list.length} 笔</Text>
      </View>

      <MonthSwitcher monthKey={monthKey} onChange={setMonthKey} />

      <View className={styles.listHeader}>
        <Text className={styles.listTitle}>{formatMonthLabel(monthKey)}流水</Text>
      </View>

      {list.length > 0 ? (
        list.map((item) => (
          <TransactionRow key={item._id} item={item} showAccount onClick={goTransaction} />
        ))
      ) : (
        <EmptyState icon="🧾" title="该月暂无流水" />
      )}
    </View>
  );
};

export default CategoryDetailPage;
