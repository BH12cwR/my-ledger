"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DetailRow } from "@/components/detail-row";
import { BottomSheet, BottomSheetContent } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { api, errorMessage, type TransactionDto } from "@/lib/api";
import { money } from "@/lib/format";
import { relativeDayLabel } from "@/lib/dates";

const KIND_LABELS: Record<TransactionDto["kind"], string> = {
  expense: "支出",
  income: "收入",
  transfer: "转账",
};

/**
 * 账目详情抽屉。
 *
 * 记账页负责「编辑」，这里承担「查看 + 删除 + 退款」：原 `/transactions` 明细页
 * 收敛为 `/` 之后，这三件事需要一个落脚点，且按全局规范统一用底部抽屉而非居中弹窗。
 *
 * 删除做成两段式确认：不可逆的操作不该一次点击就生效。
 */
export function TransactionDetailSheet({
  transaction,
  onOpenChange,
  onChanged,
  onEdit,
}: {
  transaction: TransactionDto | null;
  onOpenChange: (open: boolean) => void;
  /** 删除 / 退款成功后触发，调用方据此刷新列表与汇总 */
  onChanged: () => void;
  onEdit: (transaction: TransactionDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // 换一笔账目就清掉上一次的确认态，避免「确认删除」直接作用到新记录上
  useEffect(() => {
    setConfirmingDelete(false);
  }, [transaction?.id]);

  function close() {
    setConfirmingDelete(false);
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!transaction) return;
    setBusy(true);
    try {
      await api.delete(`/api/transactions/${transaction.id}`);
      toast.success("已删除该笔记录");
      close();
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRefund() {
    if (!transaction) return;
    setBusy(true);
    try {
      await api.post(`/api/transactions/${transaction.id}/refund`);
      toast.success("已生成等额退款收入");
      close();
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const isTransfer = transaction?.kind === "transfer";
  const canRefund =
    transaction?.kind === "expense" && !transaction.refundOfId && !transaction.refundedAt;
  const relativeDay = transaction ? relativeDayLabel(transaction.happenedOn) : null;

  return (
    <BottomSheet open={transaction !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <BottomSheetContent
        title={sheetTitle(transaction)}
        footer={
          confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="mr-auto text-xs text-muted-foreground">删除后不可恢复</span>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmingDelete(false)}>
                取消
              </Button>
              <Button variant="destructive" size="sm" disabled={busy} onClick={handleDelete}>
                {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
                确认删除
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={busy || !transaction}
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 />
                删除
              </Button>
              {canRefund ? (
                <Button variant="secondary" size="sm" disabled={busy} onClick={handleRefund}>
                  {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                  退款
                </Button>
              ) : null}
              <Button
                className="ml-auto"
                size="sm"
                disabled={busy || !transaction || Boolean(transaction.refundOfId)}
                onClick={() => {
                  if (!transaction) return;
                  close();
                  onEdit(transaction);
                }}
              >
                <Pencil />
                编辑
              </Button>
            </div>
          )
        }
      >
        {transaction ? (
          <div className="flex flex-col gap-2 pb-1 text-sm">
            <DetailRow label="类型" value={KIND_LABELS[transaction.kind]} />
            <DetailRow label="金额" value={money(transaction.amountCents)} mono />
            <DetailRow
              label="日期"
              value={
                relativeDay
                  ? `${transaction.happenedOn}（${relativeDay}）`
                  : transaction.happenedOn
              }
            />
            {isTransfer ? (
              <>
                <DetailRow label="转出账户" value={transaction.accountName ?? "未指定"} />
                <DetailRow label="转入账户" value={transaction.toAccountName ?? "未指定"} />
              </>
            ) : (
              <DetailRow label="账户" value={transaction.accountName ?? "未指定"} />
            )}
            <DetailRow label="备注" value={transaction.note ?? "无"} />
            <DetailRow
              label="标签"
              value={transaction.tags.length > 0 ? transaction.tags.join("、") : "无"}
            />
            {transaction.refundOfId ? (
              <DetailRow label="状态" value="退款收入（不可编辑）" />
            ) : null}
            {transaction.refundedAt ? <DetailRow label="状态" value="已退款" /> : null}
          </div>
        ) : null}
      </BottomSheetContent>
    </BottomSheet>
  );
}

function sheetTitle(transaction: TransactionDto | null): string {
  if (!transaction) return "账目详情";
  if (transaction.kind === "transfer") {
    return transaction.accountName && transaction.toAccountName
      ? `${transaction.accountName} → ${transaction.toAccountName}`
      : "转账";
  }
  return transaction.categoryName ?? (transaction.kind === "income" ? "收入" : "支出");
}
