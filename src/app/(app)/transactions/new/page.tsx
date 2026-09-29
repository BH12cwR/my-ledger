"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Check, Tag as TagIcon, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { AccountSheet } from "@/components/account/account-sheet";
import { CategoryBadge } from "@/components/category-icon";
import { CalendarSheet } from "@/components/date/date-sheet";
import { NumberKeypad } from "@/components/keyboard/number-keypad";
import { ErrorBlock, LoadingBlock } from "@/components/layout/states";
import { Button } from "@/components/ui/button";
import {
  api,
  errorMessage,
  type AccountBalanceItem,
  type CategoryDto,
  type TagDto,
  type TransactionDto,
} from "@/lib/api";
import { relativeDayLabel, todayInBusinessTimezone } from "@/lib/dates";
import { useApiQuery } from "@/lib/hooks";
import { centsToInputValue, evaluateAmountExpression } from "@/lib/money";
import { cn } from "@/lib/utils";

/** 记账页的三种记录类型，与 transactions.kind 一一对应 */
type EditorKind = "expense" | "income" | "transfer";

const KIND_OPTIONS: Array<{ value: EditorKind; label: string; activeClass: string }> = [
  { value: "expense", label: "支出", activeClass: "bg-rose-500 text-white" },
  { value: "income", label: "收入", activeClass: "bg-emerald-500 text-white" },
  { value: "transfer", label: "转账", activeClass: "bg-blue-500 text-white" },
];

const ACCOUNTS_PATH = "/api/stats/accounts?includeArchived=true";

/** 表达式最长长度，避免连点后无限增长 */
const MAX_EXPRESSION_LENGTH = 18;

/** 当前正在输入的金额段（最后一个运算符之后的部分） */
function lastSegment(expression: string): string {
  const segments = expression.split(/[+\-]/);
  return segments[segments.length - 1] ?? "";
}

function pushDigit(expression: string, digit: string): string {
  if (expression.length >= MAX_EXPRESSION_LENGTH) return expression;
  const current = lastSegment(expression);
  if (current.includes(".") && (current.split(".")[1] ?? "").length >= 2) return expression;
  // 前导零没有意义，直接替换掉
  if (current === "0") return `${expression.slice(0, -1)}${digit}`;
  return `${expression}${digit}`;
}

function pushDot(expression: string): string {
  if (expression.length >= MAX_EXPRESSION_LENGTH) return expression;
  const current = lastSegment(expression);
  if (current.includes(".")) return expression;
  return current === "" ? `${expression}0.` : `${expression}.`;
}

/** `−` / `+` 是同级运算符；末位已是运算符时替换而不是叠加 */
function pushOperator(expression: string, operator: "+" | "-"): string {
  if (expression === "") return expression;
  if (/[+\-]$/.test(expression)) return `${expression.slice(0, -1)}${operator}`;
  if (expression.length >= MAX_EXPRESSION_LENGTH) return expression;
  return `${expression}${operator}`;
}

/**
 * 记一笔 / 编辑（键盘式）。
 *
 * 与账单页同一套交互语言：数字键盘直接改「表达式」，保存时整体求值。
 * 通过 `?id=` 区分新增与编辑（同一个界面，避免两套 UI 漂移）。
 * 金额与转账的不变式前端只做提示，服务端仍会独立校验一次。
 */
