import React from 'react';
import { Text, View } from '@tarojs/components';
import styles from './index.module.scss';

interface SectionCardProps {
  title?: string;
  extraText?: string;
  onExtraClick?: () => void;
  children?: React.ReactNode;
  padded?: boolean;
}

const SectionCard: React.FC<SectionCardProps> = ({
  title,
  extraText,
  onExtraClick,
  children,
  padded = true
}) => (
  <View className={styles.card}>
    {title ? (
      <View className={styles.header}>
        <Text className={styles.title}>{title}</Text>
        {extraText ? (
          <Text className={styles.extra} onClick={onExtraClick}>
            {extraText}
          </Text>
        ) : null}
      </View>
    ) : null}
    <View className={padded ? styles.body : undefined}>{children}</View>
  </View>
);

export default SectionCard;
