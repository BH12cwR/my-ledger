import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Input, ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import type { Budget, Category, StatsOverview } from '@/types/ledger';
import { getBudgets, getCategories, getStats, mutateBudget } from '@/services/ledger';
import { currentMonthKey } from '@/utils/dates';
import { centsToYuan, formatCents, yuanToCents } from '@/utils/money';
import BottomSheet from '@/components/BottomSheet';
import CategoryIcon from '@/components/CategoryIcon';
import EmptyState from '@/components/EmptyState';
import MonthSwitcher from '@/components/MonthSwitcher';
import ProgressBar from '@/components/ProgressBar';
import SectionCard from '@/components/SectionCard';
import styles from './index.module.scss';

type Scope = 'total' | 'category';

const BudgetsPage: React.FC = () => {
  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<StatsOverview | null>(null);

  const [sheetVisible, setSheetVisible] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string>('');
  const [scope, setScope] = useState<Scope>('total');
  const [categoryId, setCategoryId] = useState<string>('');
  const [amountText, setAmountText] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const load = useCallback(async (target: string) => {
    try {
      const [nextBudgets, nextCategories, nextStats] = await Promise.all([
        getBudgets(target),
        getCategories('expense'),
        getStats({ monthKey: target })
      ]);
      setBudgets(nextBudgets);
      setCategories(nextCategories);
      setStats(nextStats);
    } catch (err) {
      console.error('[Budgets] 加载失败', err);
    }
  }, []);

  useEffect(() => {
    load(monthKey);
  }, [load, monthKey]);

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    if (stats) {
      stats.categoryRanks.forEach((item) => map.set(item.categoryId, item.amountCents));
    }
    return map;
  }, [stats]);

  const totalBudget = budgets.find((item) => !item.categoryId);
  const categoryBudgets = budgets.filter((item) => !!item.categoryId);
  const totalSpent = stats ? stats.expenseCents : 0;

  const categoryName = (id?: string) => {
    const target = categories.find((item) => item._id === id);
    return target ? target.name : '未知分类';
  };

  const categoryMeta = (id?: string) => categories.find((item) => item._id === id);

  const availableCategories = useMemo(
    () =>
      categories.filter(
        (item) => !budgets.some((budget) => budget.categoryId === item._id && budget._id !== editingId)
      ),
    [budgets, categories, editingId]
  );

  const openCreateTotal = () => {
    setEditingId('');
    setScope('total');
    setCategoryId('');
    setAmountText('');
    setSheetVisible(true);
  };

  const openCreateCategory = () => {
    setEditingId('');
    setScope('category');
    setCategoryId(availableCategories.length > 0 ? availableCategories[0]._id : '');
    setAmountText('');
    setSheetVisible(true);
  };

  const openEdit = (budget: Budget) => {
    setEditingId(budget._id);
    setScope(budget.categoryId ? 'category' : 'total');
    setCategoryId(budget.categoryId || '');
    setAmountText(centsToYuan(budget.amountCents));
    setSheetVisible(true);
  };

  const handleSave = async () => {
    if (submitting) return;
    if (scope === 'category' && !categoryId) {
      Taro.showToast({ title: '请选择分类', icon: 'none' });
      return;
    }
    const amountCents = yuanToCents(amountText);
    if (amountCents <= 0) {
      Taro.showToast({ title: '请输入预算金额', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      await mutateBudget({
        action: editingId ? 'update' : 'create',
        id: editingId || undefined,
        monthKey,
        categoryId: scope === 'category' ? categoryId : undefined,
        amountCents
      });
      Taro.showToast({ title: editingId ? '已保存' : '已设置', icon: 'success' });
      setSheetVisible(false);
      await load(monthKey);
    } catch (err) {
      console.error('[Budgets] 保存失败', err);
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!editingId) return;
    Taro.showModal({
      title: '删除预算',
      content: '确定删除该预算吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await mutateBudget({ action: 'delete', id: editingId });
          Taro.showToast({ title: '已删除', icon: 'success' });
          setSheetVisible(false);
          await load(monthKey);
        } catch (err) {
          console.error('[Budgets] 删除失败', err);
          Taro.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  };

  const totalPercent = totalBudget ? Math.round((totalSpent / Math.max(totalBudget.amountCents, 1)) * 100) : 0;
  const totalRemain = totalBudget ? totalBudget.amountCents - totalSpent : 0;

  return (
    <View className="pageRoot">
      <MonthSwitcher monthKey={monthKey} onChange={setMonthKey} />

      <View className={styles.totalCard} onClick={totalBudget ? () => openEdit(totalBudget) : openCreateTotal}>
        <View className={styles.totalHeader}>
          <Text className={styles.totalLabel}>本月总预算</Text>
          <Text className={styles.totalEdit}>{totalBudget ? '编辑' : '设置'}</Text>
        </View>
        <Text className={styles.totalAmount}>
          {totalBudget ? formatCents(totalBudget.amountCents) : '未设置'}
        </Text>
        {totalBudget ? (
          <>
            <Text className={styles.totalSub}>
              已用 {formatCents(totalSpent)}
              {totalRemain >= 0 ? ` · 剩余 ${formatCents(totalRemain)}` : ` · 超支 ${formatCents(-totalRemain)}`}
            </Text>
            <View className={styles.totalProgress}>
              <ProgressBar percent={totalPercent} color="#ffffff" height={12} />
            </View>
          </>
        ) : (
          <Text className={styles.totalSub}>点击为本月设置一个总预算</Text>
        )}
      </View>

      <SectionCard title="分类预算" extraText="新增" onExtraClick={openCreateCategory}>
        {categoryBudgets.length > 0 ? (
          categoryBudgets.map((budget) => {
            const meta = categoryMeta(budget.categoryId);
            const spent = spentByCategory.get(budget.categoryId || '') || 0;
            const percent = Math.round((spent / Math.max(budget.amountCents, 1)) * 100);
            const over = spent > budget.amountCents;
            return (
              <View key={budget._id} className={styles.budgetRow} onClick={() => openEdit(budget)}>
                <View className={styles.budgetTop}>
                  <View className={styles.budgetLeft}>
                    <CategoryIcon
                      icon={meta ? meta.icon : '📦'}
                      color={meta ? meta.color : '#86909c'}
                      size={56}
                    />
                    <Text className={styles.budgetName}>{categoryName(budget.categoryId)}</Text>
                  </View>
                  <Text className={styles.budgetAmount}>
                    {formatCents(spent)} / {formatCents(budget.amountCents)}
                  </Text>
                </View>
                <ProgressBar percent={percent} color={over ? '#f5222d' : meta ? meta.color : '#1677ff'} />
                <View className={styles.budgetBottom}>
                  <Text className={classnames(styles.budgetPct, over && styles.over)}>
                    {over ? `已超支 ${formatCents(spent - budget.amountCents)}` : `已用 ${percent}%`}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <EmptyState icon="🎯" title="暂无分类预算" desc="为常用分类设置月度预算，控制开支" />
        )}
      </SectionCard>

      <View className={styles.addBtn} onClick={openCreateCategory}>
        <Text className={styles.addText}>＋ 新增分类预算</Text>
      </View>

      <BottomSheet
        visible={sheetVisible}
        title={editingId ? '编辑预算' : '设置预算'}
        onClose={() => setSheetVisible(false)}
      >
        <ScrollView scrollY className={styles.sheetScroll}>
          {editingId ? (
            <View className={styles.formRow}>
              <Text className={styles.formLabel}>预算对象</Text>
              <Text className={styles.formValue}>
                {scope === 'total' ? '本月总预算' : categoryName(categoryId)}
              </Text>
            </View>
          ) : (
            <>
              <Text className={styles.formTitle}>预算对象</Text>
              <View className={styles.chipList}>
                <View
                  className={classnames(styles.chip, scope === 'total' && styles.chipActive)}
                  onClick={() => setScope('total')}
                >
                  <Text className={classnames(styles.chipText, scope === 'total' && styles.chipTextActive)}>
                    总预算
                  </Text>
                </View>
                <View
                  className={classnames(styles.chip, scope === 'category' && styles.chipActive)}
                  onClick={() => {
                    setScope('category');
                    if (!categoryId && availableCategories.length > 0) {
                      setCategoryId(availableCategories[0]._id);
                    }
                  }}
                >
                  <Text className={classnames(styles.chipText, scope === 'category' && styles.chipTextActive)}>
                    分类预算
                  </Text>
                </View>
              </View>

              {scope === 'category' ? (
                <>
                  <Text className={styles.formTitle}>选择分类</Text>
                  <View className={styles.chipList}>
                    {availableCategories.map((item) => (
                      <View
                        key={item._id}
                        className={classnames(styles.chip, item._id === categoryId && styles.chipActive)}
                        onClick={() => setCategoryId(item._id)}
                      >
                        <Text
                          className={classnames(
                            styles.chipText,
                            item._id === categoryId && styles.chipTextActive
                          )}
                        >
                          {item.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
            </>
          )}

          <View className={styles.formRow}>
            <Text className={styles.formLabel}>预算金额</Text>
            <Input
              className={styles.formInput}
              type="digit"
              value={amountText}
              placeholder="0.00"
              onInput={(event) => setAmountText(event.detail.value)}
            />
          </View>

          <View className={styles.sheetActions}>
            {editingId ? (
              <View className={styles.deleteBtn} onClick={handleDelete}>
                <Text className={styles.deleteText}>删除</Text>
              </View>
            ) : null}
            <View className={styles.saveBtn} onClick={handleSave}>
              <Text className={styles.saveText}>{submitting ? '保存中…' : '保存'}</Text>
            </View>
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default BudgetsPage;
