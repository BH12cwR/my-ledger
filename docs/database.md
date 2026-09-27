# 数据库模型

数据层使用 **Cloudflare D1**（SQLite）。所有 schema 变更以 SQL 迁移文件的形式落在
[migrations/](../migrations)，通过 wrangler 的 `d1 migrations` 命令顺序执行，保证变更可追溯。

配套阅读：[架构设计](./architecture.md) · [API 文档](./api.md) · [部署指南](./deployment.md)

## 1. 全局约定

| 约定 | 取值 | 理由 |
| --- | --- | --- |
| 主键 | `TEXT`（UUID v4） | 端上可预生成、便于后续分库/合并；内置分类用可读稳定 id |
| 金额 | `INTEGER`，单位为**分**（`*_cents`） | 彻底规避浮点误差；接口层同样传「分」 |
| 时间戳 | `INTEGER`，Unix **毫秒** | 与 JS `Date.now()` 同口径，无时区歧义 |
| 业务日 | `TEXT`，`YYYY-MM-DD` | 按自然日聚合时直接命中索引，无需在 SQL 里做时区换算 |
| 软删除 | `deleted_at` / `archived_at` 为 `NULL` 表示有效 | 账目删除后可审计；账户/分类归档后可恢复 |
| 业务时区 | 固定 **UTC+8**（`APP_TIMEZONE_OFFSET_MINUTES = 480`） | 由 `src/lib/dates.ts` 统一换算，不依赖运行环境的 TZ |
| 时间精度 | 毫秒（`happened_at`）与业务日（`happened_on`）**冗余存储** | `happened_at` 用于排序与精确时刻，`happened_on` 用于分组聚合 |

所有查询都走 **D1 prepared statement + 参数绑定**（`db.prepare(sql).bind(...)`），
不存在字符串拼接用户输入。占位符由 [common.ts](../src/server/services/common.ts) 的
`allRows` / `placeholders` 等工具统一处理（D1 不支持绑定数组，`IN (?)` 必须展开为等长占位符列表）。

## 2. 表总览

```
users ──┬── accounts ──┐
        │              ├── transactions ──── transaction_tags ──── tags
        ├── categories ┘         │                               │
        │                        └── (transfer_peer_id 自关联)    │
        ├── tags ───────────────────────────────────────────────┘
        └── sessions (principal_type = 'user')

admin_users ──── sessions (principal_type = 'admin')

audit_logs（user / admin / system 三类主体共用）
```

| 表 | 用途 | 记录类型定义 |
| --- | --- | --- |
| `users` | 普通用户（微信） | [`UserRecord`](../src/server/db/types.ts) |
| `admin_users` | 后台管理员（独立体系） | [`AdminRecord`](../src/server/db/types.ts) |
| `sessions` | 用户端/后台共用会话表 | — |
| `accounts` | 资金账户 | [`AccountRecord`](../src/server/db/types.ts) |
| `categories` | 分类（系统内置 + 用户自定义） | [`CategoryRecord`](../src/server/db/types.ts) |
| `tags` | 标签 | [`TagRecord`](../src/server/db/types.ts) |
| `transactions` | 账目记录 | [`TransactionRecord`](../src/server/db/types.ts) |
| `transaction_tags` | 账目 ↔ 标签 多对多 | — |
| `audit_logs` | 审计日志（后台监控数据源） | [`AuditLogRecord`](../src/server/db/types.ts) |

## 3. 逐表说明

