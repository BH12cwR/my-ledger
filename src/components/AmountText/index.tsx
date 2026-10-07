import React from 'react';
import { Text } from '@tarojs/components';
import classnames from 'classnames';
import type { TransactionType } from '@/types/ledger';
import { formatCents } from '@/utils/money';
import { amountSign } from '@/utils/format';
import styles from './index.module.scss';

interface AmountTextProps {
  cents: number;
  type?: TransactionType;
  showSign?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const AmountText: React.FC<AmountTextProps> = ({
  cents,
  type,
  showSign = false,
  size = 'md',
  className
}) => {
  const sign = showSign && type ? amountSign(type) : '';
  return (
    <Text
      className={classnames(
        styles.amount,
        styles[size],
        type === 'expense' && styles.expense,
        type === 'income' && styles.income,
        type === 'transfer' && styles.transfer,
        !type && styles.neutral,
        className
      )}
    >
      {sign}
      {formatCents(cents)}
    </Text>
  );
};

export default AmountText;
