# API 文档

所有接口都位于 `/api` 下，部署后由 Cloudflare Worker 处理（`@opennextjs/cloudflare`，Next.js **Node.js runtime**）。

## 通用约定

**响应信封**

```jsonc
// 成功
{ "data": { /* payload */ } }

// 失败
{ "error": { "code": "validation_failed", "message": "日期格式需为 YYYY-MM-DD", "details": null } }
```

**错误码**

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `bad_request` | 参数语义错误（如分类与账目类型不一致） |
| 401 | `unauthorized` | 未登录 / 会话失效 / 账号密码错误 |
| 403 | `forbidden` | 已登录但无权限，或账号被禁用 |
| 404 | `not_found` | 资源不存在（含软删除后的资源） |
| 409 | `conflict` | 唯一性冲突（管理员用户名、用户用户名、标签同名） |
| 422 | `validation_failed` | zod 校验失败，`details` 为字段级错误数组 |
| 429 | `too_many_requests` | 用户 / 管理员登录失败次数超限，账号被锁定 |
| 500 | `internal_error` | 服务内部错误 |
| 503 | `offline` | 仅由 Service Worker 在离线时返回 |

**鉴权**

- 用户端：`Cookie: ledger_session=...`，由 `requireUser` 校验。
- 管理端：`Cookie: ledger_admin_session=...`，由 `requireAdmin` 校验。
- 浏览器端同源请求需带 `credentials: "same-origin"`（`src/lib/api.ts` 已统一处理）。

**字段命名**：响应一律 camelCase；请求体中的金额可传字符串或数字，但必须是**最多两位小数的正数**（如 `"12.34"`），服务端统一转换为「分」。

---

## 1. 健康检查

### `GET /api/health`

无需鉴权。用于部署后验证 D1 绑定与环境变量。

```jsonc
{ "data": {
  "status": "ok",            // ok | degraded
  "database": "d1",
  "environment": "production",
  "wechatConfigured": true,
  "time": 1790503493000
} }
```

---

## 2. 用户端鉴权

### `GET /api/auth/me`

**始终返回 200**，未登录时 `user` 为 `null`。前端首屏据此同时拿到登录态与可用登录方式。

```jsonc
{ "data": {
  "user": {
    "id": "uuid",
    "nickname": "演示用户",
    "avatarUrl": null,
    "status": "active",
    "currency": "CNY",
    "timezone": "Asia/Shanghai",
    "lastLoginAt": 1790503493000,
    "createdAt": 1790400000000
  },
  "capabilities": { "wechat": false, "devLogin": true }
} }
```

> 注意：`UserDto` 白名单中**不包含** `openid` / `unionid` / `username`，这几个字段永不外泄。
>
> `capabilities` 只描述可选的第三方 / 开发入口；账号密码登录与自助注册**始终可用**，因此不设开关。

### `POST /api/auth/login`

普通用户的账号密码登录，成功即下发 `ledger_session`（有效期 30 天）。用户名不区分大小写。

```jsonc
// 请求
{ "username": "demo", "password": "demo1234" }

// 响应 200
{ "data": { "user": { /* UserDto */ } } }
```

安全策略与管理员登录一致（见 `src/server/auth/password.ts`）：

- 口令以 PBKDF2-SHA256 存储，迭代次数由 `USER_PBKDF2_ITERATIONS` 控制（默认 20_000）。
- 连续 5 次密码错误锁定 15 分钟，期间返回 429。
- 未注册用户名、纯微信账号、密码错误统一返回 401「用户名或密码不正确」，不暴露账号是否存在；失败原因仅写入审计日志。

### `POST /api/auth/register`

自助注册：用户名 + 密码，注册成功即签发会话，前端无需再走一次登录。

```jsonc
// 请求
{ "username": "demo", "password": "demo1234", "nickname": "演示用户" }   // nickname 可省略，默认与用户名相同

// 响应 201
{ "data": { "user": { /* UserDto */ } } }
```

| 字段 | 规则 |
| --- | --- |
| `username` | 3-20 位，仅限字母、数字、下划线、点、中划线；入库统一转小写，重复返回 409 |
| `password` | 至少 8 位，且需包含大写字母、小写字母、数字、符号中的至少两类 |
| `nickname` | 可选，1-20 字；省略时与用户名相同 |

