# 部署指南

目标平台：**Cloudflare Workers**（含静态资源 assets 绑定）+ **Cloudflare D1**（SQLite）。

构建链路：

```
next build  →  @opennextjs/cloudflare  →  .open-next/worker.js + .open-next/assets  →  wrangler deploy
```

配套阅读：[架构设计](./architecture.md) · [数据库模型](./database.md) · [API 文档](./api.md)

> **关于部署目标的变更**：项目原使用 `@cloudflare/next-on-pages` 部署到 Cloudflare Pages。
> 该包已废弃（npm 弃用提示为「Please use the OpenNext adapter instead」），官方替代品
> `@opennextjs/cloudflare` 只支持部署到 **Workers**。因此部署目标已改为 Workers，
> 静态资源通过 `assets` 绑定托管，功能与原先一致。

## 0. 前置条件

| 项 | 要求 |
| --- | --- |
| Node.js | ≥ 20（本项目在 v24.21.0 上验证通过） |
| Cloudflare 账号 | 已开通 Workers 与 D1（D1 有免费额度） |
| wrangler | 已随依赖安装（`npx wrangler --version`，需 ≥ 3.99.0，当前 v4.x） |
| 微信开放平台 | 可选。仅「网站应用」扫码登录需要；不配置则只能走本地模拟登录 |

登录 wrangler：

```bash
npx wrangler login
```

## 1. 创建 D1 数据库

```bash
npx wrangler d1 create my-ledger-db
```

输出形如：

```
✅ Successfully created DB 'my-ledger-db'
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

把 `database_id` 回填到 [wrangler.toml](../wrangler.toml)：

```toml
[[d1_databases]]
binding = "DB"
database_name = "my-ledger-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # ← 替换占位 ID
migrations_dir = "migrations"
```

> 本地开发使用 `--local` 的 SQLite 副本（`.wrangler/state/v3/d1`），**不校验该 ID 的真实性**，
> 因此可以先把 `00000000-...` 占位符留着跑通本地流程，再回填线上 ID。

## 2. 应用数据库迁移

```bash
# 本地开发库（先跑通本地）
npm run db:migrate:local
npm run db:seed:local          # 可选：写入演示数据

# 线上
npm run db:migrate:remote
```

> `db:seed:local` **只用于本地**。生产环境不要导入演示数据。
> 确认迁移状态：`npx wrangler d1 migrations list my-ledger-db --remote`。

## 3. 配置环境变量与密钥

### 3.1 本地开发

复制模板并填写：

```bash
cp .dev.vars.example .dev.vars
```

| 变量 | 说明 |
| --- | --- |
| `AUTH_JWT_SECRET` | 用户端会话签名密钥，≥ 32 字符 |
| `ADMIN_JWT_SECRET` | 管理员会话签名密钥，**必须与上面不同** |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 微信网站应用凭据，留空则只能用模拟登录 |
| `WECHAT_OAUTH_REDIRECT_BASE` | 回调地址前缀，本地为 `http://localhost:3000` |
| `AUTH_DEV_MODE` | 本地 `true`，生产必须 `false` |
| `APP_ENV` | 本地必须为 `development`（覆盖 `wrangler.toml` 的 `production`），否则模拟登录 403 |
| `NEXTJS_ENV` | 本地 `development`；不设置时适配器按 `production` 加载 `.env` 文件 |
| `ADMIN_PBKDF2_ITERATIONS` | 管理员口令 PBKDF2 迭代次数，默认 `20000` |

`.dev.vars` 已被 `.gitignore` 忽略，**不要提交**。它的优先级高于 `wrangler.toml` 的 `[vars]`，
且只对本地生效——因此本地覆盖 `APP_ENV=development` 不会影响线上。

生成强随机密钥：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

### 3.2 生产环境（Workers）

**机密**用 `secret put`（加密存储在 Cloudflare，不写入 `wrangler.toml`，不会进代码库）。
Worker 名称取自 `wrangler.toml` 的 `name`：

```bash
npx wrangler secret put AUTH_JWT_SECRET
npx wrangler secret put ADMIN_JWT_SECRET
npx wrangler secret put WECHAT_APP_ID
npx wrangler secret put WECHAT_APP_SECRET
npx wrangler secret put WECHAT_OAUTH_REDIRECT_BASE   # 输入 https://ledger.example.com
```

