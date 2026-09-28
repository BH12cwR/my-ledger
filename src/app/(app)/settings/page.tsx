"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BudgetProgress, budgetPeriodLabel } from "@/components/budget-progress";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyBlock, LoadingBlock } from "@/components/layout/states";
import { useSession } from "@/components/providers/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  api,
  errorMessage,
  type AccountBalanceItem,
  type AccountDto,
  type BudgetView,
  type CategoryDto,
  type TagDto,
} from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks";
import { centsToInputValue, parseAmountToCents } from "@/lib/money";
import { cn } from "@/lib/utils";

const ACCOUNT_TYPES = [
  { value: "cash", label: "现金" },
  { value: "bank", label: "银行卡" },
  { value: "wechat", label: "微信" },
  { value: "alipay", label: "支付宝" },
  { value: "credit", label: "信用卡" },
  { value: "other", label: "其他" },
] as const;

const PALETTE = [
  "#64748b",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

/** 「总预算」在下拉框中的哨兵值：Radix Select 不允许空字符串 value */
const TOTAL_SCOPE = "__total__";

/**
 * 「我的」页：账户 / 分类 / 标签的个人化配置 + 退出登录。
 *
 * 账户的具体余额由 /api/stats/accounts 计算（初始余额 + 收入 - 支出），
 * 前端只负责展示，不做任何金额运算。
 */
export default function SettingsPage() {
  const { user, logout } = useSession();
  const router = useRouter();

  const [showArchived, setShowArchived] = useState(false);
  const accounts = useApiQuery<{ items: AccountDto[] }>(
    `/api/accounts${showArchived ? "?includeArchived=true" : ""}`,
  );
  const balances = useApiQuery<{ items: AccountBalanceItem[] }>(
    `/api/stats/accounts${showArchived ? "?includeArchived=true" : ""}`,
  );
  const categories = useApiQuery<{ items: CategoryDto[] }>(
    `/api/categories?includeArchived=true`,
  );
  const tags = useApiQuery<{ items: TagDto[] }>("/api/tags");
  const budgets = useApiQuery<{ items: BudgetView[] }>("/api/budgets");

  const [accountDialog, setAccountDialog] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<string>("cash");
  const [accountBalance, setAccountBalance] = useState("");
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryKind, setCategoryKind] = useState<string>("expense");
  const [categoryColor, setCategoryColor] = useState(PALETTE[5]);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [tagDialog, setTagDialog] = useState(false);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState(PALETTE[3]);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [budgetDialog, setBudgetDialog] = useState(false);
  const [budgetScope, setBudgetScope] = useState<string>(TOTAL_SCOPE);
  const [budgetPeriod, setBudgetPeriod] = useState<string>("monthly");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const balanceById = new Map((balances.data?.items ?? []).map((item) => [item.id, item]));
  // 预算只能落在支出分类上；正在编辑的预算若已被归档，仍保留在选项里以免下拉框失配
  const expenseCategories = (categories.data?.items ?? []).filter(
    (item) => item.kind === "expense" && (!item.archived || item.id === budgetScope),
  );

  /**
   * 账户余额由 /api/stats/accounts 单独计算（初始余额 + 收入 - 支出），
   * 与账户列表是两个请求，返回顺序不固定。
   *
   * 因此余额未就绪时显示占位符，而不是回退到 initialBalanceCents ——
   * 回退会先渲染一个不等于真实余额的数字，待余额请求返回后再跳变。
   * 该接口以 accounts 为左表，就绪后必然覆盖全部账户，不会长期停在占位符。
   */
  function renderBalance(accountId: string) {
    const balance = balanceById.get(accountId);
    if (!balance) {
      return (
        <span className="text-muted-foreground" aria-label="余额加载中">
          —
        </span>
      );
    }
    return money(balance.balanceCents);
  }

  async function run(action: () => Promise<unknown>, success: string, reload: () => void) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function openCreateAccount() {
    setEditingAccountId(null);
    setAccountName("");
    setAccountType("cash");
    setAccountBalance("");
    setAccountDialog(true);
  }

  function openEditAccount(account: AccountDto) {
    setEditingAccountId(account.id);
    setAccountName(account.name);
    setAccountType(account.type);
    // 接口的 initialBalance 口径是「元」字符串，先由分转回元再回填。
    setAccountBalance(centsToInputValue(account.initialBalanceCents));
    setAccountDialog(true);
  }

  async function handleSubmitAccount() {
    // 接口的 initialBalance 口径是「元」字符串，必须先归一化回元再提交。
    // 直接把分提交上去会被后端当成元再换算一次，导致金额放大 100 倍。
    // 初始余额允许为 0，因此需要显式打开 allowZero。
    let initialBalance: string;
    try {
      const cents = parseAmountToCents(accountBalance.trim() === "" ? "0" : accountBalance, {
        allowZero: true,
      });
      initialBalance = centsToInputValue(cents);
    } catch (error) {
      toast.error(errorMessage(error));
      return;
    }

    const editing = editingAccountId;
    await run(
      async () => {
        const body = { name: accountName.trim(), type: accountType, initialBalance };
        if (editing) {
          await api.patch(`/api/accounts/${editing}`, body);
        } else {
          await api.post("/api/accounts", body);
        }
        setAccountDialog(false);
        setAccountName("");
        setAccountBalance("");
        setEditingAccountId(null);
      },
      editing ? "账户已更新" : "账户已创建",
      () => {
        accounts.reload();
        balances.reload();
      },
    );
  }

  function openCreateCategory() {
    setEditingCategoryId(null);
    setCategoryName("");
    setCategoryKind("expense");
    setCategoryColor(PALETTE[5]);
    setCategoryDialog(true);
  }

  function openEditCategory(category: CategoryDto) {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryKind(category.kind);
    setCategoryColor(category.color);
    setCategoryDialog(true);
  }

  async function handleSubmitCategory() {
    const editing = editingCategoryId;
    await run(
      async () => {
        if (editing) {
          // 分类类型决定其历史账目语义，创建后不可更改，编辑时只提交名称与颜色。
          await api.patch(`/api/categories/${editing}`, {
            name: categoryName.trim(),
            color: categoryColor,
          });
        } else {
          await api.post("/api/categories", {
            name: categoryName.trim(),
            kind: categoryKind,
            color: categoryColor,
          });
        }
        setCategoryDialog(false);
        setCategoryName("");
        setEditingCategoryId(null);
      },
      editing ? "分类已更新" : "分类已创建",
      categories.reload,
    );
  }

  function openCreateTag() {
    setEditingTagId(null);
    setTagName("");
    setTagColor(PALETTE[3]);
    setTagDialog(true);
  }

  function openEditTag(tag: TagDto) {
    setEditingTagId(tag.id);
    setTagName(tag.name);
    setTagColor(tag.color);
    setTagDialog(true);
  }

  async function handleSubmitTag() {
    const editing = editingTagId;
    await run(
      async () => {
        const body = { name: tagName.trim(), color: tagColor };
        if (editing) {
          await api.patch(`/api/tags/${editing}`, body);
        } else {
          await api.post("/api/tags", body);
        }
        setTagDialog(false);
        setTagName("");
        setEditingTagId(null);
      },
      editing ? "标签已更新" : "标签已创建",
      tags.reload,
    );
  }

  function openCreateBudget() {
    setEditingBudgetId(null);
    setBudgetScope(TOTAL_SCOPE);
    setBudgetPeriod("monthly");
    setBudgetAmount("");
    setBudgetDialog(true);
  }

  function openEditBudget(budget: BudgetView) {
    setEditingBudgetId(budget.id);
    setBudgetScope(budget.categoryId ?? TOTAL_SCOPE);
    setBudgetPeriod(budget.period);
    setBudgetAmount(centsToInputValue(budget.amountCents));
    setBudgetDialog(true);
  }

  async function handleSubmitBudget() {
    // 与账户初始余额同理：先把输入归一到「元」字符串，避免后端二次换算放大 100 倍。
    let amount: string;
    try {
      amount = centsToInputValue(parseAmountToCents(budgetAmount));
    } catch (error) {
      toast.error(errorMessage(error));
      return;
    }

    const editing = editingBudgetId;
    await run(
      async () => {
        if (editing) {
          await api.patch(`/api/budgets/${editing}`, { amount });
        } else {
          await api.post("/api/budgets", {
            categoryId: budgetScope === TOTAL_SCOPE ? null : budgetScope,
            period: budgetPeriod,
            amount,
          });
        }
        setBudgetDialog(false);
        setBudgetAmount("");
        setEditingBudgetId(null);
      },
      editing ? "预算已更新" : "预算已创建",
      budgets.reload,
    );
  }

  async function handleLogout() {
    await logout();
    toast.success("已退出登录");
    router.replace("/login");
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-semibold">我的</h1>

      <Card>
        <CardContent className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{user?.nickname ?? "未登录"}</p>
            <p className="text-xs text-muted-foreground">
              注册于 {dateTime(user?.createdAt)} · 上次登录 {dateTime(user?.lastLoginAt)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut />
            退出
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2">
        <div>
          <p className="text-sm">显示已归档</p>
          <p className="text-xs text-muted-foreground">归档项不再出现在记账表单中</p>
        </div>
        <Switch checked={showArchived} onCheckedChange={setShowArchived} />
      </div>

      <Tabs defaultValue="accounts">
        <TabsList className="w-full">
          <TabsTrigger value="accounts">账户</TabsTrigger>
          <TabsTrigger value="categories">分类</TabsTrigger>
          <TabsTrigger value="tags">标签</TabsTrigger>
          <TabsTrigger value="budgets">预算</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-3 flex flex-col gap-3">
          <Button size="sm" onClick={openCreateAccount}>
            <Plus />
            新增账户
          </Button>
          {accounts.loading ? (
            <LoadingBlock />
          ) : (
            <div className="flex flex-col gap-2">
              {(accounts.data?.items ?? []).map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{account.name}</span>
                      {account.archived ? (
                        <Badge variant="secondary" className="text-[10px]">
                          已归档
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {ACCOUNT_TYPES.find((item) => item.value === account.type)?.label ??
                        account.type}
                    </p>
                  </div>
                  <span className="font-mono text-sm tabular-nums">
                    {renderBalance(account.id)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label="编辑账户"
                    onClick={() => openEditAccount(account)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label={account.archived ? "恢复账户" : "归档账户"}
                    onClick={() =>
                      void run(
                        () =>
                          api.patch(`/api/accounts/${account.id}`, {
                            archived: !account.archived,
                          }),
                        account.archived ? "账户已恢复" : "账户已归档",
                        () => {
                          accounts.reload();
                          balances.reload();
                        },
                      )
                    }
                  >
                    {account.archived ? <ArchiveRestore /> : <Archive />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label="删除账户"
                    onClick={() => {
                      if (!window.confirm(`确定删除账户「${account.name}」吗？`)) return;
                      void run(
                        () => api.delete(`/api/accounts/${account.id}`),
                        "账户已删除",
                        () => {
                          accounts.reload();
                          balances.reload();
                        },
                      );
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {(accounts.data?.items ?? []).length === 0 ? (
                <EmptyBlock title="还没有账户" description="新增一个账户，记账时即可归类" />
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="categories" className="mt-3 flex flex-col gap-3">
          <Button size="sm" onClick={openCreateCategory}>
            <Plus />
            新增分类
          </Button>
          {categories.loading ? (
            <LoadingBlock />
          ) : (
            <div className="flex flex-col gap-2">
              {(categories.data?.items ?? []).map((category) => (
                <div
                  key={category.id}
                  className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2"
                >
                  <CategoryIcon name={category.icon} color={category.color} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{category.name}</span>
                      {category.system ? (
                        <Badge variant="outline" className="text-[10px]">
                          内置
                        </Badge>
                      ) : null}
                      {category.archived ? (
                        <Badge variant="secondary" className="text-[10px]">
                          已归档
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {category.kind === "income" ? "收入" : "支出"}
                    </p>
                  </div>
                  {category.system ? null : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy}
                        aria-label="编辑分类"
                        onClick={() => openEditCategory(category)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy}
                        aria-label={category.archived ? "恢复分类" : "归档分类"}
                        onClick={() =>
                          void run(
                            () =>
                              api.patch(`/api/categories/${category.id}`, {
                                archived: !category.archived,
                              }),
                            category.archived ? "分类已恢复" : "分类已归档",
                            categories.reload,
                          )
                        }
                      >
                        {category.archived ? <ArchiveRestore /> : <Archive />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy}
                        aria-label="删除分类"
                        onClick={() => {
                          if (!window.confirm(`确定删除分类「${category.name}」吗？`)) return;
                          void run(
                            () => api.delete(`/api/categories/${category.id}`),
                            "分类已删除",
                            categories.reload,
                          );
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tags" className="mt-3 flex flex-col gap-3">
          <Button size="sm" onClick={openCreateTag}>
            <Plus />
            新增标签
          </Button>

          {tags.loading ? (
            <LoadingBlock />
          ) : (tags.data?.items ?? []).length === 0 ? (
            <EmptyBlock title="还没有标签" description="标签用于给账目加维度，例如「出差」「报销」" />
          ) : (
            <div className="flex flex-col gap-2">
              {(tags.data?.items ?? []).map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2"
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: tag.color }}
                    aria-hidden
                  />
                  <span className="flex-1 truncate text-sm">{tag.name}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label="编辑标签"
                    onClick={() => openEditTag(tag)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label="删除标签"
                    onClick={() => {
                      if (!window.confirm(`确定删除标签「${tag.name}」吗？`)) return;
                      void run(
                        () => api.delete(`/api/tags/${tag.id}`),
                        "标签已删除",
                        tags.reload,
                      );
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="budgets" className="mt-3 flex flex-col gap-3">
          <Button size="sm" onClick={openCreateBudget}>
            <Plus />
            设置预算
          </Button>
          {budgets.loading ? (
            <LoadingBlock />
          ) : (budgets.data?.items ?? []).length === 0 ? (
            <EmptyBlock
              title="还没有预算"
              description="为每月或每年的支出设定额度，首页会实时展示使用进度"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {(budgets.data?.items ?? []).map((budget) => (
                <div
                  key={budget.id}
                  className="flex flex-col gap-2 rounded-xl border border-border/60 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <CategoryIcon
                      name={budget.categoryIcon ?? "wallet"}
                      color={budget.categoryColor}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {budget.categoryName ?? "总预算"}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {budgetPeriodLabel(budget.period)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      aria-label="编辑预算"
                      onClick={() => openEditBudget(budget)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={busy}
                      aria-label="删除预算"
                      onClick={() =>
                        void run(
                          () => api.delete(`/api/budgets/${budget.id}`),
                          "预算已删除",
                          budgets.reload,
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <BudgetProgress percentage={budget.percentage} />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-mono tabular-nums">
                      {money(budget.spentCents)} / {money(budget.amountCents)}
                    </span>
                    <span
                      className={
                        budget.remainingCents < 0 ? "text-rose-600 dark:text-rose-400" : ""
                      }
                    >
                      {budget.remainingCents < 0
                        ? `超支 ${money(-budget.remainingCents)}`
                        : `剩余 ${money(budget.remainingCents)}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={accountDialog} onOpenChange={setAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAccountId ? "编辑账户" : "新增账户"}</DialogTitle>
            <DialogDescription>账户用于区分资金去向，余额 = 初始余额 + 收入 - 支出</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accountName">名称</Label>
              <Input
                id="accountName"
                maxLength={20}
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                placeholder="例如：招商银行"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>类型</Label>
              <Select value={accountType} onValueChange={setAccountType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accountBalance">初始余额</Label>
              <Input
                id="accountBalance"
                inputMode="decimal"
                value={accountBalance}
                onChange={(event) => setAccountBalance(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={busy || accountName.trim() === ""} onClick={handleSubmitAccount}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {editingAccountId ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialog} onOpenChange={setCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategoryId ? "编辑分类" : "新增分类"}</DialogTitle>
            <DialogDescription>
              {editingCategoryId
                ? "分类类型创建后不可更改；如需更换类型请新建一个分类"
                : "系统内置分类不可修改，自建分类可随时归档或删除"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="categoryName">名称</Label>
              <Input
                id="categoryName"
                maxLength={20}
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="例如：宠物"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>类型</Label>
              <Select
                value={categoryKind}
                onValueChange={setCategoryKind}
                disabled={editingCategoryId !== null}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">支出</SelectItem>
                  <SelectItem value="income">收入</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ColorPicker value={categoryColor} onChange={setCategoryColor} label="分类颜色" />
          </div>
          <DialogFooter>
            <Button disabled={busy || categoryName.trim() === ""} onClick={handleSubmitCategory}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {editingCategoryId ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tagDialog} onOpenChange={setTagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTagId ? "编辑标签" : "新增标签"}</DialogTitle>
            <DialogDescription>标签用于给账目加维度，例如「出差」「报销」</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tagName">名称</Label>
              <Input
                id="tagName"
                maxLength={12}
                value={tagName}
                onChange={(event) => setTagName(event.target.value)}
                placeholder="例如：出差"
              />
            </div>
            <ColorPicker value={tagColor} onChange={setTagColor} label="标签颜色" />
          </div>
          <DialogFooter>
            <Button disabled={busy || tagName.trim() === ""} onClick={handleSubmitTag}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {editingTagId ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={budgetDialog} onOpenChange={setBudgetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBudgetId ? "编辑预算" : "设置预算"}</DialogTitle>
            <DialogDescription>
              {editingBudgetId
                ? "仅可调整额度；如需更换周期或分类，请删除后重新设置"
                : "额度为该周期内的支出上限，首页会实时展示使用进度"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>范围</Label>
              <Select value={budgetScope} onValueChange={setBudgetScope} disabled={editingBudgetId !== null}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TOTAL_SCOPE}>总预算（全部支出）</SelectItem>
                  {expenseCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>周期</Label>
              <Select
                value={budgetPeriod}
                onValueChange={setBudgetPeriod}
                disabled={editingBudgetId !== null}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">每月</SelectItem>
                  <SelectItem value="yearly">每年</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="budgetAmount">额度</Label>
              <Input
                id="budgetAmount"
                inputMode="decimal"
                value={budgetAmount}
                onChange={(event) => setBudgetAmount(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={busy || budgetAmount.trim() === ""}
              onClick={handleSubmitBudget}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {editingBudgetId ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (color: string) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`选择颜色 ${color}`}
            onClick={() => onChange(color)}
            className={cn(
              "size-6 rounded-full border-2 transition-transform",
              value === color ? "border-foreground scale-110" : "border-transparent",
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}