新账号会自动初始化「现金 / 微信钱包 / 支付宝」三个默认资金账户。

### `GET /api/auth/wechat/authorize?next=/`

302 跳转到微信开放平台扫码页，并把签名后的 state 写入 HttpOnly Cookie `ledger_oauth_state`。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `next` | 否 | 登录成功后的回跳路径，默认 `/`；会被 `sanitizeNext` 过滤开放重定向 |

微信未配置时返回 400。

### `GET /api/auth/wechat/callback?code=&state=`

微信回调。**不使用 JSON 错误信封**：任何失败都以 302 回到 `/?auth_error=<中文提示>`，成功则以 302 跳到 `next` 并下发 `ledger_session`。

### `POST /api/auth/dev-login`

开发模式模拟登录。需同时满足 `AUTH_DEV_MODE=true` 与 `APP_ENV !== "production"`，否则 403。

```jsonc
// 请求
{ "nickname": "演示用户" }   // 1-20 字，默认「演示用户」

// 响应 200
{ "data": { "user": { /* UserDto */ } } }
```

`openid` 规则为 `dev:<昵称>`，同名即同一账本。

### `POST /api/auth/logout`

幂等：无论当前会话是否有效都返回成功并清空 Cookie。

```jsonc
{ "data": { "ok": true } }
```

---

## 3. 资金账户

### `GET /api/accounts`

| 参数 | 说明 |
| --- | --- |
| `includeArchived` | `1` / `true` 时包含已归档账户 |

```jsonc
{ "data": { "items": [ {
  "id": "uuid", "name": "现金", "type": "cash", "icon": "banknote",
  "initialBalanceCents": 0, "sortOrder": 10, "archived": false, "createdAt": 1790400000000
} ] } }
```

`type` 取值：`cash` | `bank` | `wechat` | `alipay` | `credit` | `other`。

### `POST /api/accounts`

```jsonc
{ "name": "招商银行", "type": "bank", "icon": "building-2", "initialBalance": "1000.00", "sortOrder": 0 }
```

返回 201 `{ "data": { "account": AccountDto } }`。

### `GET /api/accounts/:id`

返回 `{ "data": { "account": AccountDto } }`。

### `PATCH /api/accounts/:id`

同时承担编辑与归档/恢复：`{ "name"?, "type"?, "icon"?, "initialBalance"?, "sortOrder"?, "archived"? }`。

### `DELETE /api/accounts/:id`

语义为**归档**（等价于 `PATCH { archived: true }`），历史账目仍保留归属。

---

## 4. 分类

### `GET /api/categories`

| 参数 | 说明 |
| --- | --- |
| `kind` | `expense` 或 `income`；不传表示同时返回两类 |
| `includeArchived` | `1` / `true` 时包含已归档分类 |

返回 `{ "data": { "items": CategoryDto[] } }`。系统内置分类（`user_id IS NULL`）对所有用户可见，`system: true` 表示不可修改。

```jsonc
{ "id": "cat_sys_expense_food", "name": "餐饮", "kind": "expense",
  "icon": "utensils", "color": "#f97316", "sortOrder": 10,
  "system": true, "archived": false }
```

### `POST /api/categories`

```jsonc
{ "name": "宠物", "kind": "expense", "icon": "paw-print", "color": "#8b5cf6", "sortOrder": 0 }
```

`color` 必须是 `#RRGGBB`。返回 201 `{ "data": { "category": CategoryDto } }`。

### `PATCH /api/categories/:id`

同上字段均可选，另加 `archived`。**系统内置分类返回 404**，无法通过接口修改。

### `DELETE /api/categories/:id`

语义为归档。

---

## 5. 标签

### `GET /api/tags` → `{ "data": { "items": TagDto[] } }`

```jsonc
{ "id": "uuid", "name": "出差", "color": "#eab308" }
```

### `POST /api/tags`

`{ "name": "出差", "color": "#eab308" }`，名称最长 12 字；同名返回 409。

### `PATCH /api/tags/:id` → `{ "data": { "tag": TagDto } }`

### `DELETE /api/tags/:id`

**物理删除**，`transaction_tags` 中的关联由外键 `ON DELETE CASCADE` 清理。

---

## 6. 账目（用户端）

