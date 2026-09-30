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
import { Chip } from "@/components/ui/chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
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

const KIND_OPTIONS = [
  { value: "expense", label: "支出", activeClass: "bg-tone-expense text-white" },
  { value: "income", label: "收入", activeClass: "bg-tone-income text-white" },
  { value: "transfer", label: "转账", activeClass: "bg-tone-transfer text-white" },
] as const satisfies ReadonlyArray<{
  value: EditorKind;
  label: string;
  activeClass: string;
}>;

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
 *
 * 顶栏是「X + 类型分段」这种全屏模态结构，不在 `PageHeader` 的两种形态里，
 * 因此按 §2.7 的例外条款自带 `sr-only` 的 h1。
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
    ? "text-tone-transfer-text"
    : kind === "income"
      ? "text-tone-income-text"
      : "text-tone-expense-text";
  const dayText = relativeDayLabel(happenedOn) ?? happenedOn;

  return (
    <div className="flex flex-col gap-4 pb-[calc(var(--pb-keypad)+env(safe-area-inset-bottom))]">
      <h1 className="sr-only">{transactionId ? "编辑账目" : "记一笔"}</h1>

      <header className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" aria-label="关闭" onClick={() => router.push("/")}>
          <X />
        </Button>
        <SegmentedControl
          items={KIND_OPTIONS}
          value={kind}
          onChange={handleKindChange}
          className="flex-1"
          label="账目类型"
        />
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
                    ? "bg-brand/10 text-brand-text ring-1 ring-brand/40"
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
            <span className="max-w-32 truncate">{fromAccount?.name ?? "扣款账户"}</span>
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
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        <span className={cn("shrink-0 font-mono text-2xl font-semibold tabular-nums", amountTone)}>
          {expression === "" ? "0.00" : expression}
        </span>
      </div>

      {(tags.data?.items ?? []).length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <TagIcon className="size-3.5 text-muted-foreground" aria-hidden />
          {(tags.data?.items ?? []).map((tag) => {
            const active = selectedTagIds.includes(tag.id);
            return (
              <Chip
                key={tag.id}
                size="sm"
                active={active}
                onClick={() =>
                  setSelectedTagIds((current) =>
                    current.includes(tag.id)
                      ? current.filter((id) => id !== tag.id)
                      : [...current, tag.id],
                  )
                }
                icon={
                  <>
                    {active ? <Check className="size-3" /> : null}
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: tag.color }}
                      aria-hidden
                    />
                  </>
                }
              >
                {tag.name}
              </Chip>
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
        <span className="block text-[10px] text-muted-foreground">{label}</span>
        <span className="block truncate text-sm font-medium">
          {account?.name ?? `选择${label}账户`}
        </span>
      </span>
    </button>
  );
}
