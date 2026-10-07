import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Input, Picker, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import classnames from 'classnames';
import type { Account, Category, Tag, TransactionType } from '@/types/ledger';
import { getAccounts, getCategories, getTags, getTransactions, mutateTransaction } from '@/services/ledger';
import { todayKey, tsFromDateKey } from '@/utils/dates';
import { centsToYuan, yuanToCents } from '@/utils/money';
import BottomSheet from '@/components/BottomSheet';
import CategoryIcon from '@/components/CategoryIcon';
import NumberKeypad from '@/components/NumberKeypad';
import SectionCard from '@/components/SectionCard';
import SegmentedControl from '@/components/SegmentedControl';
import styles from './index.module.scss';

const TYPE_OPTIONS = [
  { label: '支出', value: 'expense' },
  { label: '收入', value: 'income' },
  { label: '转账', value: 'transfer' }
];

type SheetType = '' | 'account' | 'toAccount';

const TransactionNewPage: React.FC = () => {
  const router = useRouter();
  const editingId = router.params.id || '';

  const [type, setType] = useState<TransactionType>('expense');
  const [amountText, setAmountText] = useState<string>('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [categoryId, setCategoryId] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [dateKey, setDateKey] = useState<string>(todayKey());
  const [note, setNote] = useState<string>('');
  const [sheet, setSheet] = useState<SheetType>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const load = useCallback(async () => {
    const [nextCategories, nextAccounts, nextTags] = await Promise.all([
      getCategories(),
      getAccounts(),
      getTags()
    ]);
    setCategories(nextCategories);
    setAccounts(nextAccounts);
    setTags(nextTags);
    setAccountId((prev) => prev || (nextAccounts.length > 0 ? nextAccounts[0]._id : ''));

    if (editingId) {
      const list = await getTransactions({});
      const target = list.find((item) => item._id === editingId);
      if (target) {
        setType(target.type);
        setAmountText(centsToYuan(target.amountCents));
        setCategoryId(target.categoryId || '');
        setAccountId(target.accountId);
        setToAccountId(target.toAccountId || '');
        setTagIds(target.tagIds || []);
        setDateKey(target.happenedOn);
        setNote(target.note || '');
      }
    }
  }, [editingId]);

  useEffect(() => {
    load().catch((err) => console.error('[TransactionNew] 加载失败', err));
  }, [load]);

  const currentCategories = useMemo(
    () => categories.filter((item) => item.kind === (type === 'income' ? 'income' : 'expense')),
    [categories, type]
  );

  useEffect(() => {
    if (type === 'transfer') return;
    const exists = currentCategories.some((item) => item._id === categoryId);
    if (!exists) setCategoryId(currentCategories.length > 0 ? currentCategories[0]._id : '');
  }, [categoryId, currentCategories, type]);

  const accountName = (id: string) => {
    const target = accounts.find((item) => item._id === id);
    return target ? target.name : '';
  };

  const handleSave = async () => {
    if (submitting) return;
    const amountCents = yuanToCents(amountText);
    if (amountCents <= 0) {
      Taro.showToast({ title: '请输入金额', icon: 'none' });
      return;
    }
    if (!accountId) {
      Taro.showToast({ title: '请选择账户', icon: 'none' });
      return;
    }
    if (type === 'transfer' && !toAccountId) {
      Taro.showToast({ title: '请选择转入账户', icon: 'none' });
      return;
    }
    if (type === 'transfer' && toAccountId === accountId) {
      Taro.showToast({ title: '转出与转入账户不能相同', icon: 'none' });
      return;
    }
    if (type !== 'transfer' && !categoryId) {
      Taro.showToast({ title: '请选择分类', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      await mutateTransaction({
        action: editingId ? 'update' : 'create',
        id: editingId || undefined,
        type,
        amountCents,
        accountId,
        toAccountId: type === 'transfer' ? toAccountId : undefined,
        categoryId: type === 'transfer' ? undefined : categoryId,
        tagIds,
        happenedAt: tsFromDateKey(dateKey),
        note
      });
      Taro.showToast({ title: editingId ? '已保存修改' : '记账成功', icon: 'success' });
      setTimeout(() => Taro.navigateBack(), 500);
    } catch (err) {
      console.error('[TransactionNew] 保存失败', err);
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTag = (id: string) => {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const selectAccount = (id: string) => {
    if (sheet === 'toAccount') {
      setToAccountId(id);
    } else {
      setAccountId(id);
    }
    setSheet('');
  };

  const sheetTitle = sheet === 'toAccount' ? '选择转入账户' : '选择账户';

  return (
    <View className={styles.page}>
      <SegmentedControl options={TYPE_OPTIONS} value={type} onChange={(value) => setType(value as TransactionType)} />

      <View className={styles.amountBar}>
        <Text className={styles.amountSymbol}>¥</Text>
        <Text className={classnames(styles.amountValue, !amountText && styles.amountPlaceholder)}>
          {amountText || '0.00'}
        </Text>
      </View>

      {type === 'transfer' ? (
        <View className={styles.transferBox}>
          <View className={styles.transferRow} onClick={() => setSheet('account')}>
            <Text className={styles.transferLabel}>转出账户</Text>
            <Text className={classnames(styles.transferValue, !accountId && styles.transferPlaceholder)}>
              {accountName(accountId) || '请选择'} ›
            </Text>
          </View>
          <Text className={styles.transferArrow}>↓</Text>
          <View className={styles.transferRow} onClick={() => setSheet('toAccount')}>
            <Text className={styles.transferLabel}>转入账户</Text>
            <Text className={classnames(styles.transferValue, !toAccountId && styles.transferPlaceholder)}>
              {accountName(toAccountId) || '请选择'} ›
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView scrollX className={styles.catScroll}>
          {currentCategories.map((item) => {
            const active = item._id === categoryId;
            return (
              <View
                key={item._id}
                className={classnames(styles.catItem, active && styles.catItemActive)}
                onClick={() => setCategoryId(item._id)}
              >
                <Text className={styles.catIcon}>{item.icon}</Text>
                <Text className={classnames(styles.catName, active && styles.catNameActive)}>{item.name}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      <SectionCard>
        {type !== 'transfer' ? (
          <View className={styles.formRow} onClick={() => setSheet('account')}>
            <Text className={styles.formLabel}>账户</Text>
            <View className={styles.formValue}>
              <Text className={!accountId ? styles.formPlaceholder : undefined}>
                {accountName(accountId) || '请选择'}
              </Text>
              <Text className={styles.formArrow}>›</Text>
            </View>
          </View>
        ) : null}

        <Picker mode="date" value={dateKey} onChange={(event) => setDateKey(String(event.detail.value))}>
          <View className={styles.formRow}>
            <Text className={styles.formLabel}>日期</Text>
            <View className={styles.formValue}>
              <Text>{dateKey}</Text>
              <Text className={styles.formArrow}>›</Text>
            </View>
          </View>
        </Picker>

        <View className={styles.formRow}>
          <Text className={styles.formLabel}>备注</Text>
          <Input
            className={styles.remarkInput}
            value={note}
            placeholder="添加备注…"
            placeholderClass={styles.formPlaceholder}
            onInput={(event) => setNote(event.detail.value)}
          />
        </View>
      </SectionCard>

      <SectionCard title="标签">
        <View className={styles.tagList}>
          {tags.length > 0 ? (
            tags.map((item) => {
              const active = tagIds.includes(item._id);
              return (
                <View
                  key={item._id}
                  className={classnames(styles.tagChip, active && styles.tagChipActive)}
                  onClick={() => toggleTag(item._id)}
                >
                  <Text className={classnames(styles.tagText, active && styles.tagTextActive)}>{item.name}</Text>
                </View>
              );
            })
          ) : (
            <Text className={styles.formPlaceholder}>暂无标签，可在「我的 - 标签管理」中创建</Text>
          )}
        </View>
      </SectionCard>

      <View className={styles.keypadHolder}>
        <NumberKeypad
          value={amountText}
          onChange={setAmountText}
          onConfirm={handleSave}
          confirmText={submitting ? '保存中' : editingId ? '保存' : '完成'}
        />
      </View>

      <BottomSheet visible={!!sheet} title={sheetTitle} onClose={() => setSheet('')}>
        <ScrollView scrollY className={styles.sheetScroll}>
          {accounts.map((item) => {
            const active = sheet === 'toAccount' ? item._id === toAccountId : item._id === accountId;
            return (
              <View key={item._id} className={styles.optionRow} onClick={() => selectAccount(item._id)}>
                <View className={styles.optionIcon}>
                  <CategoryIcon icon={item.icon} color={item.color} size={64} />
                </View>
                <Text className={styles.optionName}>{item.name}</Text>
                <Text className={styles.optionSub}>¥{centsToYuan(item.balanceCents)}</Text>
                {active ? <Text className={styles.optionCheck}>✓</Text> : null}
              </View>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default TransactionNewPage;
