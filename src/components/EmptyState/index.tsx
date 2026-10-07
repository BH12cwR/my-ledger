import React from 'react';
import { Text, View } from '@tarojs/components';
import styles from './index.module.scss';

interface EmptyStateProps {
  icon?: string;
  title?: string;
  desc?: string;
  actionText?: string;
  onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon = '🗒️',
  title = '暂无数据',
  desc,
  actionText,
  onAction
}) => (
  <View className={styles.empty}>
    <Text className={styles.icon}>{icon}</Text>
    <Text className={styles.title}>{title}</Text>
    {desc ? <Text className={styles.desc}>{desc}</Text> : null}
    {actionText ? (
      <View className={styles.action} onClick={onAction}>
        <Text className={styles.actionText}>{actionText}</Text>
      </View>
    ) : null}
  </View>
);

export default EmptyState;
