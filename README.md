# 我的账本 · my-ledger（微信小程序）

一款**微信小程序记账应用**：Taro + React 前端，后端完全托管在**微信云开发（CloudBase）**——云函数承载业务逻辑，云数据库按用户 `_openid` 隔离数据，前端不直连任何第三方服务。

- **记账**：支出 / 收入 / 转账三类流水，金额键盘输入，支持编辑、删除、退款。
- **账本视图**：首页月度概览、明细分月列表、账户资产（余额由流水实时聚合）、搜索与多维筛选。
- **统计**：月度收支合计、支出分类排行、按日趋势图。
- **管理**：账户、分类、标签、预算的自定义维护；首次登录自动初始化默认账户 / 分类 / 标签。

技术栈：Taro 4.1.9 · React 18 · TypeScript 5 · CSS Modules（Sass）· webpack 5 · zustand 4 · 微信云开发（云函数 + 云数据库 + 云存储）

> 本仓库同一 Git 仓库下存在两条产品线：
> - `main`：Next.js 15 + Cloudflare Workers + D1 的**双端 Web 版**（含 `/admin` 后台）。
> - `feat/miniapp-wechat-cloud`（**当前分支**）：**微信小程序版**，即本文档描述的对象。
>
> 两条分支的运行时、数据层与部署方式完全不同，请勿混用其配置与部署流程。

## 目录

