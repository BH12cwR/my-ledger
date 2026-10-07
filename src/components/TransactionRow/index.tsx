import React from 'react';
import { Text, View } from '@tarojs/components';
import classnames from 'classnames';
import type { TransactionView } from '@/types/ledger';
import { TRANSACTION_TYPE_LABEL } from '@/utils/format';
import AmountText from '@/components/AmountText';
import CategoryIcon from '@/components/CategoryIcon';
import styles from './index.module.scss';

interface TransactionRowProps {
  item: TransactionView;
  onClick?: (item: TransactionView) => void;
  showAccount?: boolean;
}

const TransactionRow: React.FC<TransactionRowProps> = ({ item, onClick, showAccount = true }) => {
  const title =
    item.type === 'transfer'
      ? `${item.accountName} → ${item.toAccountName || '?'}`
      : item.categoryName || '未分类';
  const icon = item.type === 'transfer' ? '🔄' : item.categoryIcon;
  const color = item.type === 'transfer' ? '#1677ff' : item.categoryColor;

  return (
    <View
      className={classnames(styles.row, onClick && styles.clickable)}
      onClick={() => onClick && onClick(item)}
    >
      <CategoryIcon icon={icon} color={color} />
      <View className={styles.middle}>
        <Text className={styles.title}>{title}</Text>
        <Text className={styles.sub}>
          {showAccount ? `${item.accountName} · ` : ''}
          {TRANSACTION_TYPE_LABEL[item.type]}
          {item.note ? ` · ${item.note}` : ''}
        </Text>
      </View>
      <View className={styles.right}>
        <AmountText cents={item.amountCents} type={item.type} showSign />
        {item.refundedFromId ? <Text className={styles.refundTag}>退款</Text> : null}
      </View>
    </View>
  );
};

export default TransactionRow;