### 3.1 `users` —— 普通用户

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | UUID |
| `openid` | TEXT | 唯一（部分索引） | 微信应用内唯一标识；开发模拟登录写 `dev:<昵称>` |
| `unionid` | TEXT | 唯一（部分索引） | 微信开放平台唯一标识，公众号/小程序互通时才有 |
| `nickname` | TEXT | NOT NULL，默认 `记账用户` | |
| `avatar_url` | TEXT | | |
| `status` | TEXT | `CHECK IN ('active','disabled')` | 被禁用后 `requireUser` 一律拒绝 |
| `currency` | TEXT | 默认 `CNY` | |
| `timezone` | TEXT | 默认 `Asia/Shanghai` | 展示用；统计口径固定 UTC+8 |
| `last_login_at` | INTEGER | | Unix 毫秒 |
| `created_at` / `updated_at` | INTEGER | NOT NULL | Unix 毫秒 |

索引：

- `idx_users_openid` —— `UNIQUE (openid) WHERE openid IS NOT NULL`（部分唯一索引，允许多行 `NULL`）
- `idx_users_unionid` —— 同上
- `idx_users_created_at` —— `(created_at DESC)`，后台「新增用户」趋势用

> `openid` / `unionid` 用**部分唯一索引**而非列级 `UNIQUE`：SQLite 中多行 `NULL` 不算冲突，
> 但显式写成部分索引可以表达「仅在非空时唯一」的意图，并且索引体积更小。

### 3.2 `admin_users` —— 管理员

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | UUID |
| `username` | TEXT | NOT NULL，唯一 | 3-50 位字母/数字/`_`/`.`/`-` |
| `display_name` | TEXT | NOT NULL | |
| `password_hash` | TEXT | NOT NULL | `pbkdf2$sha256$<iterations>$<saltB64>$<hashB64>` |
| `role` | TEXT | `CHECK IN ('super_admin','admin','auditor')` | 见下方权限表 |
| `status` | TEXT | `CHECK IN ('active','disabled')` | |
| `failed_attempts` | INTEGER | 默认 0 | 连续失败计数 |
| `locked_until` | INTEGER | | 锁定截止时间；`NULL` 或已过期则不算锁定 |
| `must_change_password` | INTEGER | 默认 0（布尔） | 引导脚本创建后置 1，前端强提示 |
| `last_login_at` | INTEGER | | |
| `created_at` / `updated_at` | INTEGER | NOT NULL | |

角色权限：

| 角色 | 可读后台 | 治理用户/账目 | 新建/停用管理员 |
| --- | --- | --- | --- |
| `super_admin` | ✅ | ✅ | ✅ |
| `admin` | ✅ | ✅ | ❌ |
| `auditor` | ✅ | ❌（只读） | ❌ |

索引：`idx_admin_users_username` —— `UNIQUE (username)`。

口令策略（与 [create-admin.mjs](../scripts/create-admin.mjs) 及 `src/server/auth/password.ts` 保持一致）：

- 哈希：**PBKDF2-SHA256**，salt 16 字节，输出 32 字节。
- 迭代次数：默认 `20_000`，可用环境变量 `ADMIN_PBKDF2_ITERATIONS` 覆盖（Workers Paid 可上调）。
- 强度：长度 12-128，且需覆盖大写/小写/数字/符号中的**至少三类**。
- 防暴力破解：连续失败 `MAX_FAILED_ATTEMPTS = 5` 次锁定 `LOCK_DURATION_MS = 15 分钟`
  （见 [admin.ts](../src/server/services/admin.ts)），锁定状态由 `failed_attempts` + `locked_until` 表达。

### 3.3 `sessions` —— 会话

用户端与后台**共用一张表**，用 `principal_type` 区分。这样撤销会话、统计在线、写审计都能走同一套代码。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | 会话 id，也是 JWT 的 `jti` |
| `principal_type` | TEXT | `CHECK IN ('user','admin')` | |
| `principal_id` | TEXT | NOT NULL | 指向 `users.id` 或 `admin_users.id` |
| `expires_at` | INTEGER | NOT NULL | |
| `revoked_at` | INTEGER | | 登出/强制下线时写入 |
| `user_agent` / `ip` | TEXT | | 写入时截断，仅用于审计展示 |
| `created_at` / `last_seen_at` | INTEGER | NOT NULL | |

