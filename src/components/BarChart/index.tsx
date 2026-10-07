import React from 'react';
import { Text, View } from '@tarojs/components';
import classnames from 'classnames';
import styles from './index.module.scss';

export interface BarItem {
  label: string;
  value: number;
  highlight?: boolean;
}

interface BarChartProps {
  data: BarItem[];
  color?: string;
  highlightColor?: string;
  height?: number;
  showValue?: boolean;
}

const BarChart: React.FC<BarChartProps> = ({
  data,
  color = '#c9d8ff',
  highlightColor = '#1677ff',
  height = 160,
  showValue = false
}) => {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <View className={styles.chart} style={{ height: `${height}rpx` }}>
      {data.map((item) => {
        const ratio = item.value / max;
        return (
          <View key={item.label} className={styles.col}>
            {showValue ? (
              <Text className={styles.value}>{(item.value / 100).toFixed(0)}</Text>
            ) : null}
            <View className={styles.barArea}>
              <View
                className={classnames(styles.bar)}
                style={{
                  height: `${Math.max(6, ratio * 100)}%`,
                  backgroundColor: item.highlight ? highlightColor : color
                }}
              />
            </View>
            <Text className={classnames(styles.axis, item.highlight && styles.axisActive)}>
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

export default BarChart;
