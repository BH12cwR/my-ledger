import React from 'react';
import { View } from '@tarojs/components';
import styles from './index.module.scss';

interface ProgressBarProps {
  percent: number;
  color?: string;
  height?: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ percent, color = '#1677ff', height = 14 }) => {
  const safe = Math.max(0, Math.min(100, percent));
  return (
    <View className={styles.track} style={{ height: `${height}rpx` }}>
      <View
        className={styles.fill}
        style={{ width: `${safe}%`, backgroundColor: color, height: `${height}rpx` }}
      />
    </View>
  );
};

export default ProgressBar;