索引：`idx_sessions_principal`（按主体查活跃会话）、`idx_sessions_expires_at`（清理/在线统计）。

> 会话校验是「JWT 签名 + 数据库行状态」双重校验：JWT 负责无状态快速验签，
> 数据库行负责「能被真正撤销」（`revoked_at IS NULL AND expires_at > now`）。
> 两套体系使用**不同的签名密钥**（`AUTH_JWT_SECRET` / `ADMIN_JWT_SECRET`），
> 因此用户端 token 无法提升为管理员 token。

### 3.4 `accounts` —— 资金账户

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | |
| `user_id` | TEXT | NOT NULL，`REFERENCES users(id) ON DELETE CASCADE` | 多租户隔离键 |
| `name` | TEXT | NOT NULL | |
| `type` | TEXT | `CHECK IN ('cash','bank','wechat','alipay','credit','other')` | 默认 `cash` |
| `icon` | TEXT | 默认 `wallet` | lucide 图标名，前端经 `ICON_MAP` 白名单解析 |
| `initial_balance_cents` | INTEGER | 默认 0 | 期初余额（分） |
| `sort_order` | INTEGER | 默认 0 | |
| `archived_at` | INTEGER | | 归档时间；归档后不计入默认列表 |
| `created_at` / `updated_at` | INTEGER | NOT NULL | |

索引：`idx_accounts_user` —— `(user_id, sort_order)`。

账户**当前余额**不落库，由 `initial_balance_cents` 加上该账户下所有未删除账目的收支净额实时计算
（`src/server/services/stats.ts` 的 `AccountBalanceItem`）。

### 3.5 `categories` —— 分类

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | 系统内置用 `cat_sys_*` 稳定 id |
| `user_id` | TEXT | `REFERENCES users(id) ON DELETE CASCADE`，**可为 NULL** | `NULL` = 系统内置，所有用户可见 |
| `name` | TEXT | NOT NULL | |
| `kind` | TEXT | `CHECK IN ('expense','income')` | 分类不分「转账」 |
| `icon` / `color` | TEXT | 默认 `tag` / `#64748b` | |
| `sort_order` | INTEGER | 默认 0 | |
| `archived_at` | INTEGER | | |
| `created_at` / `updated_at` | INTEGER | NOT NULL | |

索引：`idx_categories_scope` —— `(user_id, kind, sort_order)`。

可见性规则（见 `listCategories`）：查询条件为 `user_id IS NULL OR user_id = ?`，
即「内置 + 自己的自定义」。内置分类不可改不可删，用户可另建同名自定义分类。

内置分类共 **19 条**（12 支出 + 7 收入），由 [0002_system_categories.sql](../migrations/0002_system_categories.sql) 写入：

| kind | 名称（icon / color） |
| --- | --- |
| expense | 餐饮 `utensils/#f97316`、交通 `bus/#0ea5e9`、购物 `shopping-bag/#ec4899`、居住 `house/#8b5cf6`、通讯 `smartphone/#14b8a6`、娱乐 `gamepad-2/#f43f5e`、医疗 `heart-pulse/#ef4444`、教育 `graduation-cap/#6366f1`、人情往来 `gift/#d946ef`、旅行 `plane/#22c55e`、宠物 `paw-print/#a16207`、其他支出 `circle-ellipsis/#64748b` |
| income | 工资 `briefcase/#22c55e`、奖金 `trophy/#eab308`、兼职 `hammer/#0ea5e9`、投资收益 `trending-up/#f97316`、红包 `gift/#ef4444`、退款 `rotate-ccw/#14b8a6`、其他收入 `circle-ellipsis/#64748b` |

### 3.6 `tags` —— 标签

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | |
| `user_id` | TEXT | NOT NULL，`REFERENCES users(id) ON DELETE CASCADE` | 标签是纯用户私有数据 |
| `name` | TEXT | NOT NULL | |
| `color` | TEXT | 默认 `#64748b` | |
| `created_at` / `updated_at` | INTEGER | NOT NULL | |

