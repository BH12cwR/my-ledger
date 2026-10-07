import React from 'react';
import { Text, View } from '@tarojs/components';
import styles from './index.module.scss';

interface BottomSheetProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children?: React.ReactNode;
  headerExtra?: React.ReactNode;
}

const BottomSheet: React.FC<BottomSheetProps> = ({ visible, title, onClose, children, headerExtra }) => {
  if (!visible) return null;
  return (
    <View className={styles.mask} onClick={onClose}>
      <View className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <View className={styles.header}>
          <Text className={styles.title}>{title}</Text>
          <View className={styles.headerRight}>{headerExtra}</View>
        </View>
        <View className={styles.body}>{children}</View>
      </View>
    </View>
  );
};

export default BottomSheet;
