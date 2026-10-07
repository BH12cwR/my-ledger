import React, { useEffect, useMemo, useState } from 'react';
import { Input, Picker, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import type { Account, Category, SearchFilters, Tag, TransactionType } from '@/types/ledger';
import { getAccounts, getCategories, getTags } from '@/services/ledger';
import { centsToYuan, yuanToCents } from '@/utils/money';
import SegmentedControl from '@/components/SegmentedControl';
import styles from './index.module.scss';

const FILTER_STORAGE_KEY = 'ledger_search_filters';

const TYPE_OPTIONS = [
  { label: '全部', value: '' },
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' },
  { label: '转账', value: 'transfer' }
];

const SearchFilterPage: React.FC = () => {
  const [type, setType] = useState<TransactionType | ''>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [tagId, setTagId] = useState<string>('');
  const [minText, setMinText] = useState<string>('');
  const [maxText, setMaxText] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    const load = async () => {
      const [nextAccounts, nextCategories, nextTags] = await Promise.all([
        getAccounts(),
        getCategories(),
        getTags()
      ]);
      setAccounts(nextAccounts);
      setCategories(nextCategories);
      setTags(nextTags);
    };
    load().catch((err) => console.error('[SearchFilter] 加载失败', err));

    const stored = Taro.getStorageSync(FILTER_STORAGE_KEY) as SearchFilters | '';
    if (stored && typeof stored === 'object') {
      setType(stored.type || '');
      setCategoryId(stored.categoryId || '');
      setAccountId(stored.accountId || '');
      setTagId(stored.tagId || '');
      setMinText(typeof stored.minAmountCents === 'number' ? centsToYuan(stored.minAmountCents) : '');
      setMaxText(typeof stored.maxAmountCents === 'number' ? centsToYuan(stored.maxAmountCents) : '');
      setStartDate(stored.startDate || '');
      setEndDate(stored.endDate || '');
    }
  }, []);

  const visibleCategories = useMemo(() => {
    if (type === 'expense') return categories.filter((item) => item.kind === 'expense');
    if (type === 'income') return categories.filter((item) => item.kind === 'income');
    return categories;
  }, [categories, type]);

  useEffect(() => {
    if (!categoryId) return;
    const exists = visibleCategories.some((item) => item._id === categoryId);
    if (!exists) setCategoryId('');
  }, [categoryId, visibleCategories]);

  const handleTypeChange = (value: string) => {
    setType(value as TransactionType | '');
  };

  const handleReset = () => {
    setType('');
    setCategoryId('');
    setAccountId('');
    setTagId('');
    setMinText('');
    setMaxText('');
    setStartDate('');
    setEndDate('');
  };

  const handleApply = () => {
    const filters: SearchFilters = {};
    if (type) filters.type = type;
    if (categoryId) filters.categoryId = categoryId;
    if (accountId) filters.accountId = accountId;
    if (tagId) filters.tagId = tagId;
    const minCents = yuanToCents(minText);
    const maxCents = yuanToCents(maxText);
    if (minText.trim() && minCents > 0) filters.minAmountCents = minCents;
    if (maxText.trim() && maxCents > 0) filters.maxAmountCents = maxCents;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    Taro.setStorageSync(FILTER_STORAGE_KEY, filters);
    Taro.navigateBack();
  };

  const renderChips = (
    options: { value: string; label: string }[],
    current: string,
    onSelect: (value: string) => void
  ) => (
    <View className={styles.chipList}>
      {options.map((option) => {
        const active = option.value === current;
        return (
          <View
            key={option.value || 'all'}
            className={classnames(styles.chip, active && styles.chipActive)}
            onClick={() => onSelect(option.value)}
          >
            <Text className={classnames(styles.chipText, active && styles.chipTextActive)}>{option.label}</Text>
          </View>
        );
      })}
    </View>
  );

  return (
    <View className={styles.page}>
      <View className={styles.sectionTitle}>类型</View>
      <SegmentedControl options={TYPE_OPTIONS} value={type} onChange={handleTypeChange} />

      <View className={styles.sectionTitle}>账户</View>
      {renderChips(
        [{ value: '', label: '全部账户' }, ...accounts.map((item) => ({ value: item._id, label: item.name }))],
        accountId,
        setAccountId
      )}

      {type !== 'transfer' ? (
        <>
          <View className={styles.sectionTitle}>分类</View>
          {renderChips(
            [{ value: '', label: '全部分类' }, ...visibleCategories.map((item) => ({ value: item._id, label: item.name }))],
            categoryId,
            setCategoryId
          )}
        </>
      ) : null}

      <View className={styles.sectionTitle}>标签</View>
      {renderChips(
        [{ value: '', label: '全部标签' }, ...tags.map((item) => ({ value: item._id, label: item.name }))],
        tagId,
        setTagId
      )}

      <View className={styles.sectionTitle}>金额区间（元）</View>
      <View className={styles.rangeRow}>
        <Input
          className={styles.rangeInput}
          type="digit"
          value={minText}
          placeholder="最低"
          onInput={(event) => setMinText(event.detail.value)}
        />
        <Text className={styles.rangeSep}>~</Text>
        <Input
          className={styles.rangeInput}
          type="digit"
          value={maxText}
          placeholder="最高"
          onInput={(event) => setMaxText(event.detail.value)}
        />
      </View>

      <View className={styles.sectionTitle}>日期区间</View>
      <View className={styles.rangeRow}>
        <Picker mode="date" value={startDate} onChange={(event) => setStartDate(String(event.detail.value))}>
          <View className={styles.dateValue}>
            <Text className={classnames(styles.dateText, !startDate && styles.datePlaceholder)}>
              {startDate || '开始日期'}
            </Text>
          </View>
        </Picker>
        <Text className={styles.rangeSep}>~</Text>
        <Picker mode="date" value={endDate} onChange={(event) => setEndDate(String(event.detail.value))}>
          <View className={styles.dateValue}>
            <Text className={classnames(styles.dateText, !endDate && styles.datePlaceholder)}>
              {endDate || '结束日期'}
            </Text>
          </View>
        </Picker>
      </View>

      <View className={styles.actions}>
        <View className={styles.resetBtn} onClick={handleReset}>
          <Text className={styles.resetText}>重置</Text>
        </View>
        <View className={styles.applyBtn} onClick={handleApply}>
          <Text className={styles.applyText}>应用筛选</Text>
        </View>
      </View>
    </View>
  );
};

export default SearchFilterPage;
