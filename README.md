# 轻记账 · my-ledger

一款部署在 Cloudflare 上的**双端记账应用**：移动优先的用户端记账 PWA + `/admin` 下的平台监控与治理后台。

- **用户端**：账号密码登录 / 自助注册、微信扫码登录，记账、明细、统计图表、账户/分类/标签管理，支持离线访问（PWA）。
- **管理后台**：独立的管理员账户体系，提供用户治理、跨用户账目监控、审计日志与管理员管理。
- **数据层**：Cloudflare D1（SQLite），所有读写都经过 API，**前端永不直连数据库**。

技术栈：Next.js 15 App Router · TypeScript · Tailwind CSS v4 · shadcn/ui · Recharts · Serwist
· Cloudflare Workers（@opennextjs/cloudflare）· D1 · wrangler

## 文档

| 文档 | 内容 |
| --- | --- |
| [架构设计](docs/architecture.md) | 运行时拓扑、目录结构、请求流水线、鉴权体系对比、PWA 策略、技术选型 |
| [API 文档](docs/api.md) | 全部接口的请求/响应示例、错误码表、鉴权约定 |
| [数据库模型](docs/database.md) | 9 张表的字段/约束/索引、迁移方案、演示数据、一致性要点 |
| [部署指南](docs/deployment.md) | D1 创建、密钥配置、管理员引导、Workers 部署、验证清单、运维手册 |

## 目录速览

```
src/
├── app/
│   ├── (app)/                # 用户端（route group，不影响 URL）
│   │   ├── page.tsx          #   首页概览
│   │   ├── transactions/     #   明细列表 / 记一笔（含编辑）
│   │   ├── stats/            #   Recharts 趋势与结构图
│   │   └── settings/         #   账户 / 分类 / 标签
│   ├── admin/                # 管理后台
│   │   ├── login/            #   管理员登录
│   │   └── (dashboard)/      #   概览 / 用户 / 账目 / 审计日志 / 管理员
│   ├── login/, offline/      # 用户端登录、PWA 离线兜底页
│   ├── api/                  # 全部 API 路由（Node.js runtime）
│   └── sw.ts                 # 用户端 Service Worker 源码（Serwist）
├── components/
│   ├── ui/                   # shadcn/ui 组件
│   ├── layout/               # AppShell / AdminShell / BottomNav / 状态占位
│   └── providers/            # SessionProvider（用户端）/ AdminSessionProvider
├── server/
│   ├── db/                   # D1 客户端封装与记录类型
│   ├── auth/                 # 会话、JWT、口令哈希、微信 OAuth、守卫
│   ├── http/                 # 响应信封、错误、Cookie、查询串、序列化
│   ├── services/             # 业务逻辑（账目/账户/分类/标签/统计/用户/审计）
│   └── validation/           # zod schema
└── lib/                      # 前端工具：api 客户端、金额、日期、格式化
migrations/                   # D1 SQL 迁移（0001 建表 / 0002 内置分类）
seeds/                        # 本地演示数据
scripts/                      # 管理员引导脚本
tests/                        # Vitest 单元测试 + 集成测试
```

## 本地开发

### 1. 环境

Node.js ≥ 20（项目在 v24.21.0 上验证）。依赖安装：

```bash
npm install
```

> 依赖已移除 `legacy-peer-deps` 变通：`@cloudflare/workers-types` 必须是 **v5**
> （wrangler 4.141 的 peer 只接受 v5），否则 `npm install` 会直接报 ERESOLVE。

