"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 列表分页控件。
 *
 * 页码由父组件持有并参与查询串构造，这里只负责渲染与翻页回调，
 * 因此不关心数据从哪来 —— 用户端流水与后台三张列表共用同一套实现。
 */
export function Pagination({
  page,
  totalPages,
  total = 0,
  unit = "笔",
  onPageChange,
}: {
  page: number;
  totalPages: number;
  /** 总量，用于「共 N 笔」的描述 */
  total?: number;
  /** 计量单位：笔 / 条 / 人 */
  unit?: string;
  onPageChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-xs text-muted-foreground">
        共 {total} {unit} · 第 {page} / {Math.max(totalPages, 1)} 页
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ArrowLeft />
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