| 章节 | 内容 |
| --- | --- |
| [技术选型说明](#技术选型说明) | 依赖版本现状、为何锁定 React 18、可升级项与不建议升级项 |
| [目录速览](#目录速览) | 工程结构 |
| [架构设计](#架构设计) | 运行时拓扑、前端分层、身份与鉴权、响应信封、数据约定 |
| [数据模型](#数据模型) | 6 个云数据库集合的职责与索引建议 |
| [云函数清单](#云函数清单) | 14 个云函数的职责与出入参 |
| [本地开发](#本地开发) | 依赖安装、H5 预览（mock 数据）、真机调试 |
| [部署](#部署) | 微信云开发环境、集合与索引、云函数部署、环境 ID 回填 |
| [部署后验证清单](#部署后验证清单) | 上线自检项 |
| [已知限制](#已知限制) | 当前边界与后续建议 |

## 技术选型说明

| 依赖 | 当前版本 | 该生态最新 | 结论 |
| --- | --- | --- | --- |
| `@tarojs/*` | `4.1.9`（模板锁定） | `4.3.0` | 同大版本内小版本滞后；见下方说明 |
| `react` / `react-dom` | `^18` | `19.x` | **必须保持 18**，Taro 4.x 官方仅支持 React 18 |
| `zustand` | `^4.5.0` | `5.x` | 可用，未升级（跨大版本，本次不动） |
| `classnames` | `^2.5.0` | `2.5.x` | 已是最新 |
| `dayjs` | `^1.11.10` | `1.11.x` | 已是最新 |
| `typescript` | `^5.1.0` | `7.x` | 落后大版本，未升级 |
| `webpack` | `5.78.0`（固定） | `5.111.x` | 由 `@tarojs/webpack5-runner` 约束，随 Taro 升级一并处理 |
| `wx-server-sdk`（云函数） | `~2.6.3` | `4.x` | 跨大版本，未升级 |
| `miniprogram-ci` | `^2.1.26` | `2.1.x` | 已在范围内 |

**结论：当前技术栈是 Taro 小程序的主流方案，并非过时。** 差异集中在「同大版本滞后」与「工具链跨大版本」，说明如下：

- **React 固定 18（不是 19）**：`@tarojs/plugin-framework-react` 的 `peerDependencies` 明确声明 `"react": "^18"`，即 Taro 4.x 官方只支持 React 18。社区中能跑 React 19 的方案（如 `vite-plugin-taro-react`）本质是给 `@tarojs/react` 打补丁，属非官方路径，本项目不采用。
- **`@tarojs/*` 保持 4.1.9，不升级到 4.3.0**：本项目由 Trae 小程序 Skill 流水线生成，Skill 明确要求「Taro 版本以模板为准」并禁止在项目内执行 Taro / npm 命令，升级需整体 `npm install` 重新验证，超出该约束边界。升级路径见 [已知限制](#已知限制)。
- **工具链（TypeScript / ESLint / Stylelint / webpack）跨大版本不升级**：这些仅影响开发体验，不影响运行时产物；跨大版本升级会带来 Taro 插件与 babel 预设的连锁适配成本。

## 目录速览

```
src/
├── app.tsx                     # 应用入口：云开发初始化（weapp）+ 登录态刷新
├── app.config.ts               # 全局页面注册、窗口样式、底部 tabBar（账单/明细/统计/我的）
├── app.scss                    # 全局样式
├── pages/                      # 16 个页面，每页含 index.tsx / index.config.ts / index.module.scss
│   ├── home/                   #   账单：月度概览 + 近期流水
│   ├── transactions/           #   明细：按月流水列表
│   ├── stats/                  #   统计：收支合计 / 分类排行 / 按日趋势
│   ├── mine/                   #   我的：入口聚合
│   ├── transaction-new/        #   记一笔（含编辑）
│   ├── transaction-detail/     #   流水详情（编辑 / 删除 / 退款）
│   ├── assets/ account-detail/ accounts/   # 资产总览 / 账户明细 / 账户管理
│   ├── search/ search-filter/  #   搜索 / 自定义筛选
│   ├── category-detail/ categories/        # 分类详情 / 分类管理
│   ├── tags/ budgets/          #   标签管理 / 预算管理
│   └── login/                  #   登录（微信小程序原生登录）
├── components/                 # 11 个可复用组件（AmountText、BarChart、NumberKeypad、BottomSheet…）
├── services/
│   ├── ledger.ts               # 领域服务层：按业务语义封装云函数调用
│   └── cloud.ts                # 云调用适配层：weapp 走云函数，其它平台走 mock
├── data/                       # 14 个 mock 模块（与云函数同名），H5 预览用
├── store/user.ts               # zustand 用户态（refresh / login / logout）
├── types/ledger.ts             # 全量领域类型（唯一数据契约来源）
├── utils/                      # money（分/元换算）、dates（UTC+8）、format、palette、account-types
└── styles/                     # theme / variables / compat 全局样式 token
cloudfunctions/                 # 14 个云函数，每个含 index.js + package.json
config/                         # Taro 构建配置（webpack5 + CSS Modules）
project.config.json             # 微信开发者工具项目配置（miniprogramRoot=dist/，cloudfunctionRoot=cloudfunctions/）
```

## 架构设计

### 运行时拓扑

```
┌──────────────────── 微信小程序（weapp）────────────────────┐
│  pages/*  ──►  services/ledger.ts  ──►  services/cloud.ts  │
│                                              │              │
│                        Taro.cloud.callFunction(name, data)  │
└──────────────────────────────────────────────┼──────────────┘
                                               ▼
                      ┌────────── 微信云开发 CloudBase ──────────┐
                      │  云函数（14 个，Node.js / CommonJS）      │
                      │        │                                  │
                      │        ▼                                  │
                      │  云数据库集合（按 _openid 隔离）           │
                      │  users / accounts / categories /          │
                      │  tags / transactions / budgets            │
                      └───────────────────────────────────────────┘

┌──────────────── H5 预览 / 其它平台（非 weapp）─────────────┐
│  pages/*  ──►  services/ledger.ts  ──►  services/cloud.ts  │
│                                     import(`../data/${name}`)│
│                                              ▼              │
│                                   src/data/*.ts（内存 mock） │
└────────────────────────────────────────────────────────────┘
```

### 前端分层

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 页面层 | `src/pages/**` | 纯 UI 与交互，只调用服务层，不感知云开发 |
| 领域服务层 | [ledger.ts](file:///c:/Users/27578/Documents/Code/my-ledger/src/services/ledger.ts) | 按业务语义命名的方法（`getTransactions` / `mutateTransaction` / `getStats`…），收敛入参结构 |
| 云调用适配层 | [cloud.ts](file:///c:/Users/27578/Documents/Code/my-ledger/src/services/cloud.ts) | 平台分流：`weapp` 走 `Taro.cloud.callFunction`，其它平台动态 `import('../data/<name>')` 走 mock，并统一解包响应信封 |
| 状态层 | [user.ts](file:///c:/Users/27578/Documents/Code/my-ledger/src/store/user.ts) | zustand 维护登录态，`ensureLogin()` 负责未登录跳转 |
| 类型契约 | [ledger.ts](file:///c:/Users/27578/Documents/Code/my-ledger/src/types/ledger.ts) | 所有领域类型集中定义，前端与 mock 共用；云函数侧为纯 JS，保持字段一致 |

平台判定的落点集中在 `cloud.ts` 与 `app.tsx`：`process.env.TARO_ENV` 在编译期被替换为字面量，因此非微信平台的 `Taro.cloud` 分支会被 tree shaking 移除，H5 构建产物中不含云开发代码。

### 身份与鉴权

- 采用**微信小程序原生登录**，不引入账号密码体系。
- 云函数通过 `cloud.getWXContext().OPENID` 直接取得用户身份，**免鉴权、无需签发 token**。
- 所有文档写入时附带 `_openid`，读取时一律以 `{ _openid: openid }` 作为查询条件，实现用户间数据隔离。
- 云开发安全规则：默认「仅创建者可读写」。

### 响应信封

所有云函数统一返回：

```json
{ "code": 0, "message": "success", "data": {} }
```

`code === 0` 表示成功，`code < 0` 表示失败（`message` 为错误描述，`data` 为 `null`）。`cloud.ts` 在适配层完成校验与解包：`code !== 0` 时抛出 `Error(message)`，页面只需处理成功数据与异常。

### 数据约定

- **金额全链路整数「分」**：字段统一为 `amountCents` / `initialBalanceCents` / `balanceCents`（均为 INTEGER），仅在展示时经 [money.ts](file:///c:/Users/27578/Documents/Code/my-ledger/src/utils/money.ts) 转换为元字符串，彻底规避浮点误差。
- **业务时区固定 UTC+8**：不依赖运行环境的 `TZ`。[dates.ts](file:///c:/Users/27578/Documents/Code/my-ledger/src/utils/dates.ts) 定义 `APP_TZ_OFFSET_MINUTES = 480`，云函数中同样以 `480 * 60 * 1000` 常量计算。
- **时间三冗余**：流水同时存 `happenedAt`（Unix 毫秒，真实时间戳）、`happenedOn`（`YYYY-MM-DD`，UTC+8 业务日）、`monthKey`（`YYYY-MM`，UTC+8），使按月、按日聚合可直接命中等值查询，无需范围扫描。
- **余额不做落库**：账户只存 `initialBalanceCents`，当前余额 `balanceCents` 由 `getAccounts` 云函数遍历该用户流水实时聚合，避免多写点不一致。
- **软删除策略**：当前流水删除为物理删除（`remove()`）；如需审计能力可改为标记位。

## 数据模型

云数据库为文档型（NoSQL），共 6 个集合，均以 `_openid` 作为用户维度隔离字段。

| 集合 | 用途 | 核心字段 | 建议索引 |
| --- | --- | --- | --- |
| `users` | 用户信息 | `_openid`, `nickname`, `avatar`, `createdAt` | `_openid` |
| `accounts` | 账户 | `_openid`, `name`, `type`, `icon`, `color`, `initialBalanceCents`, `archived`, `sortOrder` | `_openid` |
| `categories` | 分类 | `_openid`, `name`, `kind`(`expense`/`income`), `icon`, `color`, `isSystem`, `sortOrder` | `_openid` + `kind` |
| `tags` | 标签 | `_openid`, `name`, `color` | `_openid` |
| `transactions` | 流水 | `_openid`, `type`, `amountCents`, `accountId`, `toAccountId`, `categoryId`, `tagIds[]`, `happenedAt`, `happenedOn`, `monthKey`, `note`, `refundedFromId`, `createdAt` | `_openid` + `monthKey`、`_openid` + `happenedAt`、`_openid` + `accountId` |
| `budgets` | 预算 | `_openid`, `monthKey`, `categoryId`, `amountCents` | `_openid` + `monthKey` |

**首次登录初始化数据**（由 `login` 云函数写入）：5 个默认账户（微信零钱 / 支付宝 / 银行卡 / 现金 / 信用卡）、12 个默认分类（8 支出 + 4 收入）、3 个默认标签（必要 / 可选 / 报销）。

## 云函数清单

14 个云函数位于 `cloudfunctions/`，均使用 CommonJS（`require` / `exports.main`），依赖 `wx-server-sdk`，统一 `cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })`。

| 云函数 | 职责 | 主要入参 | 返回 |
| --- | --- | --- | --- |
| `login` | 获取或创建用户；`action: 'me'` 仅查询不创建；首次登录时初始化默认账户 / 分类 / 标签 | `{ action?: 'login' \| 'me' }` | `User \| null` |
| `getHomeSummary` | 首页月度概览 | `{ monthKey }` | `HomeSummary` |
| `getTransactions` | 条件查询流水，并拼装账户名 / 分类 / 标签等展示态 | `{ monthKey?, type?, categoryId?, tagId?, accountId?, minAmountCents?, maxAmountCents?, startDate?, endDate?, keyword?, skip?, limit? }` | `TransactionView[]` |
| `saveTransaction` | 流水的创建 / 更新 / 删除 / 退款，写入时计算 `happenedOn` 与 `monthKey` | `{ action: 'create' \| 'update' \| 'delete' \| 'refund', ... }` | `{ id? }` |
| `getStats` | 月度收支合计、支出分类排行（含占比）、按日趋势 | `{ monthKey, categoryId? }` | `StatsOverview` |
| `getAccounts` | 账户列表，按该用户全部流水聚合当前余额 | `{}` | `Account[]` |
| `saveAccount` | 账户增删改 | `{ action, id?, name?, type?, icon?, color?, initialBalanceCents? }` | `{ id? }` |
| `getAccountDetail` | 单账户详情（含月度流水） | `{ accountId, monthKey? }` | `AccountDetail` |
| `getCategories` | 分类列表（可按 `kind` 过滤） | `{ kind? }` | `Category[]` |
| `saveCategory` | 分类增删改 | `{ action, id?, name?, kind?, icon?, color? }` | `{ id? }` |
| `getTags` | 标签列表 | `{}` | `Tag[]` |
| `saveTag` | 标签增删改 | `{ action, id?, name?, color? }` | `{ id? }` |
| `getBudgets` | 按月查询预算 | `{ monthKey? }` | `Budget[]` |
| `saveBudget` | 预算增删改 | `{ action, id?, monthKey?, categoryId?, amountCents? }` | `{ id? }` |

> 查询类云函数单次 `limit(1000)`：当前面向个人记账的数据量设计，若单用户流水超过千条需引入分页。

## 本地开发

### 依赖与构建

工程为标准 Taro 项目，常规命令：

```bash
npm install            # 安装依赖
npm run dev:weapp      # 微信小程序开发构建（watch）
npm run build:weapp    # 微信小程序生产构建，产物在 dist/
npm run dev:h5         # H5 开发构建（用于浏览器快速预览，走 mock 数据）
```

> 构建产物 `dist/`、依赖 `node_modules/`、云函数本地依赖 `cloudfunctions/**/node_modules` 均已在 `.gitignore` 中忽略。

### AI 辅助预览（本项目采用的默认方式）

本项目由 Trae 小程序 Skill 流水线维护，预览通过 Skill 自带的预览服务完成（会自动处理依赖与构建，并在浏览器中打开）：

```bash
# 1) 取 Skill 资源目录（输出 skill_assets_dir）
node c:/Users/27578/.trae-cn/builtin_skills/TRAE-generate-mini-app/scripts/get-skill-assets-dir.js

# 2) 预览（后台运行，控制台输出 [TraePreviewUrl]: <url>）
node <skill_assets_dir>/scripts/preview-server.js
```

预览运行在 **H5 环境**，`src/services/cloud.ts` 会自动改用 `src/data/*.ts` 的内存 mock 数据，无需云开发环境即可完整体验交互。

### 真机 / 模拟器调试

在**微信开发者工具**中打开项目根目录（`project.config.json` 已配置 `miniprogramRoot: dist/`、`cloudfunctionRoot: cloudfunctions/`）。使用云能力前必须：

1. 把 `project.config.json` 的 `appid` 从 `touristappid` 换成你自己的小程序 AppID（游客模式**无法使用云开发**）。
2. 按 [部署](#部署) 章节完成云环境与云函数部署，并回填环境 ID。

## 部署

后端为**微信云开发（CloudBase）**：无服务器、无自建数据库，部署即「建集合 + 建索引 + 上传云函数」。

### 前置条件

1. 已注册微信小程序并取得 AppID，且在**微信公众平台 / 微信开发者工具**中开通「云开发」并创建环境。
2. IDE 已配置 **CloudBase MCP**（部署全程通过 MCP 工具完成，无需手工执行 CLI）：

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["-y", "@cloudbase/cloudbase-mcp@latest"]
    }
  }
}
```

### 部署顺序

1. **创建数据库集合**（6 个）：`users`、`accounts`、`categories`、`tags`、`transactions`、`budgets`
   - MCP：`writeNoSqlDatabaseStructure`，`action: "createCollection"`，`collectionName: "<集合名>"`
2. **创建索引**（按 [数据模型](#数据模型) 的「建议索引」列）
   - MCP：`writeNoSqlDatabaseStructure`，`action: "updateCollection"`，附带 `CreateIndexes` 配置
3. **部署云函数**（14 个，逐个从 `cloudfunctions/` 上传）
   - MCP：`manageFunctions`，`action: "createFunction"`，`functionName: "<函数名>"`，`functionRootPath: "<项目路径>/cloudfunctions"`
   - 云函数的 `wx-server-sdk` 依赖由云端安装，本地 `node_modules` 不入库
4. **回填环境 ID**：用 MCP `envQuery` 取当前环境 ID，写入 [app.tsx](file:///c:/Users/27578/Documents/Code/my-ledger/src/app.tsx#L20) 的 `Taro.cloud.init({ env: '<环境ID>' })`
5. **验证**：调用 `login` 云函数确认返回 `code: 0`

### 发布小程序

云函数部署完成后，用微信开发者工具打开项目（`dist/` 为小程序根目录、`cloudfunctions/` 为云函数根目录），在开发者工具中上传版本并提交审核。`miniprogram-ci` 已列入 devDependencies，可接入 CI 自动上传。

## 部署后验证清单

- [ ] `project.config.json` 的 `appid` 已替换为真实 AppID（非 `touristappid`）
- [ ] 6 个集合均已创建，索引已建立
- [ ] 14 个云函数全部部署成功
- [ ] `login` 云函数调用返回 `code: 0`
- [ ] `app.tsx` 的 `Taro.cloud.init` 已填入真实环境 ID
- [ ] 首次登录后自动生成 5 账户 / 12 分类 / 3 标签
- [ ] 记一笔后可在明细页查到，且账户余额同步变化
- [ ] 统计页收支合计、分类排行、趋势图数据正确
- [ ] 换一个微信账号登录，确认数据互不可见（`_openid` 隔离生效）

## 已知限制

- **React 锁定 18**：Taro 4.x 的官方 `peerDependencies` 仅支持 React 18，升级 React 19 需依赖非官方补丁包，本项目不采用。
- **`@tarojs/*` 停留在 4.1.9**：该版本由小程序 Skill 模板锁定（Skill 要求版本与模板一致，且禁止在项目内执行 Taro / npm 命令）。若要升级到 4.3.0，需在 Skill 约束之外自行完成：统一提升所有 `@tarojs/*` 与 `babel-preset-taro`、`eslint-config-taro` 至同一版本 → 重新 `npm install` → 跑通 `npm run build:weapp` 与 H5 预览后再合并。升级前请留意 Taro 4.2/4.3 的 breaking changes。
- **其余跨大版本未升级**：`zustand` 停在 4.x、云函数 `wx-server-sdk` 停在 `~2.6.3`、工具链 `typescript`/`eslint`/`stylelint` 为旧大版本。这些均不影响运行，按需单独评估。
- **`project.config.json` 仍含模板项目名**：`projectname` / `description` 为模板值，仅影响微信开发者工具中的显示名称，可在开发者工具内直接修改。
- **无锁文件与自动化测试**：仓库未提交 `package-lock.json`，也无单元 / 集成测试；依赖安装结果可能随 registry 漂移。
- **聚合在云函数内完成**：账户余额、统计排行等由云函数遍历该用户流水计算，受 `limit(1000)` 约束，适用于个人记账量级。