### `GET /api/transactions`

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `from` / `to` | 互相推导，默认最近 30 天 | `YYYY-MM-DD` |
| `kind` | — | `expense` / `income` / `transfer` |
| `categoryId` | — | 精确匹配 |
| `accountId` | — | 精确匹配**账户的两端**：命中 `accountId`（转出）或 `toAccountId`（转入）。转账对两端余额都有影响，只看转出会让流入该账户的转账消失 |
| `keyword` | — | 模糊匹配备注 / 分类名 / **金额**（按「元」保留两位小数后匹配，整数或小数都能命中），最长 50 字 |
| `sort` | `desc` | 排序键与方向：`desc` / `asc` 按业务日；`amount_desc` / `amount_asc` 按金额（统计页「账单列表」抽屉的「统计」按钮用）。按金额排时会再挂 `happened_at DESC, created_at DESC` 作为稳定键，否则金额相同的多行翻页会重复或漏出 |
| `page` | 1 | ≥ 1 |
| `pageSize` | 20 | 1 - 100 |

```jsonc
{ "data": {
  "items": [ {
    "id": "uuid", "kind": "expense", "amountCents": 3280, "currency": "CNY",
    "note": "和同事聚餐", "happenedAt": 1790503493000, "happenedOn": "2026-09-27",
    "categoryId": "cat_sys_expense_food", "categoryName": "餐饮",
    "categoryIcon": "utensils", "categoryColor": "#f97316",
    "accountId": "uuid", "accountName": "微信钱包", "accountType": "wechat",
    "toAccountId": null, "toAccountName": null,
    "tags": ["出差"], "createdAt": 1790503493000
  } ],
  "total": 24, "page": 1, "pageSize": 20, "totalPages": 2
} }
```

### `POST /api/transactions`

```jsonc
{
  "kind": "expense",          // 必填，expense | income | transfer
  "amount": "32.80",          // 必填，最多两位小数的正数
  "categoryId": "cat_sys_expense_food",  // 可选，kind 必须与分类的 kind 一致
  "accountId": "uuid",        // 可选（转账必填），转出账户，须属于当前用户且未归档
  "toAccountId": "uuid",      // 仅转账必填，转入账户，须与转出账户不同
  "note": "和同事聚餐",        // 可选，≤ 200 字
  "happenedOn": "2026-09-27", // 可选，默认今天（UTC+8）
  "tagIds": ["uuid"]          // 可选，≤ 10 个
}
```

转账是「转出账户 → 转入账户」的**单条记录**：`accountId` 为转出账户、`toAccountId` 为转入账户，
金额恒为正数，且不支持分类（传 `categoryId` 会返回 400）。

返回 201 `{ "data": { "transaction": TransactionDto } }`。

### `GET /api/transactions/:id` → `{ "data": { "transaction": TransactionDto } }`

### `PATCH /api/transactions/:id`

字段均可选；`categoryId` / `accountId` / `toAccountId` 可显式传 `null` 以清空关联。
在 `expense` / `income` / `transfer` 之间切换时会自动维护字段互斥：
转成转账会清空分类并校验转出/转入账户，转出转账会清空转入账户。

### `DELETE /api/transactions/:id`

**软删除**：写入 `deleted_at`，统计口径可追溯、误删可恢复。

### `GET /api/transactions/summary`

搜索账单页「搜索汇总」卡。**参数与 `GET /api/transactions` 完全一致**（只是不分页、不排序），
两者共用同一段 WHERE，因此 `total` 必然等于同条件下列表的 `total`。
账户明细页（`/assets/[id]`）同样复用它，以 `accountId` 取单账户的累计收支。

```jsonc
{ "data": {
  "from": "2026-09-01", "to": "2026-09-30",
  "total": 4,
  "expenseCents": 10000, "incomeCents": 40000, "netCents": 30000,
  "transferCents": 5000, "refundCents": 10000
} }
```

| 字段 | 说明 |
| --- | --- |
| `total` | 命中筛选条件的账目总数（**含转账与退款记录**），与列表一致 |
| `expenseCents` / `incomeCents` / `netCents` | 收支与结余，**不含转账** |
| `transferCents` | 转账金额合计，单独成项 |
| `refundCents` | 退款记录金额合计（即 `refund_of_id IS NOT NULL` 的收入记录）。退款恒为收入，带上 `kind` 过滤就永远统计不到，因此**该项忽略 `kind`**，只跟时间 / 分类 / 标签 / 账户 / 关键字有关 |
| `from` / `to` | 直接回显请求参数，未限定时为 `null` |

