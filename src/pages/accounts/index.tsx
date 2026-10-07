import React, { useCallback, useEffect, useState } from 'react';
import { Input, ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import type { Account, AccountType } from '@/types/ledger';
import { getAccounts, mutateAccount } from '@/services/ledger';
import { ACCOUNT_TYPES, accountTypeMeta, isDebtAccount } from '@/utils/account-types';
import { centsToYuan, formatCents, yuanToCents } from '@/utils/money';
import BottomSheet from '@/components/BottomSheet';
import CategoryIcon from '@/components/CategoryIcon';
import EmptyState from '@/components/EmptyState';
import styles from './index.module.scss';

const AccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sheetVisible, setSheetVisible] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<AccountType>('cash');
  const [balanceText, setBalanceText] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const load = useCallback(async () => {
    try {
      const data = await getAccounts();
      setAccounts(data);
    } catch (err) {
      console.error('[Accounts] 加载失败', err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId('');
    setName('');
    setType('cash');
    setBalanceText('');
    setSheetVisible(true);
  };

  const openEdit = (account: Account) => {
    setEditingId(account._id);
    setName(account.name);
    setType(account.type);
    setBalanceText(centsToYuan(account.initialBalanceCents));
    setSheetVisible(true);
  };

  const handleSave = async () => {
    if (submitting) return;
    if (!name.trim()) {
      Taro.showToast({ title: '请输入账户名称', icon: 'none' });
      return;
    }
    const meta = accountTypeMeta(type);
    setSubmitting(true);
    try {
      await mutateAccount({
        action: editingId ? 'update' : 'create',
        id: editingId || undefined,
        name: name.trim(),
        type,
        icon: meta.icon,
        color: meta.color,
        initialBalanceCents: yuanToCents(balanceText)
      });
      Taro.showToast({ title: editingId ? '已保存' : '已创建', icon: 'success' });
      setSheetVisible(false);
      await load();
    } catch (err) {
      console.error('[Accounts] 保存失败', err);
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!editingId) return;
    Taro.showModal({
      title: '删除账户',
      content: '删除后该账户的历史流水仍会保留，确定删除吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await mutateAccount({ action: 'delete', id: editingId });
          Taro.showToast({ title: '已删除', icon: 'success' });
          setSheetVisible(false);
          await load();
        } catch (err) {
          console.error('[Accounts] 删除失败', err);
          Taro.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  };

  return (
    <View className="pageRoot">
      <View className={styles.listHeader}>
        <Text className={styles.listTitle}>共 {accounts.length} 个账户</Text>
      </View>

      {accounts.length > 0 ? (
        accounts.map((account) => {
          const meta = accountTypeMeta(account.type);
          const negative = account.balanceCents < 0;
          return (
            <View key={account._id} className={styles.accountRow} onClick={() => openEdit(account)}>
              <CategoryIcon icon={account.icon} color={account.color} size={80} />
              <View className={styles.accountBody}>
                <Text className={styles.accountName}>{account.name}</Text>
                <Text className={styles.accountType}>
                  {meta.label}
                  {isDebtAccount(account.type) ? ' · 负债' : ''}
                </Text>
              </View>
              <View className={styles.accountAmount}>
                <Text className={classnames(styles.accountBalance, negative && styles.debt)}>
                  {formatCents(account.balanceCents)}
                </Text>
                <Text className={styles.accountInitial}>初始 {formatCents(account.initialBalanceCents)}</Text>
              </View>
            </View>
          );
        })
      ) : (
        <EmptyState icon="💳" title="还没有账户" desc="创建账户后即可开始记账" />
      )}

      <View className={styles.addBtn} onClick={openCreate}>
        <Text className={styles.addText}>＋ 新建账户</Text>
      </View>

      <BottomSheet
        visible={sheetVisible}
        title={editingId ? '编辑账户' : '新建账户'}
        onClose={() => setSheetVisible(false)}
      >
        <ScrollView scrollY className={styles.sheetScroll}>
          <View className={styles.formRow}>
            <Text className={styles.formLabel}>名称</Text>
            <Input
              className={styles.formInput}
              value={name}
              placeholder="如：招商银行储蓄卡"
              onInput={(event) => setName(event.detail.value)}
            />
          </View>

          <Text className={styles.formTitle}>账户类型</Text>
          <View className={styles.typeList}>
            {ACCOUNT_TYPES.map((item) => {
              const active = item.value === type;
              return (
                <View
                  key={item.value}
                  className={classnames(styles.typeChip, active && styles.typeChipActive)}
                  onClick={() => setType(item.value)}
                >
                  <Text className={styles.typeIcon}>{item.icon}</Text>
                  <Text className={classnames(styles.typeText, active && styles.typeTextActive)}>{item.label}</Text>
                </View>
              );
            })}
          </View>

          <View className={styles.formRow}>
            <Text className={styles.formLabel}>初始余额</Text>
            <Input
              className={styles.formInput}
              type="digit"
              value={balanceText}
              placeholder="0.00"
              onInput={(event) => setBalanceText(event.detail.value)}
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

export default AccountsPage;
