# 架构设计

## 1. 目标与边界

「账本」是一个部署在 Cloudflare Pages 上的双端记账应用：

- **用户端**：`/`、`/transactions`、`/stats`、`/settings` —— 移动优先的记账 PWA。
- **管理后台**：`/admin/**` —— 平台级监控、用户治理与审计日志。

核心约束（来自需求）：

1. 前后端分离，**浏览器端永不直接连接数据库**，所有读写都经过 Next API Routes（部署后即 Worker 中的路由处理器）。
2. 使用 **@opennextjs/cloudflare** 部署到 **Cloudflare Workers**（静态资源走 assets 绑定），数据落在 **D1 SQLite**。
3. **PWA 只在用户端启用**，后台不注册 Service Worker。
4. 两套**互相独立**的鉴权体系：普通用户（微信登录）与管理员（账号口令）。

## 2. 运行时拓扑

```
浏览器（用户端 PWA / 后台 SPA）
        │  fetch，credentials: same-origin
        ▼
Cloudflare Workers（静态资源 assets 绑定 + worker.js）
        │  Next.js App Router（Node.js runtime）
        ├── 页面：静态预渲染的客户端组件（○ Static）
        └── /api/**：服务端路由处理器（ƒ Dynamic）
                │  requireUser / requireAdmin
                ▼
        服务层 src/server/services/**
                │  参数化 SQL，金额以「分」为单位
                ▼
        D1 SQLite（binding: DB）
```

关键点：

- **API 路由不要声明 `export const runtime = "edge"`**。`@opennextjs/cloudflare` 以 Next.js 的 **Node.js runtime** 运行，Edge runtime 不被它支持（迁移时已从全部 29 个路由中移除该声明）。
- **页面全部是客户端组件**，服务端只负责产出静态 HTML。这样既保持了静态优先的构建产物，也避免了「构建期把业务日期固化进 HTML」的问题（受保护页面的真实内容只在会话就绪后才渲染，见 §5）。
- **不使用 `useSearchParams()`**。它会让页面退化为动态渲染，与上述策略冲突；需要读查询串的地方统一在 `useEffect` 中读 `window.location.search`。

## 3. 目录结构

```
src/
├── app/
│   ├── layout.tsx                 # 根布局：字体、metadata、Toaster
│   ├── login/page.tsx             # 用户端登录（微信扫码 + 开发模式模拟登录）
│   ├── offline/page.tsx           # PWA 离线兜底页
│   ├── (app)/                     # route group，不影响 URL
│   │   ├── layout.tsx             # SessionProvider + AppShell（登录守卫）
│   │   ├── page.tsx               # 首页概览
│   │   ├── transactions/          # 明细列表 / 记一笔（含编辑）
│   │   ├── stats/page.tsx         # Recharts 趋势与结构图
│   │   └── settings/page.tsx      # 账户 / 分类 / 标签 / 登出
│   ├── admin/
│   │   ├── layout.tsx             # 后台根布局（刻意保持最简，不引入 PWA）
│   │   ├── login/page.tsx         # 管理员登录
│   │   └── (dashboard)/           # 受保护区域：AdminSessionProvider + AdminShell
│   │       ├── page.tsx           # 平台概览
│   │       ├── users/             # 用户治理
│   │       ├── transactions/      # 跨用户账目监控（只读）
│   │       ├── audit-logs/        # 审计日志
│   │       └── admins/            # 管理员账号
│   ├── api/                       # 全部服务端路由处理器（Node.js runtime）
│   └── sw.ts                      # 用户端 Service Worker 源码（Serwist 构建入口）
├── components/
│   ├── ui/                        # shadcn/ui 组件
│   ├── layout/                    # AppShell / BottomNav / AdminShell / 状态块
│   ├── providers/                 # SessionProvider / AdminSessionProvider
│   └── *.tsx                      # TransactionRow / CategoryIcon 等共享展示件
├── lib/                           # 前端与共享工具（api 客户端、格式化、金额、日期）
└── server/
    ├── db/            # Db/Env 类型、绑定读取（getDb / getBindings）
    ├── http/          # 错误、响应信封、Cookie、查询解析、序列化白名单
    ├── auth/          # 会话、口令、JWT、守卫、微信 OAuth、OAuth state
    ├── services/      # 业务逻辑（transactions / stats / accounts / ...）
    └── validation/    # zod schema（外部输入的唯一入口）
```