**非机密变量**已写在 [wrangler.toml](../wrangler.toml) 的 `[vars]`，随部署自动生效：

```toml
[vars]
APP_ENV = "production"
AUTH_DEV_MODE = "false"        # 生产必须为 false，否则开放免鉴权登录后门
WECHAT_OAUTH_SCOPE = "snsapi_login"
```

> `AUTH_DEV_MODE` 在服务端有**双重开关**校验：除该变量必须为 `"true"` 外，
> 还要求 `APP_ENV !== "production"`。两层同时满足才允许 `/api/auth/dev-login`。
> 生产环境只需保证 `APP_ENV=production` 即可绝对关闭该接口，但仍建议把 `AUTH_DEV_MODE` 也置为 `false`。
>
> 首次部署前 secret 尚不存在，此时 `/api/health` 会因缺少 `AUTH_JWT_SECRET` 报错——属预期，先建 secret 再重试。

## 4. 创建首个管理员

管理员体系与普通用户完全隔离，**不提供自助注册**，只能由运维在本机执行引导脚本写入 D1。

```bash
# 线上（交互式输入口令，推荐）
node scripts/create-admin.mjs --username admin --name 系统管理员 --role super_admin --remote

# 或通过环境变量传入口令，避免出现在 shell 历史
ADMIN_PASSWORD='<强密码>' node scripts/create-admin.mjs --username admin --remote
```

口令要求：长度 12-128，且包含大写字母、小写字母、数字、符号中的**至少三类**。

脚本使用 `INSERT ... ON CONFLICT (username) DO UPDATE`，因此**可重复执行**——
既用于初始化，也用于忘记口令时的应急重置（会同时清零 `failed_attempts` 与 `locked_until`）。
新账号会带 `must_change_password = 1`，后台顶部会持续提示修改密码。

> 脚本内部直接调用 `node_modules/wrangler/bin/wrangler.js` 并走临时 SQL 文件，
> 因此在 Windows 上也不受 shell 脚本执行策略与参数按空格拆分的影响。

## 5. 构建与部署

```bash
npm ci
npm run deploy     # = opennextjs-cloudflare build && opennextjs-cloudflare deploy
```

首次 `deploy` 会创建名为 `my-ledger` 的 Worker（取自 `wrangler.toml` 的 `name`），
成功后输出形如 `https://my-ledger.<your-subdomain>.workers.dev`。

`package.json` 中的相关脚本：

| 脚本 | 命令 | 用途 |
| --- | --- | --- |
| `build` | `next build` | 仅 Next 构建。**必须保持此名称**，`opennextjs-cloudflare build` 会调用它 |
| `preview` | `opennextjs-cloudflare build && opennextjs-cloudflare preview` | 构建并在本地 workerd 中运行，与线上同一运行时 |
| `deploy` | `opennextjs-cloudflare build && opennextjs-cloudflare deploy` | 构建并发布到 Workers |
| `upload` | `opennextjs-cloudflare build && opennextjs-cloudflare upload` | 构建并上传为一个新版本（不立即切换流量） |
| `cf-typegen` | `wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts` | 生成绑定类型声明 |

构建产物：

| 路径 | 内容 |
| --- | --- |
| `.open-next/worker.js` | Worker 入口（`wrangler.toml` 的 `main` 指向它） |
| `.open-next/assets` | 静态资源（`assets.directory` 指向它，绑定名 `ASSETS`） |

> **不要**手改 `main` 与 `assets` 的路径，除非同时改动了适配器的产物结构。
>
> `public/_headers` 里的 `/_next/static/*` 永久缓存规则会在部署时被解析生效
> （`wrangler dev` 启动日志会打印 `Parsed 1 valid header rule.`）。

### 用 Git 集成自动部署（可选）

Dashboard → Workers & Pages → 选择 `my-ledger` → Settings → Builds，配置：

| 配置项 | 值 |
| --- | --- |
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command | `npx opennextjs-cloudflare deploy` |
| Environment variables | `NODE_VERSION = 22`（或更高） |

D1 等绑定会从仓库里的 `wrangler.toml` 读取，**无需**在 Dashboard 手动添加。
机密仍需通过 `wrangler secret put` 预先设置。

### 用 GitHub Actions 自动部署

