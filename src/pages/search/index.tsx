import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { SearchFilters, TransactionView } from '@/types/ledger';
import { getTransactions } from '@/services/ledger';
import EmptyState from '@/components/EmptyState';
import TransactionRow from '@/components/TransactionRow';
import styles from './index.module.scss';

const FILTER_STORAGE_KEY = 'ledger_search_filters';
const HISTORY_STORAGE_KEY = 'ledger_search_history';

const SearchPage: React.FC = () => {
  const [keyword, setKeyword] = useState<string>('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [history, setHistory] = useState<string[]>([]);
  const [list, setList] = useState<TransactionView[]>([]);
  const [searched, setSearched] = useState<boolean>(false);

  const runSearch = useCallback(async (nextKeyword: string, nextFilters: SearchFilters) => {
    const hasKeyword = !!nextKeyword.trim();
    const hasFilter = Object.values(nextFilters).some((value) => value !== undefined && value !== '');
    if (!hasKeyword && !hasFilter) {
      setList([]);
      setSearched(false);
      return;
    }
    try {
      const data = await getTransactions({ ...nextFilters, keyword: nextKeyword.trim() || undefined });
      setList(data);
      setSearched(true);
    } catch (err) {
      console.error('[Search] 搜索失败', err);
    }
  }, []);

  useEffect(() => {
    const stored = (Taro.getStorageSync(HISTORY_STORAGE_KEY) || []) as string[];
    setHistory(Array.isArray(stored) ? stored : []);
  }, []);

  useDidShow(() => {
    const stored = Taro.getStorageSync(FILTER_STORAGE_KEY) as SearchFilters | '';
    if (stored && typeof stored === 'object') {
      setFilters(stored);
      runSearch(keyword, stored);
    }
  });

  const filterChips = useMemo(() => {
    const chips: string[] = [];
    if (filters.type) {
      chips.push(filters.type === 'expense' ? '支出' : filters.type === 'income' ? '收入' : '转账');
    }
    if (filters.startDate || filters.endDate) {
      chips.push(`${filters.startDate || '不限'} ~ ${filters.endDate || '不限'}`);
    }
    if (typeof filters.minAmountCents === 'number' || typeof filters.maxAmountCents === 'number') {
      const min = filters.minAmountCents ? filters.minAmountCents / 100 : 0;
      const max = filters.maxAmountCents ? filters.maxAmountCents / 100 : '不限';
      chips.push(`${min} ~ ${max} 元`);
    }
    if (filters.categoryId) chips.push('已选分类');
    if (filters.accountId) chips.push('已选账户');
    if (filters.tagId) chips.push('已选标签');
    return chips;
  }, [filters]);

  const pushHistory = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const next = [trimmed, ...history.filter((item) => item !== trimmed)].slice(0, 10);
    setHistory(next);
    Taro.setStorageSync(HISTORY_STORAGE_KEY, next);
  };

  const handleConfirm = () => {
    pushHistory(keyword);
    runSearch(keyword, filters);
  };

  const applyHistory = (value: string) => {
    setKeyword(value);
    runSearch(value, filters);
  };

  const clearHistory = () => {
    setHistory([]);
    Taro.setStorageSync(HISTORY_STORAGE_KEY, []);
  };

  const goDetail = (item: TransactionView) => {
    Taro.navigateTo({ url: `/pages/transaction-detail/index?id=${item._id}` });
  };

  const goFilter = () => {
    Taro.navigateTo({ url: '/pages/search-filter/index' });
  };

  const totalCents = list.reduce(
    (acc, item) => acc + (item.type === 'expense' ? -item.amountCents : item.type === 'income' ? item.amountCents : 0),
    0
  );

  return (
    <View className="pageRoot">
      <View className={styles.bar}>
        <View className={styles.inputWrap}>
          <Text className={styles.inputIcon}>🔍</Text>
          <Input
            className={styles.input}
            value={keyword}
            focus
            confirmType="search"
            placeholder="备注、分类、账户、金额"
            onInput={(event) => setKeyword(event.detail.value)}
            onConfirm={handleConfirm}
          />
        </View>
        <View className={styles.filterBtn} onClick={goFilter}>
          <Text className={styles.filterBtnText}>筛选</Text>
        </View>
      </View>

      {filterChips.length > 0 ? (
        <View className={styles.filterChips}>
          {filterChips.map((chip) => (
            <View key={chip} className={styles.chip}>
              <Text className={styles.chipText}>{chip}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {searched ? (
        <>
          <View className={styles.resultHeader}>
            <Text className={styles.resultTitle}>搜索结果（{list.length}）</Text>
            <Text className={styles.resultSub}>净额 {totalCents >= 0 ? '+' : '-'}{(Math.abs(totalCents) / 100).toFixed(2)}</Text>
          </View>
          {list.length > 0 ? (
            list.map((item) => <TransactionRow key={item._id} item={item} onClick={goDetail} />)
          ) : (
            <EmptyState icon="🔍" title="没有匹配的账单" desc="试试更换关键词或放宽筛选条件" />
          )}
        </>
      ) : (
        <>
          {history.length > 0 ? (
            <>
              <View className={styles.historyHeader}>
                <Text className={styles.historyTitle}>搜索历史</Text>
                <Text className={styles.historyClear} onClick={clearHistory}>
                  清空
                </Text>
              </View>
              <View className={styles.historyList}>
                {history.map((item) => (
                  <View key={item} className={styles.historyItem} onClick={() => applyHistory(item)}>
                    <Text className={styles.historyText}>{item}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <EmptyState icon="🔍" title="搜索你的账单" desc="支持按备注、分类、账户、金额关键字搜索" />
          )}
        </>
      )}
    </View>
  );
};

export default SearchPage;