## 4. 请求处理流水线

每个 API 路由都遵循同一套骨架：

```ts
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();                       // { db, env }
    const auth = await requireUser(request, deps);    // 鉴权边界
    const query = parseQuery(request, someSchema);    // zod 校验
    const result = await someService(deps.db, auth.principalId, query);
    return jsonOk(someDto(result));                   // 白名单序列化
  });
}
```

四道防线：

| 防线 | 位置 | 作用 |
| --- | --- | --- |
| 鉴权 | `src/server/auth/guard.ts` | `requireUser` / `requireAdmin({ roles })`，校验 Cookie → JWT → `sessions` 表 |
| 校验 | `src/server/validation/schemas.ts` | 所有外部输入先过 zod，失败由 `handleRoute` 转成 422 |
| 数据隔离 | 服务层 | 除管理端跨用户查询外，所有 SQL 强制带 `user_id = ?` |
| 输出白名单 | `src/server/http/serialize.ts` | DTO 只登记可对外字段，杜绝 `password_hash` / `openid` 泄露 |

响应信封统一为：

```jsonc
// 成功
{ "data": { /* payload */ } }
// 失败
{ "error": { "code": "unauthorized", "message": "请先登录后再操作", "details": null } }
```

`code` 取值：`bad_request`(400)、`unauthorized`(401)、`forbidden`(403)、`not_found`(404)、`conflict`(409)、`validation_failed`(422)、`too_many_requests`(429)、`internal_error`(500)。

## 5. 鉴权体系

两套体系共用 `sessions` 表（按 `principal_type` 区分），但其余部分完全隔离：

| | 用户端 | 管理后台 |
| --- | --- | --- |
| Cookie 名 | `ledger_session` | `ledger_admin_session` |
| 登录凭据 | 微信 OAuth（`openid` / `unionid`） | `admin_users` 表的用户名 + 口令 |
| 签名密钥 | `AUTH_JWT_SECRET` | `ADMIN_JWT_SECRET`（必须不同） |
| 会话 TTL | 30 天 | 8 小时 |
| 守卫 | `requireUser` | `requireAdmin`（可限定角色） |
| 引导接口 | `GET /api/auth/me`（**始终 200**，未登录返回 `user: null`） | `GET /api/admin/auth/me`（未登录 401） |

要点：

- 会话令牌是 HS256 JWT，只承载 `sub` / `sid` / `typ` / `role?`，**不承载任何业务数据**；每次请求都会回查 `sessions` 表，因此「禁用用户」「修改密码」可以立刻吊销会话（`revokeSession` / `revokeAllSessions`）。
- 微信登录走标准 OAuth 授权码流程，并有 **state 双提交校验**（`src/server/auth/state.ts`）：`/api/auth/wechat/authorize` 把签名过的 state 写进 HttpOnly Cookie，`callback` 阶段比对，同时用 `sanitizeNext` 阻断 `//evil.com` 这类开放重定向。
- 管理员口令使用 **PBKDF2-SHA256**，格式 `pbkdf2$sha256$<iterations>$<saltB64>$<hashB64>`，默认 20,000 次迭代；登录失败 5 次锁定 15 分钟（计数与锁定时间落在 `admin_users` 上，无需额外限流组件）。
- **用户端守卫只是体验优化**（避免闪现受保护内容），真正的权限边界永远在 API 层。

### 开发模式模拟登录

`AUTH_DEV_MODE=true` 且 `APP_ENV !== "production"` 时开放 `POST /api/auth/dev-login`：以昵称生成 `dev:<昵称>` 作为 `openid` 走与微信登录相同的 upsert 逻辑，同名即同一账本。生产环境同时不满足两个条件，接口必然 403。

## 6. 数据约定

