import { z } from "zod";
import { isValidDay } from "@/lib/dates";

/** 请求参数校验：所有外部输入在进入服务层之前必须先经过这里 */

export const daySchema = z
  .string()
  .refine((value) => isValidDay(value), { message: "日期格式需为 YYYY-MM-DD" });

export const transactionKindSchema = z.enum(["expense", "income", "transfer"], {
  message: "账目类型只能是 expense / income / transfer",
});

export const categoryKindSchema = z.enum(["expense", "income"], {
  message: "分类类型只能是 expense / income",
});

const optionalId = z
  .string()
  .trim()
  .min(1, "标识不能为空")
  .max(64, "标识长度超出限制")
  .optional()
  .nullable();

const optionalNote = z
  .string()
  .trim()
  .max(200, "备注不能超过 200 个字")
  .optional()
  .nullable();

export const amountSchema = z.union([z.string(), z.number()]);

export const createTransactionSchema = z.object({
  kind: transactionKindSchema,
  amount: amountSchema,
  categoryId: optionalId,
  accountId: optionalId,
  /** 转账的转入账户；仅 kind === 'transfer' 时有意义，跨字段不变式由服务层校验 */
  toAccountId: optionalId,
  note: optionalNote,
  happenedOn: daySchema.optional(),
  tagIds: z.array(z.string().trim().min(1)).max(10, "最多关联 10 个标签").optional(),
});

export const updateTransactionSchema = z.object({
  kind: transactionKindSchema.optional(),
  amount: amountSchema.optional(),
  categoryId: optionalId,
  accountId: optionalId,
  toAccountId: optionalId,
  note: optionalNote,
  happenedOn: daySchema.optional(),
  tagIds: z.array(z.string().trim().min(1)).max(10, "最多关联 10 个标签").optional(),
});

export const listTransactionsQuerySchema = z.object({
  from: daySchema.optional(),
  to: daySchema.optional(),
  kind: transactionKindSchema.optional(),
  categoryId: z.string().trim().min(1).optional(),
  accountId: z.string().trim().min(1).optional(),
  tagId: z.string().trim().min(1).optional(),
  keyword: z.string().trim().max(50, "搜索关键词过长").optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "请填写分类名称").max(20, "分类名称不能超过 20 个字"),
  kind: categoryKindSchema,
  icon: z.string().trim().min(1).max(40).default("tag"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "颜色需为 #RRGGBB 格式")
    .default("#64748b"),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, "请填写账户名称").max(20, "账户名称不能超过 20 个字"),
  type: z.enum(["cash", "bank", "wechat", "alipay", "credit", "other"]).default("cash"),
  icon: z.string().trim().min(1).max(40).default("wallet"),
  initialBalance: amountSchema.optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const updateAccountSchema = createAccountSchema.partial();

export const createTagSchema = z.object({
  name: z.string().trim().min(1, "请填写标签名称").max(12, "标签名称不能超过 12 个字"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "颜色需为 #RRGGBB 格式")
    .default("#64748b"),
});

export const updateTagSchema = createTagSchema.partial();

/** 归档与恢复通过 PATCH 携带布尔标记完成，不做物理删除 */
export const patchAccountSchema = updateAccountSchema.extend({
  archived: z.boolean().optional(),
});

export const patchCategorySchema = updateCategorySchema.extend({
  archived: z.boolean().optional(),
});

/** 预算周期：monthly 自然月 / yearly 自然年 */
export const budgetPeriodSchema = z.enum(["monthly", "yearly"], {
  message: "预算周期只能是 monthly / yearly",
});

/** categoryId 省略或为 null 表示「总预算」，否则为某个支出分类的预算 */
export const createBudgetSchema = z.object({
  categoryId: optionalId,
  period: budgetPeriodSchema.default("monthly"),
  amount: amountSchema,
});

/** 编辑预算只调整限额；如需改变范围（周期 / 分类）请删除后重建 */
export const updateBudgetSchema = z.object({
  amount: amountSchema,
});

