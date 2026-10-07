import React from 'react';
import { Text, View } from '@tarojs/components';
import classnames from 'classnames';
import styles from './index.module.scss';

export interface SegmentOption {
  label: string;
  value: string;
}

interface SegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  size?: 'md' | 'sm';
}

const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  size = 'md'
}) => (
  <View className={classnames(styles.segmented, size === 'sm' && styles.sm)}>
    {options.map((option) => (
      <View
        key={option.value}
        className={classnames(styles.item, value === option.value && styles.itemActive)}
        onClick={() => onChange(option.value)}
      >
        <Text className={classnames(styles.label, value === option.value && styles.labelActive)}>
          {option.label}
        </Text>
      </View>
    ))}
  </View>
);

export default SegmentedControl;
