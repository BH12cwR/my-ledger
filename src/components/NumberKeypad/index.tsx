import React from 'react';
import { Text, View } from '@tarojs/components';
import classnames from 'classnames';
import { appendAmountToken, backspaceAmount } from '@/utils/money';
import styles from './index.module.scss';

interface NumberKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onConfirm?: () => void;
  confirmText?: string;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

const NumberKeypad: React.FC<NumberKeypadProps> = ({
  value,
  onChange,
  onConfirm,
  confirmText = '确定'
}) => {
  const handleKey = (key: string) => {
    if (key === 'del') {
      onChange(backspaceAmount(value));
      return;
    }
    onChange(appendAmountToken(value, key));
  };

  return (
    <View className={styles.keypad}>
      <View className={styles.grid}>
        {KEYS.map((key) => (
          <View key={key} className={classnames(styles.key, key === 'del' && styles.keyFn)} onClick={() => handleKey(key)}>
            <Text className={styles.keyText}>{key === 'del' ? '⌫' : key}</Text>
          </View>
        ))}
      </View>
      <View className={styles.confirm} onClick={onConfirm}>
        <Text className={styles.confirmText}>{confirmText}</Text>
      </View>
    </View>
  );
};

export default NumberKeypad;