export default function TransactionEditorPage() {
  const router = useRouter();

  const categories = useApiQuery<{ items: CategoryDto[] }>("/api/categories");
  const tags = useApiQuery<{ items: TagDto[] }>("/api/tags");
  const accounts = useApiQuery<{ items: AccountBalanceItem[] }>(ACCOUNTS_PATH);

  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [pendingTagNames, setPendingTagNames] = useState<string[] | null>(null);

  const [kind, setKind] = useState<EditorKind>("expense");
  /** 计算器式金额表达式，如 "12.30+5"；空串表示还没输入 */
  const [expression, setExpression] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [happenedOn, setHappenedOn] = useState(todayInBusinessTimezone());
  const [note, setNote] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [sheet, setSheet] = useState<null | "from" | "to">(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 用 window.location.search 而不是 useSearchParams：后者会强制页面动态渲染，
  // 与静态预渲染策略冲突，会让页面退出静态生成。
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      setLoadingExisting(false);
      return;
    }
    setTransactionId(id);
    api
      .get<{ transaction: TransactionDto }>(`/api/transactions/${id}`)
      .then(({ transaction }) => {
        setKind(transaction.kind);
        setExpression(centsToInputValue(transaction.amountCents));
        setCategoryId(transaction.categoryId);
        setAccountId(transaction.accountId);
        setToAccountId(transaction.toAccountId);
        setHappenedOn(transaction.happenedOn);
        setNote(transaction.note ?? "");
        setPendingTagNames(transaction.tags);
      })
      .catch((error: unknown) => {
        toast.error(errorMessage(error));
        router.replace("/");
      })
      .finally(() => setLoadingExisting(false));
  }, [router]);

  // 账目里存的是标签名称，等标签字典到齐后再映射为 id
  useEffect(() => {
    if (!pendingTagNames || !tags.data) return;
    const names = new Set(pendingTagNames);
    setSelectedTagIds(tags.data.items.filter((tag) => names.has(tag.name)).map((tag) => tag.id));
    setPendingTagNames(null);
  }, [pendingTagNames, tags.data]);

  const accountItems = useMemo(() => accounts.data?.items ?? [], [accounts.data]);
  const fromAccount = accountItems.find((item) => item.id === accountId) ?? null;
  const toAccount = accountItems.find((item) => item.id === toAccountId) ?? null;

  // 新增时默认选中第一个账户，减少一次点击
  useEffect(() => {
    if (transactionId || accountItems.length === 0) return;
    setAccountId((current) => current ?? accountItems[0]?.id ?? null);
  }, [transactionId, accountItems]);

  const visibleCategories = useMemo(
    () => (categories.data?.items ?? []).filter((item) => item.kind === kind),
    [categories.data, kind],
  );

  const handleKindChange = useCallback(
    (next: EditorKind) => {
      setKind(next);
      // 分类只对收支有意义，且必须与账目类型一致；切走时清掉不匹配的选择
      setCategoryId((current) => {
        if (!current) return current;
        const category = categories.data?.items.find((item) => item.id === current);
        return category && category.kind === next ? current : null;
      });
    },
    [categories.data],
  );

  const handleSave = useCallback(
    async (mode: "back" | "repeat") => {
      let cents: number;
      try {
        cents = evaluateAmountExpression(expression);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "金额格式不正确");
        return;
      }
      if (cents <= 0) {
        toast.error("金额必须大于 0");
        return;
      }
      if (kind === "transfer") {
        if (!accountId) {
          toast.error("请选择转出账户");
          return;
        }
        if (!toAccountId) {
          toast.error("请选择转入账户");
          return;
        }
        if (accountId === toAccountId) {
          toast.error("转出与转入账户不能相同");
          return;
        }
      } else if (!categoryId) {
        toast.error("请选择分类");
        return;
      }

      const payload = {
        kind,
        amount: centsToInputValue(cents),
        categoryId: kind === "transfer" ? null : categoryId,
        accountId,
        toAccountId: kind === "transfer" ? toAccountId : null,
        note: note.trim() === "" ? null : note.trim(),
        happenedOn,
        tagIds: selectedTagIds,
      };

      setSubmitting(true);
      try {
        if (transactionId) {
          await api.patch(`/api/transactions/${transactionId}`, payload);
          toast.success("已更新这笔记录");
          router.push("/");
          return;
        }
        await api.post("/api/transactions", payload);
        toast.success("已记下这笔");
        if (mode === "repeat") {
          // 「再记」保留账户与日期，只清空这笔的具体内容
          setExpression("");
          setNote("");
          setCategoryId(null);
          setSelectedTagIds([]);
        } else {
          router.push("/");
        }
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setSubmitting(false);
      }
    },
    [
      expression,
      kind,
      accountId,
      toAccountId,
      categoryId,
      note,
      happenedOn,
      selectedTagIds,
      transactionId,
      router,
    ],
  );

  if (loadingExisting) return <LoadingBlock label="正在准备记账面板…" />;

  if (categories.error || accounts.error) {
    return (
      <ErrorBlock
        title="记账面板初始化失败"
        description={categories.error ?? accounts.error}
        onRetry={() => {
          categories.reload();
          accounts.reload();
        }}
      />
    );
  }

  const isTransfer = kind === "transfer";
  const amountTone = isTransfer
    ? "text-blue-600 dark:text-blue-400"
    : kind === "income"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";
  const dayText = relativeDayLabel(happenedOn) ?? happenedOn;

  return (
    <div className="flex flex-col gap-4 pb-[calc(15.5rem+env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" aria-label="关闭" onClick={() => router.push("/")}>
          <X />
        </Button>
        <div className="flex flex-1 gap-1 rounded-xl bg-muted/60 p-1">
          {KIND_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleKindChange(option.value)}
              className={cn(
                "flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors",
                kind === option.value
                  ? option.activeClass
                  : "text-muted-foreground hover:bg-background/60",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {isTransfer ? (
        <div className="flex items-center gap-2">
          <AccountPanel
            label="转出"
            account={fromAccount}
            onClick={() => setSheet("from")}
          />
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <AccountPanel label="转入" account={toAccount} onClick={() => setSheet("to")} />
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-1">
          {visibleCategories.map((category) => {
            const active = category.id === categoryId;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(active ? null : category.id)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs transition-colors",
                  active
                    ? "bg-blue-500/10 text-blue-600 ring-1 ring-blue-500/40 dark:text-blue-400"
                    : "hover:bg-muted/60",
                )}
              >
                <CategoryBadge icon={category.icon} color={category.color} />
                <span className="w-full truncate text-center">{category.name}</span>
              </button>
            );
          })}
          {!categories.loading && visibleCategories.length === 0 ? (
            <p className="col-span-5 py-2 text-center text-xs text-muted-foreground">
              暂无可用分类，请先到「我的」中创建。
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isTransfer ? null : (
          <Chip icon={<Wallet className="size-3.5" />} onClick={() => setSheet("from")}>
            {fromAccount?.name ?? "扣款账户"}
          </Chip>
        )}
        <Chip icon={<CalendarDays className="size-3.5" />} onClick={() => setDateOpen(true)}>
          {dayText}
        </Chip>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2">
        <input
          value={note}
          maxLength={200}
          placeholder="点此输入备注…"
          onChange={(event) => setNote(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <span
          className={cn(
            "shrink-0 font-mono text-2xl tabular-nums",
            expression === "" ? "text-muted-foreground/40" : amountTone,
          )}
        >
          {expression === "" ? "0.00" : expression}
        </span>
      </div>

      {(tags.data?.items ?? []).length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <TagIcon className="size-3.5 text-muted-foreground" aria-hidden />
          {(tags.data?.items ?? []).map((tag) => {
            const active = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() =>
                  setSelectedTagIds((current) =>
                    current.includes(tag.id)
                      ? current.filter((id) => id !== tag.id)
                      : [...current, tag.id],
                  )
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    : "border-border text-muted-foreground hover:bg-muted/60",
                )}
              >
                {active ? <Check className="size-3" /> : null}
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                  aria-hidden
                />
                {tag.name}
              </button>
            );
          })}
        </div>
      ) : null}

      <AccountSheet
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
        value={sheet === "to" ? toAccountId : accountId}
        onSelect={(next) => (sheet === "to" ? setToAccountId(next) : setAccountId(next))}
        title={sheet === "to" ? "选择转入账户" : isTransfer ? "选择转出账户" : "选择扣款账户"}
      />

      <CalendarSheet
        open={dateOpen}
        onOpenChange={setDateOpen}
        value={happenedOn}
        onConfirm={setHappenedOn}
      />

      <NumberKeypad
        onDigit={(digit) => setExpression((current) => pushDigit(current, digit))}
        onDot={() => setExpression(pushDot)}
        onOperator={(operator) => setExpression((current) => pushOperator(current, operator))}
        onDelete={() => setExpression((current) => current.slice(0, -1))}
        onSave={() => handleSave("back")}
        onSaveAndNew={transactionId ? undefined : () => handleSave("repeat")}
        saving={submitting}
      />
    </div>
  );
}

/** 转账的两个账户栏：未选择时给出占位文案 */
function AccountPanel({
  label,
  account,
  onClick,
}: {
  label: string;
  account: AccountBalanceItem | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-3 text-left transition-colors hover:bg-muted/60",
        account ? "border-border/60" : "border-dashed border-border",
      )}
    >
      {account ? (
        <CategoryBadge icon={account.icon} />
      ) : (
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted/60">
          <Wallet className="size-4 text-muted-foreground" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-muted-foreground">{label}</span>
        <span className="block truncate text-sm font-medium">
          {account?.name ?? `选择${label}账户`}
        </span>
      </span>
    </button>
  );
}

/** 记账页的轻量胶囊按钮（账户 / 日期） */
function Chip({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60"
    >
      {icon}
      <span className="max-w-32 truncate">{children}</span>
    </button>
  );
}