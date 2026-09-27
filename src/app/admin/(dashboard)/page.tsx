"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { EmptyBlock, LoadingBlock } from "@/components/layout/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { buildQuery, type OverviewMetrics, type PlatformTrendResponse } from "@/lib/api";
import { axisDay, money } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks";

const TREND_CONFIG = {
  transactions: { label: "记账笔数", color: "#3b82f6" },
  newUsers: { label: "新增用户", color: "#10b981" },
} satisfies ChartConfig;

const WINDOWS = [7, 14, 30] as const;

/**
 * 后台概览：平台级核心指标 + 近 N 天活跃趋势。
 *
 * 所有口径都在服务端 SQL 中聚合，前端只做展示，不参与任何统计计算。
 */
export default function AdminOverviewPage() {
  const [days, setDays] = useState<number>(7);

  const metrics = useApiQuery<OverviewMetrics>(
    `/api/admin/metrics/overview${buildQuery({ days })}`,
  );
  const trend = useApiQuery<PlatformTrendResponse>(
    `/api/admin/metrics/trend${buildQuery({ days })}`,
  );

  if (metrics.loading) return <LoadingBlock label="正在汇总平台指标…" />;

  if (metrics.error) {
    return (
      <EmptyBlock
        title="指标加载失败"
        description={metrics.error}
        action={
          <Button variant="outline" size="sm" onClick={metrics.reload}>
            重试
          </Button>
        }
      />
    );
  }

  const data = metrics.data;
  const points = trend.data?.points ?? [];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-lg font-semibold">平台概览</h1>
          <p className="text-xs text-muted-foreground">
            {data?.range.days} 天窗口 · 自 {new Date(data?.range.since ?? Date.now()).toLocaleDateString("zh-CN")} 起
          </p>
        </div>
        <div className="flex gap-2">
          {WINDOWS.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={value === days ? "default" : "outline"}
              onClick={() => setDays(value)}
            >
              近 {value} 天
            </Button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="用户总数"
          value={`${data?.users.total ?? 0}`}
          hint={`活跃 ${data?.users.active ?? 0} · 禁用 ${data?.users.disabled ?? 0}`}
        />
        <StatCard
          title="区间新增用户"
          value={`${data?.users.newInRange ?? 0}`}
          hint={`区间活跃记账用户 ${data?.users.activeInRange ?? 0}`}
        />
        <StatCard
          title="账目总数"
          value={`${data?.transactions.total ?? 0}`}
          hint={`区间 ${data?.transactions.inRange ?? 0} 笔`}
        />
        <StatCard
          title="在线会话"
          value={`${data?.sessions.activeNow ?? 0}`}
          hint={`管理员 ${data?.admins.total ?? 0} 个`}
        />
        <StatCard
          title="区间支出"
          value={money(data?.transactions.expenseCentsInRange ?? 0)}
          hint="不含已删除记录"
        />
        <StatCard
          title="区间收入"
          value={money(data?.transactions.incomeCentsInRange ?? 0)}
          hint="不含已删除记录"
        />
        <StatCard
          title="区间净流入"
          value={money(
            (data?.transactions.incomeCentsInRange ?? 0) - (data?.transactions.expenseCentsInRange ?? 0),
          )}
          hint="收入 - 支出"
        />
        <StatCard
          title="人均记账"
          value={(() => {
            const active = data?.users.activeInRange ?? 0;
            if (active === 0) return "0";
            return (Math.round(((data?.transactions.inRange ?? 0) / active) * 10) / 10).toFixed(1);
          })()}
          hint="区间笔数 / 活跃用户"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>活跃趋势</CardTitle>
        </CardHeader>
        <CardContent>
          {trend.loading ? (
            <LoadingBlock label="正在生成趋势…" />
          ) : trend.error ? (
            <p className="py-6 text-center text-xs text-muted-foreground">{trend.error}</p>
          ) : points.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">暂无数据</p>
          ) : (
            <ChartContainer config={TREND_CONFIG} className="aspect-auto h-64 w-full">
              <BarChart data={points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={12}
                  tickFormatter={(value: string) => axisDay(value)}
                />
                <YAxis width={36} tickLine={false} axisLine={false} allowDecimals={false} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      indicator="dashed"
                      labelFormatter={(value) => axisDay(String(value))}
                    />
                  }
                />
                <Bar dataKey="transactions" fill="var(--color-transactions)" radius={4} />
                <Bar dataKey="newUsers" fill="var(--color-newUsers)" radius={4} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}