### `GET /api/transactions/range`

当前用户全部账目的最早 / 最晚业务日，自定义筛选页用它渲染「2025年~2026年」这枚由数据决定跨度的快捷项。

```jsonc
{ "data": { "firstDay": "2025-03-04", "lastDay": "2026-09-07" } }
```

没有任何账目时两天均为 `null`。软删除的账目不参与统计。

---

## 7. 统计（用户端）

### `GET /api/stats/summary?from=&to=&compare=`

```jsonc
{ "data": {
  "from": "2026-08-29", "to": "2026-09-27",
  "incomeCents": 1200000, "expenseCents": 456780, "netCents": 743220,
  "transactionCount": 24, "expenseCount": 20, "transferCount": 2, "transferCents": 50000,
  "averageExpenseCents": 22839, "dailyAverageCents": 15226,
  "previous": null
} }
```

| 字段 | 说明 |
| --- | --- |
| `transactionCount` | 区间内**收支**笔数（含收入，**不含转账**） |
| `expenseCount` | 区间内**支出**笔数 |
| `transferCount` | 区间内**转账**笔数，单独计数，不计入收支 |
| `transferCents` | 区间内**转账金额**合计，同样不并入收支，仅用于统计页「收支总览」展示 |
| `averageExpenseCents` | 单笔平均支出，分母是 `expenseCount` 而非 `transactionCount`，避免被收入笔数摊薄 |
| `dailyAverageCents` | 日均支出 = `expenseCents /` 区间覆盖的自然日数（含首尾），用于统计页「收支总览」 |
| `previous` | `compare=1` 时为上一**同长度**周期（`{ from, to, incomeCents, expenseCents, netCents }`），否则为 `null` |

`compare=1`（或 `true`）由服务端一次返回两期，前端不需要再发第二次请求。上期区间取本期起点前一天往前推同样天数，例如 `2026-09-01~2026-09-30` 的上期为 `2026-08-02~2026-08-31`。

### `GET /api/stats/trend?granularity=day|month&from=&to=`

`granularity=day`（默认）会**补齐区间内没有账目的日期**，前端可直接绘图：

```jsonc
{ "data": {
  "granularity": "day",
  "from": "2026-09-21", "to": "2026-09-27",
  "points": [ { "day": "2026-09-21", "incomeCents": 0, "expenseCents": 3280, "netCents": -3280 } ]
} }
```

`granularity=month` 时返回 `{ "granularity": "month", "points": [...] }`，`day` 字段实际承载 `YYYY-MM`。

### `GET /api/stats/by-category?kind=expense|income|all&dimension=category|tag&from=&to=&compare=`

```jsonc
{ "data": {
  "from": "...", "to": "...", "kind": "expense", "dimension": "category",
  "totalCents": 456780, "previousTotalCents": null,
  "items": [ {
    "id": "cat_sys_expense_food", "name": "餐饮", "icon": "utensils",
    "color": "#f97316", "amountCents": 32800, "transactionCount": 10, "percentage": 7.18,
    "previousAmountCents": null
  } ]
} }
```

| 参数 / 字段 | 说明 |
| --- | --- |
| `kind` | 默认 `expense`；`all` 表示**收支合并**口径（不加类型条件） |
| `dimension=tag` | 按标签聚合，标签行的 `icon` 固定为 `tag`，未打标签的 `name` 为「未打标签」 |
| `previousTotalCents` / `previousAmountCents` | `compare=1` 时给出上一同长度周期的合计与**各项**金额（上期没有该项时为 `0`）；未请求环比时均为 `null` |

未分类账目的 `id` 为 `null`，`name` 为「未分类」。

### `GET /api/stats/category?categoryId=&from=&to=&kind=expense|income&tagId=`

单个分类的详情指标（分类详情页用）。

```jsonc
{ "data": {
  "from": "2026-01-01", "to": "2026-12-31", "kind": "expense",
  "totalCents": 456780, "transactionCount": 24,
  "averagePerTransactionCents": 19032, "averagePerMonthCents": 38065, "monthCount": 12,
  "refundCents": 3200, "sharePercentage": 12.34
} }
```