/** 只关心时间区间的查询（概览、余额等不需要 kind） */
export const rangeQuerySchema = z.object({
  from: daySchema.optional(),
  to: daySchema.optional(),
  categoryId: z.string().trim().min(1).optional(),
  tagId: z.string().trim().min(1).optional(),
});

/** 分类列表：不传 kind 表示同时返回支出与收入分类 */
export const categoryListQuerySchema = z.object({
  kind: categoryKindSchema.optional(),
});

/** 统计维度上的数据类型：all 表示收支合并口径 */
export const statsKindSchema = z.enum(["expense", "income", "all"], {
  message: "统计类型只能是 expense / income / all",
});

export const statsQuerySchema = z.object({
  from: daySchema.optional(),
  to: daySchema.optional(),
  kind: statsKindSchema.default("expense"),
  /** 统计维度：按分类聚合或按标签聚合 */
  dimension: z.enum(["category", "tag"]).default("category"),
  categoryId: z.string().trim().min(1).optional(),
  tagId: z.string().trim().min(1).optional(),
});

/** 分类详情：必须指定分类，时间区间默认最近 30 天 */
export const categoryDetailQuerySchema = z.object({
  categoryId: z.string().trim().min(1, "缺少分类标识").max(64, "标识长度超出限制"),
  from: daySchema.optional(),
  to: daySchema.optional(),
  kind: categoryKindSchema.default("expense"),
});

export const trendQuerySchema = z.object({
  from: daySchema.optional(),
  to: daySchema.optional(),
  granularity: z.enum(["day", "month"]).default("day"),
  categoryId: z.string().trim().min(1).optional(),
  tagId: z.string().trim().min(1).optional(),
});

export const adminLoginSchema = z.object({
  username: z.string().trim().min(3, "用户名至少 3 个字符").max(50, "用户名过长"),
  password: z.string().min(1, "请输入密码").max(128, "密码过长"),
});

export const adminCreateAdminSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "用户名至少 3 个字符")
    .max(50, "用户名过长")
    .regex(/^[a-zA-Z0-9_.-]+$/, "用户名只能包含字母、数字、下划线、点与中划线"),
  displayName: z.string().trim().min(1, "请填写显示名称").max(30, "显示名称过长"),
  password: z.string().min(12, "管理员密码至少 12 位").max(128, "密码过长"),
  role: z.enum(["super_admin", "admin", "auditor"]).default("admin"),
});

export const adminUserListQuerySchema = z.object({
  keyword: z.string().trim().max(50).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminTransactionListQuerySchema = listTransactionsQuerySchema.extend({
  userId: z.string().trim().min(1).optional(),
});

export const adminAuditLogQuerySchema = z.object({
  action: z.string().trim().max(60).optional(),
  actorType: z.enum(["user", "admin", "system"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminUpdateUserStatusSchema = z.object({
  status: z.enum(["active", "disabled"], { message: "状态只能是 active 或 disabled" }),
});

/** 后台监控指标的时间窗口，最长 90 天以控制聚合查询开销 */
export const adminMetricsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

export const devLoginSchema = z.object({
  nickname: z.string().trim().min(1, "请输入昵称").max(20, "昵称不能超过 20 个字").default("演示用户"),
});

/** 用户端账号密码登录：与管理员登录同样宽松，只做长度兜底，强度交给服务层 */
export const userLoginSchema = z.object({
  username: z.string().trim().min(3, "用户名至少 3 个字符").max(50, "用户名过长"),
  password: z.string().min(1, "请输入密码").max(128, "密码过长"),
});

/** 用户端自助注册：用户名入库前会被归一为小写 */
export const userRegisterSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "用户名至少 3 个字符")
    .max(20, "用户名不能超过 20 个字符")
    .regex(/^[a-zA-Z0-9_.-]+$/, "用户名只能包含字母、数字、下划线、点与中划线"),
  password: z.string().min(8, "密码长度至少 8 位").max(128, "密码过长"),
  nickname: z.string().trim().min(1, "昵称不能为空").max(20, "昵称不能超过 20 个字").optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;