索引：`idx_tags_user_name` —— `UNIQUE (user_id, name)`，同一用户下标签名唯一（跨用户可重名）。

### 3.7 `transactions` —— 账目记录

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | |
| `user_id` | TEXT | NOT NULL，`REFERENCES users(id) ON DELETE CASCADE` | |
| `account_id` | TEXT | `REFERENCES accounts(id) ON DELETE SET NULL` | 账户删除后账目保留 |
| `category_id` | TEXT | `REFERENCES categories(id) ON DELETE SET NULL` | 分类删除后账目保留 |
| `kind` | TEXT | `CHECK IN ('expense','income','transfer')` | 转账为后续能力预留，当前 API 只开放前者 |
| `amount_cents` | INTEGER | NOT NULL，`CHECK (amount_cents > 0)` | **恒为正数**，方向由 `kind` 决定 |
| `currency` | TEXT | 默认 `CNY` | |
| `note` | TEXT | | |
| `happened_at` | INTEGER | NOT NULL | 精确时刻（毫秒） |
| `happened_on` | TEXT | NOT NULL | 业务日 `YYYY-MM-DD`（UTC+8） |
| `transfer_peer_id` | TEXT | | 转账对手方账目 id（预留自关联） |
| `created_at` / `updated_at` | INTEGER | NOT NULL | |
| `deleted_at` | INTEGER | | **软删除**；所有业务查询都带 `deleted_at IS NULL` |

索引（全部为**部分索引**，只覆盖未删除行，兼顾查询与写入成本）：

| 索引 | 列 | 服务的查询 |
| --- | --- | --- |
| `idx_transactions_user_time` | `(user_id, happened_at DESC) WHERE deleted_at IS NULL` | 明细列表按时间倒序分页 |
| `idx_transactions_user_day` | `(user_id, happened_on) WHERE deleted_at IS NULL` | 按日趋势 / 今日汇总 |
| `idx_transactions_user_category` | `(user_id, category_id, happened_on) WHERE deleted_at IS NULL` | 分类结构占比 |
| `idx_transactions_user_account` | `(user_id, account_id) WHERE deleted_at IS NULL` | 账户余额汇总 |

`amount_cents > 0` 与 `kind` 分离的设计让「求和」逻辑统一：
收入求和直接 `SUM`，支出求和也直接 `SUM`，方向只在展示与净值计算时按 `kind` 区分。

### 3.8 `transaction_tags` —— 账目标签关联

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `transaction_id` | TEXT | `REFERENCES transactions(id) ON DELETE CASCADE`，联合主键 |
| `tag_id` | TEXT | `REFERENCES tags(id) ON DELETE CASCADE`，联合主键 |

索引：`idx_transaction_tags_tag` —— `(tag_id)`，用于反查某标签下的账目。

> **租户隔离注意**：关联表本身没有 `user_id`。写关联前，服务层必须先校验
> 「该 tag 属于当前用户」，否则会形成跨用户引用（见 `src/server/services/transactions.ts`）。

### 3.9 `audit_logs` —— 审计日志

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | TEXT | PK | |
| `actor_type` | TEXT | `CHECK IN ('user','admin','system')` | 系统自动行为用 `system` |
| `actor_id` | TEXT | | `system` 行为为 `NULL` |
| `action` | TEXT | NOT NULL | 点分命名，如 `user.login.wechat`、`admin.login.failed` |
| `target_type` / `target_id` | TEXT | | 被操作对象 |
| `detail` | TEXT | | 序列化后的 JSON 字符串 |
| `ip` / `user_agent` | TEXT | | |
| `created_at` | INTEGER | NOT NULL | |

索引：`idx_audit_logs_created_at`（时间倒序全量列表）、`idx_audit_logs_actor`（按主体回溯）、
`idx_audit_logs_action`（按动作类型筛选）。

