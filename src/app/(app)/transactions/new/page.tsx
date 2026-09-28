"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";
import { CategoryBadge } from "@/components/category-icon";
import { ErrorBlock, LoadingBlock } from "@/components/layout/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  api,
  errorMessage,
  type AccountDto,
  type CategoryDto,
  type TagDto,
  type TransactionDto,
} from "@/lib/api";
import { todayInBusinessTimezone } from "@/lib/dates";
import { useApiQuery } from "@/lib/hooks";
import { centsToInputValue, parseAmountToCents } from "@/lib/money";
import { cn } from "@/lib/utils";

const NO_ACCOUNT = "__none__";

/**
 * 记一笔 / 编辑。
 *
 * 通过 `?id=` 区分新增与编辑（同一个表单，避免两套 UI 漂移）。
 * 金额在提交前用 parseAmountToCents 校验，再归一化为两位小数字符串交给服务端，
 * 服务端仍然会独立校验一次，前端校验只是体验优化。
 */
export default function TransactionEditorPage() {
  const router = useRouter();

  const categories = useApiQuery<{ items: CategoryDto[] }>("/api/categories");
  const accounts = useApiQuery<{ items: AccountDto[] }>("/api/accounts");
  const tags = useApiQuery<{ items: TagDto[] }>("/api/tags");

  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [pendingTagNames, setPendingTagNames] = useState<string[] | null>(null);

  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string>(NO_ACCOUNT);
  const [happenedOn, setHappenedOn] = useState(todayInBusinessTimezone());
  const [note, setNote] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
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
        setKind(transaction.kind === "income" ? "income" : "expense");
        setAmount(centsToInputValue(transaction.amountCents));
        setCategoryId(transaction.categoryId);
        setAccountId(transaction.accountId ?? NO_ACCOUNT);
        setHappenedOn(transaction.happenedOn);
        setNote(transaction.note ?? "");
        setPendingTagNames(transaction.tags);
      })
      .catch((error: unknown) => {
        toast.error(errorMessage(error));
        router.replace("/transactions");
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

  // 新增时默认选中第一个可用账户，减少一次点击
  useEffect(() => {
    if (transactionId || !accounts.data || accounts.data.items.length === 0) return;
    setAccountId((current) =>
      current === NO_ACCOUNT ? (accounts.data?.items[0]?.id ?? NO_ACCOUNT) : current,
    );
  }, [transactionId, accounts.data]);

  const visibleCategories = useMemo(
    () => (categories.data?.items ?? []).filter((item) => item.kind === kind),
    [categories.data, kind],
  );

  const handleKindChange = useCallback(
    (next: "expense" | "income") => {
      setKind(next);
      // 分类与账目类型必须一致，切换时清掉不匹配的选择
      setCategoryId((current) => {
        if (!current) return current;
        const category = categories.data?.items.find((item) => item.id === current);
        return category && category.kind === next ? current : null;
      });
    },
    [categories.data],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    let normalized: string;
    try {
      normalized = centsToInputValue(parseAmountToCents(amount));
      setAmountError(null);
    } catch (error) {
      setAmountError(error instanceof Error ? error.message : "金额格式不正确");
      return;
    }

    const payload = {
      kind,
      amount: normalized,
      categoryId,
      accountId: accountId === NO_ACCOUNT ? null : accountId,
      note: note.trim() === "" ? null : note.trim(),
      happenedOn,
      tagIds: selectedTagIds,
    };

    setSubmitting(true);
    try {
      if (transactionId) {
        await api.patch(`/api/transactions/${transactionId}`, payload);
        toast.success("已更新这笔记录");
      } else {
        await api.post("/api/transactions", payload);
        toast.success("已记下这笔");
      }
      router.push("/transactions");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingExisting) return <LoadingBlock label="正在准备记账表单…" />;

  if (categories.error || accounts.error) {
    return (
      <ErrorBlock
        title="表单初始化失败"
        description={categories.error ?? accounts.error}
        onRetry={() => {
          categories.reload();
          accounts.reload();
        }}
      />
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <header className="flex items-center justify-between">
        <h1 className="font-heading text-lg font-semibold">
          {transactionId ? "编辑账目" : "记一笔"}
        </h1>
        {transactionId ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.push("/transactions")}
          >
            取消
          </Button>
        ) : null}
      </header>

      <Tabs value={kind} onValueChange={(value) => handleKindChange(value as "expense" | "income")}>
        <TabsList className="w-full">
          <TabsTrigger value="expense">支出</TabsTrigger>
          <TabsTrigger value="income">收入</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">金额</Label>
            <Input
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              aria-invalid={amountError !== null}
              onChange={(event) => {
                setAmount(event.target.value);
                setAmountError(null);
              }}
              className="h-12 font-mono text-2xl"
            />
            {amountError ? <p className="text-xs text-destructive">{amountError}</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="happenedOn">日期</Label>
              <Input
                id="happenedOn"
                type="date"
                value={happenedOn}
                onChange={(event) => setHappenedOn(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>账户</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择账户" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ACCOUNT}>不指定</SelectItem>
                  {(accounts.data?.items ?? []).map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">备注</Label>
            <Input
              id="note"
              maxLength={200}
              placeholder="例如：和同事聚餐"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <Label>分类</Label>
          {categories.loading ? (
            <LoadingBlock label="正在加载分类…" />
          ) : visibleCategories.length === 0 ? (
            <p className="text-xs text-muted-foreground">暂无可用分类，请先到「我的」中创建。</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {visibleCategories.map((category) => {
                const active = category.id === categoryId;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setCategoryId(active ? null : category.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs transition-colors",
                      active ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
                    )}
                  >
                    <CategoryBadge icon={category.icon} color={category.color} />
                    <span className="w-full truncate text-center">{category.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <TagIcon className="size-4 text-muted-foreground" />
            <Label>标签（可选）</Label>
          </div>
          {(tags.data?.items ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">还没有标签，可在「我的」中创建。</p>
          ) : (
            <div className="flex flex-wrap gap-2">
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
                        ? "border-primary bg-primary/10 text-primary"
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
          )}
        </CardContent>
      </Card>

      <Button type="submit" size="lg" disabled={submitting || amount.trim() === ""}>
        {submitting ? <Loader2 className="animate-spin" /> : null}
        {transactionId ? "保存修改" : "保存"}
      </Button>
    </form>
  );
}