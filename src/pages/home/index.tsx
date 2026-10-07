import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import type { Account, Budget, HomeSummary } from '@/types/ledger';
import { getAccounts, getBudgets, getHomeSummary } from '@/services/ledger';
import { currentMonthKey, formatMonthLabel, weekdayLabel } from '@/utils/dates';
import { formatCents } from '@/utils/money';
import { ensureLogin } from '@/store/user';
import AmountText from '@/components/AmountText';
import BarChart from '@/components/BarChart';
import type { BarItem } from '@/components/BarChart';
import EmptyState from '@/components/EmptyState';
import MonthSwitcher from '@/components/MonthSwitcher';
import ProgressBar from '@/components/ProgressBar';
import SectionCard from '@/components/SectionCard';
import TransactionRow from '@/components/TransactionRow';
import styles from './index.module.scss';

const HomePage: React.FC = () => {
  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    try {
      const [nextSummary, nextAccounts, nextBudgets] = await Promise.all([
        getHomeSummary(target),
        getAccounts(),
        getBudgets(target)
      ]);
      setSummary(nextSummary);
      setAccounts(nextAccounts);
      setBudgets(nextBudgets);
    } catch (err) {
      console.error('[Home] 加载失败', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    ensureLogin().then(() => load(monthKey));
  }, [load, monthKey]);

  useDidShow(() => {
    load(monthKey);
  });

  usePullDownRefresh(async () => {
    await load(monthKey);
    Taro.stopPullDownRefresh();
  });

  const netWorthCents = accounts.reduce((acc, item) => acc + item.balanceCents, 0);
  const totalBudget = budgets.find((item) => !item.categoryId);
  const expenseCents = summary ? summary.expenseCents : 0;
  const budgetPercent = totalBudget && totalBudget.amountCents > 0
    ? Math.round((expenseCents / totalBudget.amountCents) * 100)
    : 0;

  const bars: BarItem[] = (summary ? summary.recentDays : []).map((day) => ({
    label: weekdayLabel(day.dateKey).replace('周', ''),
    value: day.expenseCents,
    highlight: day.dateKey === (summary ? summary.recentDays[summary.recentDays.length - 1]?.dateKey : '')
  }));

  const goNew = () => {
    Taro.navigateTo({ url: '/pages/transaction-new/index' });
  };

  const goAllTransactions = () => {
    Taro.switchTab({ url: '/pages/transactions/index' });
  };

  return (
    <View className="pageRoot">
      <MonthSwitcher monthKey={monthKey} onChange={setMonthKey} />

      <View className={styles.hero}>
        <View className={styles.heroTop}>
          <Text className={styles.heroLabel}>本月结余</Text>
          <Text className={styles.heroMonth}>{formatMonthLabel(monthKey)}</Text>
        </View>
        <AmountText
          className={styles.heroBalance}
          cents={summary ? summary.balanceCents : 0}
          size="xl"
        />
        <View className={styles.heroMeta}>
          <View className={styles.heroMetaItem}>
            <Text className={styles.heroMetaLabel}>收入</Text>
            <Text className={styles.heroMetaValue}>{formatCents(summary ? summary.incomeCents : 0)}</Text>
          </View>
          <View className={styles.heroMetaItem}>
            <Text className={styles.heroMetaLabel}>支出</Text>
            <Text className={styles.heroMetaValue}>{formatCents(expenseCents)}</Text>
          </View>
        </View>
      </View>

      <View className={styles.netWorth}>
        <Text className={styles.netWorthLabel}>净资产</Text>
        <Text className={styles.netWorthValue}>{formatCents(netWorthCents)}</Text>
      </View>

      <SectionCard title="近七日支出">
        {bars.length > 0 ? <BarChart data={bars} showValue /> : <EmptyState icon="📊" title="暂无支出记录" />}
      </SectionCard>

      {totalBudget ? (
        <SectionCard title="本月总预算" extraText="管理" onExtraClick={() => Taro.navigateTo({ url: '/pages/budgets/index' })}>
          <View className={styles.budgetHeader}>
            <Text className={styles.budgetAmount}>
              {formatCents(expenseCents)} / {formatCents(totalBudget.amountCents)}
            </Text>
            <Text className={styles.budgetAmount}>{budgetPercent}%</Text>
          </View>
          <ProgressBar
            percent={budgetPercent}
            color={budgetPercent > 100 ? '#f5222d' : '#1677ff'}
          />
          <Text className={styles.budgetTip}>
            {budgetPercent > 100 ? '已超出预算，注意控制支出' : `剩余 ${formatCents(totalBudget.amountCents - expenseCents)}`}
          </Text>
        </SectionCard>
      ) : null}

      <SectionCard title="最近流水" extraText="查看全部" onExtraClick={goAllTransactions}>
        {summary && summary.recentTransactions.length > 0 ? (
          summary.recentTransactions.map((item) => (
            <TransactionRow
              key={item._id}
              item={item}
              onClick={() => Taro.navigateTo({ url: `/pages/transaction-detail/index?id=${item._id}` })}
            />
          ))
        ) : (
          <EmptyState
            icon="🧾"
            title="本月还没有记账"
            desc="点击右下角按钮记下第一笔"
            actionText="去记一笔"
            onAction={goNew}
          />
        )}
      </SectionCard>

      {loading && !summary ? <View /> : null}

      <View className={styles.addButton} onClick={goNew}>
        <Text className={styles.addButtonText}>＋</Text>
      </View>
    </View>
  );
};

export default HomePage;
