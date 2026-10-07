import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import type { TransactionType, TransactionView } from '@/types/ledger';
import { getTransactions } from '@/services/ledger';
import { currentMonthKey, dateLabelOf, weekdayLabel } from '@/utils/dates';
import { formatCents } from '@/utils/money';
import EmptyState from '@/components/EmptyState';
import MonthSwitcher from '@/components/MonthSwitcher';
import SegmentedControl from '@/components/SegmentedControl';
import TransactionRow from '@/components/TransactionRow';
import styles from './index.module.scss';

const TYPE_OPTIONS = [
  { label: '全部', value: '' },
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' },
  { label: '转账', value: 'transfer' }
];

interface Group {
  dateKey: string;
  totalCents: number;
  items: TransactionView[];
}

const TransactionsPage: React.FC = () => {
  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const [type, setType] = useState<string>('');
  const [list, setList] = useState<TransactionView[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const load = useCallback(async (targetMonth: string, targetType: string) => {
    setLoading(true);
    try {
      const data = await getTransactions({
        monthKey: targetMonth,
        type: (targetType || '') as TransactionType | ''
      });
      setList(data);
    } catch (err) {
      console.error('[Transactions] 加载失败', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(monthKey, type);
  }, [load, monthKey, type]);

  useDidShow(() => {
    load(monthKey, type);
  });

  usePullDownRefresh(async () => {
    await load(monthKey, type);
    Taro.stopPullDownRefresh();
  });

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    list.forEach((item) => {
      const group = map.get(item.happenedOn) || { dateKey: item.happenedOn, totalCents: 0, items: [] };
      group.items.push(item);
      if (item.type === 'expense') group.totalCents -= item.amountCents;
      if (item.type === 'income') group.totalCents += item.amountCents;
      map.set(item.happenedOn, group);
    });
    return Array.from(map.values());
  }, [list]);

  const totals = useMemo(() => {
    let incomeCents = 0;
    let expenseCents = 0;
    list.forEach((item) => {
      if (item.type === 'income') incomeCents += item.amountCents;
      if (item.type === 'expense') expenseCents += item.amountCents;
    });
    return { incomeCents, expenseCents };
  }, [list]);

  const goDetail = (item: TransactionView) => {
    Taro.navigateTo({ url: `/pages/transaction-detail/index?id=${item._id}` });
  };

  return (
    <View className="pageRoot">
      <View className={styles.searchBar} onClick={() => Taro.navigateTo({ url: '/pages/search/index' })}>
        <Text className={styles.searchIcon}>🔍</Text>
        <Text className={styles.searchPlaceholder}>搜索备注、分类、账户</Text>
      </View>

      <View className={styles.summary}>
        <View className={styles.summaryItem}>
          <Text className={styles.summaryLabel}>{type === 'income' ? '收入合计' : '支出合计'}</Text>
          <Text className={`${styles.summaryValue} ${styles.expense}`}>
            {formatCents(type === 'income' ? totals.incomeCents : totals.expenseCents)}
          </Text>
        </View>
        <View className={styles.summaryItem}>
          <Text className={styles.summaryLabel}>笔数</Text>
          <Text className={styles.summaryValue}>{list.length}</Text>
        </View>
      </View>

      <SegmentedControl options={TYPE_OPTIONS} value={type} onChange={setType} />

      <MonthSwitcher monthKey={monthKey} onChange={setMonthKey} />

      {groups.length > 0 ? (
        groups.map((group) => (
          <View key={group.dateKey} className={styles.group}>
            <View className={styles.groupHeader}>
              <Text className={styles.groupDate}>
                {dateLabelOf(group.dateKey)} · {weekdayLabel(group.dateKey)}
              </Text>
              <Text className={styles.groupTotal}>
                合计 {group.totalCents >= 0 ? '+' : '-'}
                {formatCents(Math.abs(group.totalCents))}
              </Text>
            </View>
            {group.items.map((item) => (
              <TransactionRow key={item._id} item={item} onClick={goDetail} />
            ))}
          </View>
        ))
      ) : (
        <EmptyState
          icon="🧾"
          title={loading ? '加载中…' : '该月暂无流水'}
          desc="换个筛选条件或月份试试"
        />
      )}
    </View>
  );
};

export default TransactionsPage;
