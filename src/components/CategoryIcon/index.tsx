import React from 'react';
import { Text, View } from '@tarojs/components';
import styles from './index.module.scss';

interface CategoryIconProps {
  icon: string;
  color?: string;
  size?: number;
}

const CategoryIcon: React.FC<CategoryIconProps> = ({ icon, color = '#1677ff', size = 80 }) => (
  <View
    className={styles.iconWrap}
    style={{ width: `${size}rpx`, height: `${size}rpx`, backgroundColor: `${color}1f` }}
  >
    <Text className={styles.iconText} style={{ fontSize: `${size * 0.5}rpx` }}>
      {icon || '📝'}
    </Text>
  </View>
);

export default CategoryIcon;