仓库已内置 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)，**仅支持手动触发**
（`workflow_dispatch`），不会在 push 时自动上线，避免误改代码直接进生产。

触发前置配置：仓库 Settings → Secrets and variables → Actions，新增两个 Secret：

| Secret | 说明 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token，权限至少需 **Workers Scripts:Edit**、**D1:Edit**、**Account Settings:Read** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID（Dashboard 右侧栏或 `npx wrangler whoami` 可见） |

工作流步骤依次为：`checkout` → `setup-node`（Node 24 + npm 缓存）→ `npm ci` →
`npm run lint` → `npm run typecheck` → `npm test` → `npm run db:migrate:remote` → `npm run deploy`。
任一校验失败即中止，不会部署，也不会跑迁移。

触发方式：仓库 Actions 页面 → 左侧选「Deploy to Cloudflare Workers」→ Run workflow。
工作流带 `concurrency: deploy-production` 且 `cancel-in-progress: false`，
因此同时只会有一个部署在跑，进行中的 D1 迁移不会被新的运行打断。

> Secret 只注入 Job 环境变量，不写入代码库；`wrangler.toml` 中的 `database_id` 是资源标识符
> 而非凭据，可安全提交到公开仓库。

## 6. 微信登录配置（可选）

在**微信开放平台** → 网站应用 → 授权回调域，填写你的域名（不带协议与路径）：

```
ledger.example.com
```

回调地址固定为：

```
https://<你的域名>/api/auth/wechat/callback
```

需与 `WECHAT_OAUTH_REDIRECT_BASE` 拼接结果一致，否则微信会返回 `redirect_uri 参数错误`。

登录态相关的 Cookie 属性由服务端自动判定（见 `src/server/http/cookies.ts`）：
HTTPS 请求自动加 `Secure`，`SameSite=Lax`，`HttpOnly`。因此**部署到 HTTPS 域名后无需额外配置**。

`state` 参数做了双提交校验：签名后的短期 JWT + 同名 nonce 的 HttpOnly Cookie，
两者必须同时匹配才继续换取 `code`，可防 CSRF 与重放。

## 7. 自定义域名

Dashboard → Workers & Pages → `my-ledger` → Settings → Domains & Routes → Add custom domain，
按提示在 DNS 添加记录。生效后回到第 3.2 与第 6 节，把 `WECHAT_OAUTH_REDIRECT_BASE`
与微信回调域同步更新。

也可用 CLI：`npx wrangler deployments` 查看当前版本，域名路由通过
`wrangler.toml` 的 `routes` 声明或 Dashboard 配置。

## 8. 部署后验证清单

```bash
# 1. 健康检查：确认 D1 绑定已注入且可查询
curl https://<你的域名>/api/health
# {"data":{"status":"ok","database":"d1","environment":"production","wechatConfigured":true,"time":...}}

# 2. 未鉴权访问受保护接口，应返回 401
curl -i https://<你的域名>/api/transactions

# 3. 静态资源应带长缓存头（来自 public/_headers）
curl -I https://<你的域名>/_next/static/chunks/<某个文件>.js
# Cache-Control: public,max-age=31536000,immutable
```

浏览器侧逐项确认：

- [ ] `/login` 可打开，微信扫码可跳转（或开发模式下模拟登录可用）
- [ ] 登录后 `/` 显示本月结余、今日三指标、Top5 分类
- [ ] `/transactions/new` 可记一笔，`/transactions` 列表出现该笔并可编辑/删除
- [ ] `/stats` 趋势图与分类饼图正常渲染（Recharts）
- [ ] `/settings` 可新增账户与分类
- [ ] `/admin/login` 用第 4 节创建的管理员可登录，概览指标、用户、账目、审计日志、管理员页正常
- [ ] 后台**不注册** Service Worker（DevTools → Application → Service Workers 中 `/admin` 无注册项）
- [ ] 用户端刷新后 SW 已注册，断网访问命中 `/offline` 兜底页而**不是**浏览器默认错误页
- [ ] 用户端 Cookie 中 `Secure` / `HttpOnly` / `SameSite=Lax` 均正确

## 9. 运维手册