| 参数 | 说明 |
| --- | --- |
| `tagId` | 可选。只看打了该标签的账目；**三处聚合（总额 / 退款 / 占比分母）一起收窄**，退款按来源支出的标签过滤（退款记录本身不继承标签）。分类详情页顶栏的筛选图标用它 |

| 字段 | 说明 |
| --- | --- |
| `averagePerTransactionCents` | `totalCents / transactionCount`（四舍五入，笔数为 0 时为 0） |
| `averagePerMonthCents` | `totalCents / monthCount`，`monthCount` 为区间覆盖的自然月数（含首尾） |
| `refundCents` | 区间内**退款记录**中，来源支出属于该分类的金额合计（退款本身是收入记录、不带分类，故需回查来源） |
| `sharePercentage` | 该分类金额占同期同类型总额的百分比；带 `tagId` 时分子分母都按该标签收窄 |

`categoryId` 必填，缺失时返回 400。

### `GET /api/stats/overview`

首页一次性拿到四块聚合数据（本月 / 今日 / 本月支出 Top5 / 预算用量）。

```jsonc
{ "data": {
  "month": SummaryResult,
  "today": SummaryResult,
  "topCategories": CategoryBreakdownItem[],   // 最多 5 条
  "budgets": BudgetView[]                     // 同 GET /api/budgets 的 items
} }
```

### `GET /api/stats/accounts?includeArchived=`

```jsonc
{ "data": { "items": [ {
  "id": "uuid", "name": "现金", "type": "cash", "icon": "banknote",
  "balanceCents": 123456, "transactionCount": 12
} ] } }
```

余额口径 = `initial_balance_cents` + 收入 − 支出。

---

## 8. 预算（用户端）

预算是一条**按自然月 / 自然年循环生效**的限额，不按周期存多行；当前周期的已用金额在查询时实时聚合，只统计 `kind = 'expense'` 且未软删除的账目。

`categoryId` 为 `null` 时表示**总预算**（该周期全部支出），否则为某个**支出分类**的预算。同一用户在同一周期下，同一范围（总预算或某分类）只允许一条，重复创建返回 409。

### `GET /api/budgets` → `{ "data": { "items": BudgetView[] } }`

总预算排在前面，其次按月 / 年与创建时间升序。

```jsonc
{ "id": "uuid",
  "categoryId": null,              // null 即总预算
  "categoryName": null, "categoryIcon": null, "categoryColor": null,
  "period": "monthly",             // monthly 自然月 | yearly 自然年
  "amountCents": 200000,
  "periodStart": "2026-09-01",     // 当前周期起（含）
  "periodEnd": "2026-09-15",       // 当前周期止，等于今天（UTC+8）
  "spentCents": 40000,
  "remainingCents": 160000,        // 超支时为负
  "percentage": 20                 // 已用百分比，超支可大于 100
}
```

### `POST /api/budgets`

```jsonc
{
  "categoryId": "cat_sys_expense_food",  // 可选，省略或 null = 总预算；分类必须属于当前用户且为支出分类
  "period": "monthly",                   // 可选，默认 monthly
  "amount": "2000.00"                    // 必填，最多两位小数的正数
}
```

返回 201 `{ "data": { "budget": BudgetConfigDto } }`。`BudgetConfigDto` 为 `BudgetView` 去掉用量字段（`periodStart` / `periodEnd` / `spentCents` / `remainingCents` / `percentage`）。

### `PATCH /api/budgets/:id`

**仅可调整额度**：`{ "amount": "3000.00" }`。如需改变周期或分类，请删除后重建。

### `DELETE /api/budgets/:id`

**物理删除**（预算无历史追溯需求）。删除后可重建同范围预算。

---

## 9. 管理端鉴权

> 以下接口全部需要 `ledger_admin_session`。用户端 Cookie 对后台完全无效。

### `POST /api/admin/auth/login`

```jsonc
// 请求
{ "username": "admin", "password": "********" }

// 响应 200
{ "data": {
  "admin": AdminDto,
  "expiresAt": 1790532293000,
  "mustChangePassword": true
} }
```

连续 5 次密码错误后账号锁定 15 分钟，期间后续尝试返回 429。账号不存在与密码错误返回同一文案，避免暴露用户名是否存在。

### `GET /api/admin/auth/me`