- **金额一律为 INTEGER「分」**（`amount_cents`）。从用户输入到落库的唯一路径是 `parseAmountToCents()`：只接受最多两位小数的十进制字面量，刻意拒绝科学计数法与浮点四舍五入。
- **时间戳为 INTEGER Unix 毫秒**；同时冗余 `happened_on TEXT (YYYY-MM-DD)`，用于按自然日聚合与命中索引。
- **业务时区固定 UTC+8**（`APP_TIMEZONE_OFFSET_MINUTES = 480`），跨时区一致性由 `src/lib/dates.ts` 的互转函数保证。
- **删除策略**：账目、账户、分类用软删除（`deleted_at` / `archived_at`），保证统计口径可追溯、误删可恢复；标签为物理删除，关联关系靠外键 `ON DELETE CASCADE` 清理。
- **契约单一来源**：`src/lib/api.ts` 通过 `import type` 直接引用服务端 DTO 类型，前后端不会各写一份而漂移。

## 7. PWA 策略（仅用户端）

- `@serwist/next` 配置为 `register: false`，不全局注入注册脚本；由用户端布局中的 `<ServiceWorkerRegistrar />` 在 `NODE_ENV === "production"` 时延迟注册 `/sw.js`。缓存策略集中写在 `src/app/sw.ts`。
- `/api/**` 与 `/admin/**` 一律 **NetworkOnly**，绝不落盘缓存（在 `sw.ts` 里显式声明，排在 `defaultCache` 之前以保证优先级）。
- 其余规则沿用 Serwist 官方的 `defaultCache`（导航、静态资源、图片、字体各自的最佳实践），离线兜底页为预缓存的 `/offline`。
- 后台位于 `/admin`，不经过 `(app)` route group，因此既不加载 `SessionProvider` 也不注册 Service Worker。

> 已知残留：`manifest.webmanifest` 的 `scope` 是 `/`，浏览器的「安装应用」入口无法排除 `/admin`。但后台页面的网络请求已被 Service Worker 规则排除，且后台本身是独立鉴权体系，实际影响仅为「安装后的应用窗口可以导航到 `/admin`」。

## 8. 前后端分工

| 层 | 职责 | 不做什么 |
| --- | --- | --- |
| 页面组件 | 渲染、交互、调用 `api.get/post/patch/delete` | 不做统计计算、不接触数据库 |
| `src/lib/api.ts` | 统一请求头、解包 `{ data }`、抛出 `{ error }` | 不感知具体接口语义 |
| API 路由 | 鉴权、校验、组装 DTO | 不写业务规则 |
| 服务层 | 业务规则、SQL、事务 | 不感知 HTTP |
| `serialize.ts` | 输出白名单 | 不做业务判断 |

## 9. 技术选型说明

| 组件 | 版本 | 说明 |
| --- | --- | --- |
| Next.js | 15.5.26 | 处于 `@opennextjs/cloudflare` 支持的版本线内（15.x/16.x）；该版本已修掉 CVE-2025-66478 |
| @opennextjs/cloudflare | 1.20.x | Cloudflare 官方 Next.js 适配器，替代已废弃的 `@cloudflare/next-on-pages`；以 Node.js runtime 运行 |
| @cloudflare/workers-types | v5 | 提供 `D1Database` 等绑定类型；**必须为 v5**，wrangler 4.141 的 peer 只接受 v5 |
| Tailwind CSS | v4 | 通过 `@tailwindcss/postcss` 接入 |
| shadcn/ui | 4.x | 初始化时使用 `-b radix -p nova` 预设 |
| Recharts | 3.x | 经 shadcn 的 `chart` 组件封装（`ChartContainer` / `ChartTooltip`） |
| Serwist | 9.x | `@serwist/next` + `serwist`，`next-pwa` 的官方替代品；仅作用于用户端 |
| zod | v4 | 注意：自定义错误文案要作为**第二个参数**传字符串 |
| jose | v6 | HS256 JWT |
| Vitest | 3.x | 单元测试 + 基于 `node:sqlite` 的集成测试 |