### 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| `/api/health` 返回 500 且日志含 `DB` 未定义 | D1 绑定缺失。检查 `wrangler.toml` 的 `[[d1_databases]]`，并用 `wrangler deployments` 确认部署的版本 |
| 接口全部 500 且日志提到缺少 `AUTH_JWT_SECRET` | secret 未设置。执行第 3.2 节的 `wrangler secret put` |
| 所有接口 401 | 请求未带 Cookie，或 `AUTH_JWT_SECRET` 在部署后被改动（旧 token 全部失效）。重新登录即可 |
| 管理员登录持续提示「已锁定」 | 触发 5 次失败锁定 15 分钟。等待或重跑 `create-admin.mjs` 重置 `failed_attempts`/`locked_until` |
| 微信回调 `redirect_uri 参数错误` | 微信授权回调域、`WECHAT_OAUTH_REDIRECT_BASE`、实际访问域名三者不一致 |
| 构建报找不到 `main` / `.open-next/worker.js` | 跳过了 `opennextjs-cloudflare build`。请用 `npm run deploy`，不要直接 `wrangler deploy` |
| Worker 体积超限（免费版 3 MiB / 付费版 10 MiB） | 检查是否引入了过大的服务端依赖；适配器构建日志会列出各 chunk 大小 |
| 页面时间比预期早 8 小时 | 统计口径固定为 UTC+8（`APP_TIMEZONE_OFFSET_MINUTES = 480`），与浏览器本地时区无关 |

### 回滚

Workers 每次部署都会生成一个版本：

```bash
npx wrangler versions list          # 查看历史版本
npx wrangler rollback               # 交互式选择回滚目标
```

也可在 Dashboard → Workers & Pages → `my-ledger` → Deployments 中一键 Rollback。

注意**数据库迁移不会自动回滚**——若本次发布了破坏性 schema 变更，需另行编写前向修复迁移。

### 日志

```bash
npx wrangler tail my-ledger
```

实时输出线上 `console.error`（如微信回调失败、D1 查询异常）。

## 10. 已知限制

- **部署目标是 Workers，不是 Pages**。项目原需求写的是 Pages，因 `next-on-pages` 废弃而改为
  Workers + assets 绑定；这是 `@opennextjs/cloudflare` 唯一支持的路径。
- **运行时是 Node.js，不再是 Edge**。适配器以 Next.js 的 Node.js runtime 运行
  （这也是它比 next-on-pages 功能更全的原因）。因此**不要**再往路由里加
  `export const runtime = "edge"` —— Edge runtime 不被该适配器支持。
- **未启用增量缓存**：`open-next.config.ts` 使用默认的 `dummy` 实现，未绑定 R2/KV。
  本项目页面全部静态预渲染、无 ISR，因此不需要。若后续引入 ISR，需同时声明
  `NEXT_INC_CACHE_R2_BUCKET` 绑定并改用 `r2IncrementalCache`（配置里已写明步骤）。
- **未声明 `images` 绑定**：项目未使用 `next/image`；适配器在 `env.IMAGES` 未定义时
  会跳过图片优化并直接返回原图，这也避免了要求账号开通 Cloudflare Images。
- **PWA scope 为 `/`**：`manifest` 与 Service Worker 的 `scope` 都是根路径，无法把 `/admin` 排除在 scope 之外。
  实际防护靠 `sw.ts` 的 `runtimeCaching` 把 `/admin` 与 `/api` 全部标为 `NetworkOnly`（既不预缓存也不落盘），
  因此后台数据不会被离线缓存。若需彻底隔离，需为用户端单独分配子域。
- **管理后台未做独立构建**：与用户端共享同一个 Next 产物，因此后台也会下载用户端的 JS chunk。
  两者靠路由分组（`(app)` 与 `admin/(dashboard)`）在运行时隔离。
- **`AUTH_DEV_MODE` 的兜底依赖 `APP_ENV`**：不要把线上的 `APP_ENV` 设为 `production` 之外的值。
- **D1 无全局事务**：跨多条语句的一致性依赖 `batch()` 原子批次与业务层的顺序设计，
  详见 [数据库模型 §6](./database.md)。
- **Windows 下 OpenNext 支持不完整**：官方文档明确 Windows 支持「不保证」，
  推荐在 WSL 下构建。本项目在 Windows 上构建与本地预览均已验证通过，但若遇到
  与路径/符号链接相关的构建异常，可改用 WSL。