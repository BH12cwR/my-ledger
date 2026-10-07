import React, { useEffect } from 'react';
import Taro, { useDidShow, useDidHide } from '@tarojs/taro';
import { useUserStore } from '@/store/user';
// 全局样式
import './app.scss';

function App(props) {
  // 对应 onShow
  useDidShow(() => {
    // 每次回到前台时刷新登录态
    useUserStore.getState().refresh();
  });

  // 对应 onHide
  useDidHide(() => {});

  useEffect(() => {
    if (process.env.TARO_ENV === 'weapp') {
      // 云开发环境 ID 在部署阶段通过 CloudBase MCP envQuery 获取后回填
      Taro.cloud.init({ env: '', traceUser: true });
      console.info('[App] 微信云开发初始化完成');
    }
    // 启动时同步一次登录态
    useUserStore.getState().refresh();
  }, []);

  return props.children;
}

export default App;
