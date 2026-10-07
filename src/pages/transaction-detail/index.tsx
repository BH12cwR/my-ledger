import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import classnames from 'classnames';
import type { TransactionView } from '@/types/ledger';
import { getTransactions, mutateTransaction } from '@/services/ledger';
import { TRANSACTION_TYPE_LABEL } from '@/utils/format';
import { dateLabelOf, weekdayLabel } from '@/utils/dates';
import AmountText from '@/components/AmountText';
import CategoryIcon from '@/components/CategoryIcon';
import EmptyState from '@/components/EmptyState';
import SectionCard from '@/components/SectionCard';
import styles from './index.module.scss';

const TransactionDetailPage: React.FC = () => {
  const router = useRouter();
  const id = router.params.id || '';
  const [detail, setDetail] = useState<TransactionView | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getTransactions({});
      setDetail(list.find((item) => item._id === id) || null);
    } catch (err) {
      console.error('[TransactionDetail] 加载失败', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleEdit = () => {
    Taro.navigateTo({ url: `/pages/transaction-new/index?id=${id}` });
  };

  const handleRefund = () => {
    if (!detail) return;
    Taro.showModal({
      title: '确认退款',
      content: '将按原金额生成一笔退款收入，是否继续？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await mutateTransaction({
            action: 'refund',
            type: 'income',
            amountCents: detail.amountCents,
            accountId: detail.accountId,
            note: `${detail.note || detail.categoryName} 退款`,
            happenedAt: Date.now(),
            refundedFromId: detail._id
          });
          Taro.showToast({ title: '退款已记录', icon: 'success' });
          setTimeout(() => Taro.navigateBack(), 500);
        } catch (err) {
          console.error('[TransactionDetail] 退款失败', err);
          Taro.showToast({ title: '退款失败，请重试', icon: 'none' });
        }
      }
    });
  };

  const handleDelete = () => {
    Taro.showModal({
      title: '删除账单',
      content: '删除后不可恢复，确定继续吗？',
      confirmColor: '#f5222d',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await mutateTransaction({ action: 'delete', id });
          Taro.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => Taro.navigateBack(), 500);
        } catch (err) {
          console.error('[TransactionDetail] 删除失败', err);
          Taro.showToast({ title: '删除失败，请重试', icon: 'none' });
        }
      }
    });
  };

  if (!loading && !detail) {
    return (
      <View className="pageRoot">
        <EmptyState icon="🔍" title="账单不存在" desc="可能已被删除" actionText="返回" onAction={() => Taro.navigateBack()} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View className="pageRoot">
        <EmptyState icon="⏳" title="加载中…" />
      </View>
    );
  }

  const title = detail.type === 'transfer'
    ? `${detail.accountName} → ${detail.toAccountName || '?'}`
    : detail.categoryName;

  return (
    <View className="pageRoot">
      <View className={styles.hero}>
        <CategoryIcon
          icon={detail.type === 'transfer' ? '🔄' : detail.categoryIcon}
          color={detail.type === 'transfer' ? '#1677ff' : detail.categoryColor}
          size={96}
        />
        <AmountText className={styles.heroAmount} cents={detail.amountCents} type={detail.type} showSign size="xl" />
        <View>
          <Text className={styles.heroType}>{TRANSACTION_TYPE_LABEL[detail.type]}</Text>
          {detail.refundedFromId ? <Text className={styles.refundBadge}>退款</Text> : null}
        </View>
      </View>

      <SectionCard title="账单信息">
        <View className={styles.row}>
          <Text className={styles.rowLabel}>{detail.type === 'transfer' ? '转账方向' : '分类'}</Text>
          <Text className={styles.rowValue}>{title}</Text>
        </View>
        <View className={styles.row}>
          <Text className={styles.rowLabel}>账户</Text>
          <Text className={styles.rowValue}>{detail.accountName}</Text>
        </View>
        {detail.type === 'transfer' ? (
          <View className={styles.row}>
            <Text className={styles.rowLabel}>转入</Text>
            <Text className={styles.rowValue}>{detail.toAccountName || '—'}</Text>
          </View>
        ) : null}
        <View className={styles.row}>
          <Text className={styles.rowLabel}>日期</Text>
          <Text className={styles.rowValue}>
            {detail.happenedOn} · {dateLabelOf(detail.happenedOn)} {weekdayLabel(detail.happenedOn)}
          </Text>
        </View>
        <View className={styles.row}>
          <Text className={styles.rowLabel}>标签</Text>
          <Text className={classnames(styles.rowValue, detail.tagNames.length === 0 && styles.rowPlaceholder)}>
            {detail.tagNames.length > 0 ? detail.tagNames.join(' · ') : '无'}
          </Text>
        </View>
        <View className={styles.row}>
          <Text className={styles.rowLabel}>备注</Text>
          <Text className={classnames(styles.rowValue, !detail.note && styles.rowPlaceholder)}>
            {detail.note || '无'}
          </Text>
        </View>
      </SectionCard>

      <View className={styles.actions}>
        <View className={classnames(styles.action, styles.actionPrimary)} onClick={handleEdit}>
          <Text className={styles.actionPrimaryText}>编辑账单</Text>
        </View>
        {detail.type === 'expense' ? (
          <View className={styles.action} onClick={handleRefund}>
            <Text className={styles.actionText}>记一笔退款</Text>
          </View>
        ) : null}
        <View className={styles.action} onClick={handleDelete}>
          <Text className={classnames(styles.actionText, styles.actionDanger)}>删除账单</Text>
        </View>
      </View>
    </View>
  );
};

export default TransactionDetailPage;