未登录返回 401；成功返回 `{ "data": { "admin": AdminDto } }`。

```jsonc
{ "id": "uuid", "username": "admin", "displayName": "系统管理员",
  "role": "super_admin", "status": "active", "mustChangePassword": true,
  "lockedUntil": null, "lastLoginAt": 1790503493000, "createdAt": 1790400000000 }
```

### `POST /api/admin/auth/logout`

幂等，清空后台 Cookie 并吊销会话。

---

## 10. 管理端监控

### `GET /api/admin/metrics/overview?days=7`

`days` 取值 1 - 90，默认 7。

```jsonc
{ "data": {
  "users": { "total": 12, "active": 11, "disabled": 1, "newInRange": 3, "activeInRange": 5 },
  "transactions": { "total": 240, "inRange": 36, "expenseCentsInRange": 456780, "incomeCentsInRange": 1200000 },
  "sessions": { "activeNow": 4 },
  "admins": { "total": 1 },
  "range": { "days": 7, "since": 1790400000000 }
} }
```

### `GET /api/admin/metrics/trend?days=14`

```jsonc
{ "data": {
  "days": 14,
  "points": [ { "day": "2026-09-14", "newUsers": 1, "transactions": 6, "amountCents": 32800 } ]
} }
```

`points` 按天补齐，长度恒等于 `days`。

---

## 11. 管理端治理

### `GET /api/admin/users?keyword=&status=&page=&pageSize=`

`keyword` 模糊匹配昵称 / openid / unionid；`status` 为 `active` 或 `disabled`。返回 `Paginated<UserDto>`。

### `GET /api/admin/users/:id`

```jsonc
{ "data": {
  "user": UserDto,
  "stats": {
    "transactionCount": 24, "totalExpenseCents": 456780,
    "totalIncomeCents": 1200000, "lastTransactionAt": 1790503493000
  }
} }
```

### `PATCH /api/admin/users/:id`

`{ "status": "active" | "disabled" }`。需要 `super_admin` 或 `admin` 角色（`auditor` 返回 403）。

禁用时会**立即吊销该用户的全部会话**并写入审计日志（`admin.user.disable`）。

### `GET /api/admin/transactions?userId=&kind=&from=&to=&keyword=&sort=&page=&pageSize=`

跨用户只读监控。`userId` 为空表示不限用户；响应中的账目会**额外携带** `userId` 与 `userNickname`。
过滤参数与用户端的 `GET /api/transactions` 完全一致（含 `keyword` 的金额匹配与 `sort`）。

### `GET /api/admin/audit-logs?action=&actorType=&page=&pageSize=`

`action` 为模糊匹配（如 `admin.user`），`actorType` 取 `user` | `admin` | `system`。

```jsonc
{ "data": { "items": [ {
  "id": "uuid", "actorType": "admin", "actorId": "uuid",
  "action": "admin.user.disable", "targetType": "user", "targetId": "uuid",
  "detail": { "status": "disabled" }, "ip": "1.2.3.4", "createdAt": 1790503493000
} ], "total": 6, "page": 1, "pageSize": 20, "totalPages": 1 } }
```

`detail` 由 JSON 文本解析而来；遇到历史脏数据时退化为 `{ "raw": "<原文>" }`，不会导致 500。

### `GET /api/admin/admins`

管理员列表，**不包含** `password_hash`。返回 `{ "data": { "items": AdminDto[] } }`。

### `POST /api/admin/admins`

**仅 `super_admin` 可调用。**

```jsonc
{ "username": "ops", "displayName": "运维", "password": "********", "role": "admin" }
```

口令至少 12 位且需包含大小写字母与数字；新账号 `mustChangePassword` 为 `true`。返回 201。

---

## 12. 前端调用示例

```ts
import { api, buildQuery, errorMessage, type Paginated, type TransactionDto } from "@/lib/api";

// 列表 + 筛选
const page = await api.get<Paginated<TransactionDto>>(
  `/api/transactions${buildQuery({ kind: "expense", page: 1, pageSize: 20 })}`,
);

// 写入
await api.post("/api/transactions", { kind: "expense", amount: "32.80", happenedOn: "2026-09-27" });

// 错误处理（ApiClientError 携带 status / code / message）
try {
  await api.delete(`/api/transactions/${id}`);
} catch (error) {
  console.error(errorMessage(error));
}
```