import React, { useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useUserStore } from '@/store/user';
import styles from './index.module.scss';

const FEATURES = [
  { icon: '⚡', text: '三秒记一笔，支持支出 / 收入 / 转账' },
  { icon: '📊', text: '自动统计月度趋势与分类排行' },
  { icon: '☁️', text: '微信云开发存储，多端数据实时同步' }
];

const LoginPage: React.FC = () => {
  const login = useUserStore((state) => state.login);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleLogin = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const user = await login();
      Taro.showToast({ title: `欢迎，${user.nickname}`, icon: 'none' });
      setTimeout(() => {
        Taro.switchTab({ url: '/pages/home/index' });
      }, 400);
    } catch (err) {
      console.error('[Login] 登录失败', err);
      Taro.showToast({ title: '登录失败，请重试', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className={styles.login}>
      <View className={styles.logo}>
        <Text className={styles.logoText}>📒</Text>
      </View>
      <Text className={styles.title}>我的账本</Text>
      <Text className={styles.desc}>简单好用的个人记账工具{'\n'}数据安全存储在微信云端</Text>

      <View className={styles.featureList}>
        {FEATURES.map((item) => (
          <View key={item.text} className={styles.feature}>
            <View className={styles.featureIcon}>
              <Text className={styles.featureIconText}>{item.icon}</Text>
            </View>
            <Text className={styles.featureText}>{item.text}</Text>
          </View>
        ))}
      </View>

      <View className={styles.loginButton} onClick={handleLogin}>
        <Text className={styles.loginButtonText}>{submitting ? '登录中…' : '微信一键登录'}</Text>
      </View>
      <Text className={styles.tips}>登录即表示同意用户协议与隐私政策</Text>
    </View>
  );
};

export default LoginPage;
