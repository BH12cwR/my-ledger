import React from 'react';
import { Text, View } from '@tarojs/components';
import { formatMonthLabel } from '@/utils/dates';
import styles from './index.module.scss';

interface MonthSwitcherProps {
  monthKey: string;
  onChange: (monthKey: string) => void;
}

const MonthSwitcher: React.FC<MonthSwitcherProps> = ({ monthKey, onChange }) => {
  const step = (delta: number) => {
    const [y, m] = monthKey.split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1 + delta, 1));
    const next = `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}`;
    onChange(next);
  };

  return (
    <View className={styles.switcher}>
      <View className={styles.arrow} onClick={() => step(-1)}>
        <Text className={styles.arrowText}>‹</Text>
      </View>
      <Text className={styles.label}>{formatMonthLabel(monthKey)}</Text>
      <View className={styles.arrow} onClick={() => step(1)}>
        <Text className={styles.arrowText}>›</Text>
      </View>
    </View>
  );
};

export default MonthSwitcher;
