"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_MONTH_START_DAY, normalizeMonthStartDay } from "./dates";

const STORAGE_KEY = "my-ledger.month-start-day";
/** 同一页面内多个消费者之间的同步事件（storage 事件只在其它标签页触发） */
const EVENT_NAME = "my-ledger:month-start-day";

function readStored(): number {
  try {
    return normalizeMonthStartDay(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // 隐私模式下 localStorage 可能不可读，回落到默认值
    return DEFAULT_MONTH_START_DAY;
  }
}

/**
 * 「月份起始日」本地偏好（默认 1 号，即自然月）。
 *
 * 初始态固定为默认值，保证服务端渲染与首屏 hydration 一致；
 * 挂载后再从 localStorage 读取真实值，并监听自定义事件与 storage 事件保持同步。
 */
export function useMonthStartDay(): [number, (day: number) => void] {
  const [day, setDay] = useState(DEFAULT_MONTH_START_DAY);

  useEffect(() => {
    setDay(readStored());

    const sync = () => setDay(readStored());
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((next: number) => {
    const value = normalizeMonthStartDay(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // 写入失败不影响本次会话的内存态
    }
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  return [day, update];
}
