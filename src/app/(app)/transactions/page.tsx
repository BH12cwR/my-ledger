import { redirect } from "next/navigation";

/**
 * 旧「账目明细」路由已收敛到账单页 `/`（交互方案 期 5）。
 *
 * 明细能力已被拆分承担：`/` 看当月流水、`/search` 搜索全量、`/search/filter` 组合筛选。
 * 保留一个平行入口只会让两套口径慢慢漂移，因此直接服务端重定向，
 * 旧链接与书签仍可正常打开。
 */
export default function TransactionsRedirectPage() {
  redirect("/");
}