### 2. 配置本地变量

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` 已被 `.gitignore` 忽略。关键项：

| 变量 | 说明 |
| --- | --- |
| `AUTH_JWT_SECRET` | 用户端会话密钥，≥ 32 字符 |
| `ADMIN_JWT_SECRET` | 管理员会话密钥，**必须与上面不同** |
| `AUTH_DEV_MODE` | 本地置 `true` 以启用模拟登录 |
| `APP_ENV` | 本地必须为 `development`。`wrangler.toml` 的 `[vars]` 里是 `production`，若不覆盖，`/api/auth/dev-login` 会因「生产环境已禁用开发模式登录」返回 403 |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 留空则只能走模拟登录 |
| `USER_PBKDF2_ITERATIONS` / `ADMIN_PBKDF2_ITERATIONS` | 普通用户 / 管理员口令哈希迭代次数，默认 20000 |

> `.dev.vars` 的优先级高于 `wrangler.toml` 的 `[vars]`，且只影响本地，因此生产环境的
> `APP_ENV=production` 不受影响。

### 3. 初始化数据库

```bash
npm run db:migrate:local    # 建表 + 内置分类
npm run db:seed:local       # 可选：写入演示数据（用户「演示用户」）
```

### 4. 创建管理员

```bash
node scripts/create-admin.mjs --username admin --name 系统管理员 --role super_admin
```

按提示输入口令（≥ 12 位，且含大写/小写/数字/符号中至少三类）。

### 5. 启动

```bash
npm run dev
```

打开 http://localhost:3000。

- 用户端登录：`/login`。可直接用种子账号 **`demo` / `demo1234`** 登录，也可自助注册新账号；
  未配置微信凭据时还能用**模拟登录**（输入昵称即可，建议填 `演示用户` 以复用种子数据）。
- 后台登录：`/admin/login`，用第 4 步创建的管理员账号。

> `npm run dev` 通过 `initOpenNextCloudflareForDev()` 把 `wrangler.toml` 里的 D1 绑定注入
> Next 开发服务器，因此本地跑的就是真实的 D1 API，本地库文件位于 `.wrangler/state/v3/d1`。

### 以生产产物本地预览

```bash
npm run preview     # opennextjs-cloudflare build + preview，运行在真实 workerd 中
```

这条命令与线上使用同一运行时，能提前暴露只有 Workers 环境才会出现的问题。

## npm scripts

| 脚本 | 说明 |
| --- | --- |
| `npm run dev` | Next 开发服务器（已注入 D1 绑定） |
| `npm run build` | `next build` |
| `npm run preview` | `opennextjs-cloudflare build && preview`，在本地 workerd 中运行生产产物 |
| `npm run deploy` | `opennextjs-cloudflare build && deploy`，构建并发布到 Workers |
| `npm run upload` | 构建并上传为一个新版本（不立即切换流量） |
| `npm run cf-typegen` | 生成绑定类型声明 `cloudflare-env.d.ts` |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest 全量运行（单元 + 集成） |
| `npm run test:watch` | Vitest watch 模式 |
| `npm run db:migrate:local` | 本地应用迁移 |
| `npm run db:migrate:remote` | 线上应用迁移 |
| `npm run db:seed:local` | 本地写入演示数据 |

## 测试

```bash
npm test
```

- `tests/unit/**` —— 纯函数与基础设施：金额换算、业务日期、口令哈希、JWT、Cookie、响应序列化、查询串解析。
- `tests/integration/**` —— 基于 `node:sqlite` 的 D1 内存适配器（`tests/helpers/d1.ts`），
  **执行真实迁移**后验证服务层：账目的多租户隔离与软删除、统计聚合、账户/分类/标签、管理员失败锁定、微信 upsert。

## 部署

完整步骤见 [部署指南](docs/deployment.md)。最短路径：

```bash
npx wrangler login
npx wrangler d1 create my-ledger-db          # 将 database_id 回填 wrangler.toml
npm run db:migrate:remote
npx wrangler secret put AUTH_JWT_SECRET
npx wrangler secret put ADMIN_JWT_SECRET
node scripts/create-admin.mjs --username admin --remote
npm run deploy
```

部署后访问 `/api/health` 确认 D1 绑定生效。

## 设计要点

- **全链路整数「分」**：金额从输入、API、数据库到聚合一律使用 `amount_cents`（INTEGER），
  仅在 UI 展示时转换为十进制字符串，彻底规避浮点误差。
- **业务时区固定 UTC+8**：不依赖运行环境 TZ。账目冗余存储 `happened_at`（毫秒）与
  `happened_on`（业务日 `YYYY-MM-DD`），聚合直接命中索引。
- **两套隔离的鉴权**：用户端与管理员使用不同的 JWT 签名密钥与 `principal_type`，
  会话统一落 `sessions` 表以支持真正的撤销与在线统计。
- **API 路由不要声明 Edge Runtime**：`@opennextjs/cloudflare` 以 Node.js runtime 运行，
  Edge runtime 不被它支持（迁移时已从全部 29 个路由中移除 `export const runtime = "edge"`）。
- **页面全部为客户端组件**，服务端只产出静态 HTML；受保护内容在会话就绪后才渲染，
  避免把构建期的时间固化进 HTML 造成 hydration mismatch。
- **PWA 只在用户端**：`/admin` 与 `/api` 在 Service Worker 中一律 `NetworkOnly`，
  既不预缓存也不落盘，保证后台数据实时性与鉴权边界。