这是管理后台「审计日志」页与部分概览指标的**唯一数据来源**。

## 4. 迁移方案

迁移文件位于 `migrations/`，按文件名前缀**数字顺序**执行；wrangler 会在 `d1_migrations` 表中记录
已应用的迁移，重复执行只跑增量。

| 文件 | 内容 |
| --- | --- |
| [0001_init.sql](../migrations/0001_init.sql) | 9 张表 + 全部索引 |
| [0002_system_categories.sql](../migrations/0002_system_categories.sql) | 19 条内置分类参照数据 |

`wrangler.toml` 中通过 `migrations_dir = "migrations"` 声明目录：

```toml
[[d1_databases]]
binding = "DB"
database_name = "my-ledger-db"
database_id = "<wrangler d1 create 输出的 ID>"
migrations_dir = "migrations"
```

命令（等价于 `wrangler d1 migrations apply my-ledger-db [--local|--remote]`）：

```bash
npm run db:migrate:local    # 应用到本地 .wrangler/state/v3/d1 副本
npm run db:migrate:remote   # 应用到线上 D1
```

### 新增迁移的约定

1. 文件名遵循 `NNNN_描述.sql`（四位递增，如 `0003_add_budgets.sql`）。
2. **只追加，不修改已应用的迁移**——线上库已经执行过，改动不会生效，只会造成环境间 schema 漂移。
3. SQLite 的 `ALTER TABLE` 能力有限（不能删列/改类型/加带约束的列），复杂变更走
   「建新表 → `INSERT INTO ... SELECT` → 删旧表 → 重命名」四步，并注意此时需要临时关闭外键校验
   （D1 的 `PRAGMA foreign_keys` 行为请在迁移中显式声明）。
4. D1 的 `d1 migrations apply` **不包事务**（SQLite 部分 DDL 不可回滚），因此单个迁移文件应尽量小且幂等，
   失败后便于人工修复后续跑。
5. 新增表/索引时同步更新 `src/server/db/types.ts` 的记录类型与本文档。

## 5. 演示数据

[seeds/dev_seed.sql](../seeds/dev_seed.sql) 提供本地开发演示数据：

```bash
npm run db:seed:local
```

设计要点：

- 全部使用**固定主键 + `INSERT OR IGNORE`**，可重复执行不产生重复数据。
- 演示用户 `id = user_demo_0001`，`openid = dev:演示用户`——与 `/api/auth/dev-login` 的账号规则一致，
  因此本地用昵称「演示用户」登录会**直接复用这份数据**。
- 4 个账户、2 个标签、24 笔账目（最近 30 天内相对生成，随时执行都能落进统计区间）。
- 2 条审计日志样例，供后台审计页展示。
- 金额单位统一为「分」，与线上口径完全一致。

> Seed 只用于本地。**线上不要执行** `db:seed:local` 之外的同名远端命令；
> 生产首个管理员请用 `node scripts/create-admin.mjs --remote` 单独引导。

## 6. 数据一致性要点

| 风险 | 处理方式 |
| --- | --- |
| 并发写同一账目 | 更新/删除语句带 `WHERE id = ? AND user_id = ? AND deleted_at IS NULL`，用影响行数判定是否成功 |
| 跨租户越权 | 所有用户端查询强制 `user_id = ?`；标签关联写入前校验归属 |
| 账户/分类被删除 | 外键 `ON DELETE SET NULL`，账目保留但丢失关联，前端显示「未分类/未指定」 |
| 用户注销 | `ON DELETE CASCADE` 级联清理账户、分类、标签、账目、会话 |
| D1 无长事务 | 多步写操作使用 `batch()` 提交（原子批次），避免「删旧关联成功、写新关联失败」的中间态 |
| 金额精度 | 全链路整数分；只在 UI 展示与输入解析处转换为十进制字符串（`src/lib/money.ts`） |