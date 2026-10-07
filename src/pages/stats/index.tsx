import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh } from '@tarojs/taro';
import type { StatsOverview } from '@/types/ledger';
import { getStats } from '@/services/ledger';
import { currentMonthKey, formatMonthLabel } from '@/utils/dates';
import { formatCents } from '@/utils/money';
import type { BarItem } from '@/components/BarChart';
import BarChart from '@/components/BarChart';
import CategoryIcon from '@/components/CategoryIcon';
import EmptyState from '@/components/EmptyState';
import MonthSwitcher from '@/components/MonthSwitcher';
import ProgressBar from '@/components/ProgressBar';
import SectionCard from '@/components/SectionCard';
import SegmentedControl from '@/components/SegmentedControl';
import styles from './index.module.scss';

const KIND_OPTIONS = [
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' }
];

const StatsPage: React.FC = () => {
  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const [kind, setKind] = useState<string>('expense');
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    try {
      const data = await getStats({ monthKey: target });
      setOverview(data);
    } catch (err) {
      console.error('[Stats] 加载失败', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(monthKey);
  }, [load, monthKey]);

  useDidShow(() => {
    load(monthKey);
  });

  usePullDownRefresh(async () => {
    await load(monthKey);
    Taro.stopPullDownRefresh();
  });

  const totalCents = kind === 'expense'
    ? (overview ? overview.expenseCents : 0)
    : (overview ? overview.incomeCents : 0);

  const daysInMonth = overview ? overview.trend.length : 30;
  const activeDays = overview ? Math.min(daysInMonth, new Date().getDate()) : 1;
  const averageCents = Math.round(totalCents / Math.max(1, activeDays));
  const maxDayCents = overview
    ? Math.max(0, ...overview.trend.map((day) => (kind === 'expense' ? day.expenseCents : day.incomeCents)))
    : 0;

  const bars: BarItem[] = (overview ? overview.trend : []).map((day) => ({
    label: String(Number(day.dateKey.slice(8))),
    value: kind === 'expense' ? day.expenseCents : day.incomeCents,
    highlight: (kind === 'expense' ? day.expenseCents : day.incomeCents) === maxDayCents && maxDayCents > 0
  }));

  const ranks = kind === 'expense' ? (overview ? overview.categoryRanks : []) : [];

  const goCategory = (categoryId: string) => {
    Taro.navigateTo({ url: `/pages/category-detail/index?id=${categoryId}&month=${monthKey}` });
  };

  return (
    <View className="pageRoot">
      <MonthSwitcher monthKey={monthKey} onChange={setMonthKey} />

      <SegmentedControl options={KIND_OPTIONS} value={kind} onChange={setKind} />

      <View className={styles.overview}>
        <Text className={styles.overviewLabel}>{formatMonthLabel(monthKey)}{kind === 'expense' ? '支出' : '收入'}合计</Text>
        <Text className={styles.overviewValue}>{formatCents(totalCents)}</Text>
        <View className={styles.overviewMeta}>
          <View className={styles.metaItem}>
            <Text className={styles.metaLabel}>日均</Text>
            <Text className={styles.metaValue}>{formatCents(averageCents)}</Text>
          </View>
          <View className={styles.metaItem}>
            <Text className={styles.metaLabel}>笔数</Text>
            <Text className={styles.metaValue}>
              {overview ? overview.trend.filter((day) => (kind === 'expense' ? day.expenseCents : day.incomeCents) > 0).length : 0} 天有记录
            </Text>
          </View>
          <View className={styles.metaItem}>
            <Text className={styles.metaLabel}>结余</Text>
            <Text className={styles.metaValue}>{formatCents(overview ? overview.balanceCents : 0)}</Text>
          </View>
        </View>
      </View>

      <SectionCard title="分类排行">
        {kind === 'income' ? (
          <EmptyState icon="📈" title="收入暂不提供分类排行" desc="收入通常按来源记录，可查看趋势图" />
        ) : ranks.length > 0 ? (
          ranks.map((item) => (
            <View key={item.categoryId} className={styles.rankItem} onClick={() => goCategory(item.categoryId)}>
              <View className={styles.rankIcon}>
                <CategoryIcon icon={item.icon} color={item.color} size={64} />
              </View>
              <View className={styles.rankBody}>
                <View className={styles.rankTop}>
                  <Text className={styles.rankName}>{item.name}</Text>
                  <Text className={styles.rankAmount}>{formatCents(item.amountCents)}</Text>
                </View>
                <View className={styles.rankBarWrap}>
                  <View className={styles.rankBar}>
                    <ProgressBar percent={item.ratio} color={item.color} height={10} />
                  </View>
                  <Text className={styles.rankRatio}>{item.ratio}%</Text>
                </View>
              </View>
            </View>
          ))
        ) : (
          <EmptyState icon="📊" title={loading ? '加载中…' : '暂无分类数据'} />
        )}
      </SectionCard>

      <SectionCard title="每日趋势">
        {bars.length > 0 ? (
          <>
            <BarChart data={bars} showValue={false} height={200} />
            <Text className={styles.legend}>横轴为日期，纵轴为该日{kind === 'expense' ? '支出' : '收入'}金额</Text>
          </>
        ) : (
          <EmptyState icon="📉" title="暂无趋势数据" />
        )}
      </SectionCard>
    </View>
  );
};

export default StatsPage;
