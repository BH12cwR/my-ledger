# 跨页面样式一致性走查（2026-10-01）

> 与 [`design-consistency-review.md`](./design-consistency-review.md) 的分工：  
> 那份&#x662F;**「设计稿 ↔ 实现」**&#x7684;逐元素比对（功能有没有做、像素对不对）；  
> 这份&#x662F;**「页面 ↔ 页面」**&#x7684;横向比对 —— 同样的语义在不同页面是不是同一套样式。
>
> 走查方式：通读全部 16 个页面 + 38 个组件，按**配色 / 字体字号 / 间距布局 / 组件样式**四个维度抽取类名做统计与逐条对照，只列差异，一致的不重复。  
> 结论：**基线是干净的**（shadcn token 打底、状态组件已集中、列表行已统一为一个 `TransactionRow`），  
> 但**应用层自己长出来的样式没有规范** —— 同语义多实现、微字号 9/10/11px 三档并存、间距与内边距各写各的。  
> 共 44 处不一致，其中 **P0 零风险可批量收敛 14 处**、P1 需要抽组件 8 处、P2 需要裁决 6 处。

---

## 0. 走查范围

| 端   | 页面                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 用户端 | `/`（账单）、`/assets`、`/assets/[id]`、`/search`、`/search/filter`、`/stats`、`/stats/category/[id]`、`/transactions/new`、`/settings`、`/login`、`/offline` |
| 后台  | `/admin`、`/admin/users`、`/admin/transactions`、`/admin/audit-logs`、`/admin/admins`、`/admin/login`                                                |
| 壳   | `app-shell.tsx`、`admin-shell.tsx`、`bottom-nav.tsx`、`bottom-sheet.tsx`                                                                           |

（`/transactions` 已 `redirect("/")`，不计。）

---

## 1. 结论速览

| 维度    | 不一致数 | 最严重的三处                                                                           |
| ----- | ---- | -------------------------------------------------------------------------------- |
| 配色    | 12   | 语义色无单一来源（同一「支出」有 3 种色值）；8 处「激活」色各不同；暗色主题不可达但在逐处双写                                |
| 字体与字号 | 12   | 微字号 9/10/11px 三档并存且同信息不同档；金额 6 档字号；`/` 与 `/transactions/new` 没有 `h1`             |
| 间距与布局 | 11   | 页面根容器 `gap-5` / `gap-4` 两套；标题区 5 种结构；吸底宽度常量复制 3 份                                |
| 组件样式  | 9    | 分段控件（方案已声明「共用一套」）实际 4 种规格，且 `/stats` 一页内自相矛盾；「指标格」三套实现；徽章基类 12px 却 17 处手动降到 10px |

**问题密度最高的页面**：`/stats`（7 处，含页内自相矛盾）、`/settings`（5 处）、`/search/filter`（5 处）、`/transactions/new`（5 处）。

---

## 2. 配色方案

### C-1 · 语义色（支出 / 收入 / 转账）没有单一来源，同一语义 3 种色值 ★★★

「支出」这个语义在库里同时以**三种表示**和**三个色阶**存在：

| 表示              | 位置                                                       | 值                                 |
| --------------- | -------------------------------------------------------- | --------------------------------- |
| HEX 常量（图表 / 圆点） | `app/(app)/stats/page.tsx:66-67`、`:195`                  | `#f43f5e` / `#10b981`             |
|                 | `components/transaction-row.tsx:9-13`（`DOT_COLORS`）      | `#f43f5e` / `#10b981` / `#3b82f6` |
|                 | `app/admin/(dashboard)/page.tsx:18-21`                   | `#3b82f6` / `#10b981`             |
| Tailwind 文字色    | 20 处 `text-rose-600 dark:text-rose-400`                  | rose-600 = `#e11d48`              |
| Tailwind 实底色    | `stats/page.tsx:80-82`、`transactions/new/page.tsx:30-32` | `bg-rose-500` = `#f43f5e`         |
| Tailwind 弱化柱    | `components/stats/weekly-bars.tsx:27`                    | `bg-rose-500/85`                  |

也就是说「支出」在**同一屏内**可能是 `#e11d48`（文字）或 `#f43f5e`（圆点/分段底），七日柱还是 85% 不透明的第三种观感。  
`globals.css:70-74` 定义的 `--chart-1..5` 全是灰度、从未被引用，语义色完全游离在 token 体系之外。

**建议**：见 §6.1，收敛为 `--tone-expense / income / transfer`，每色四档（solid / text / soft / chart）。

### C-2 · 蓝色渐变 Hero 卡逐字复制 3 份，且对齐方式自相矛盾 ★★★

三处一模一样的 `rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 p-5 text-white shadow-sm`：

| 位置                                                | 金额对齐                        | 副标题透明度                  |
| ------------------------------------------------- | --------------------------- | ----------------------- |
| `components/transaction/summary-hero.tsx:27`（账单页） | **左对齐**（`:29`）              | 80%(`:28`) / 85%(`:32`) |
| `app/(app)/assets/page.tsx:48`                    | **居中**（`:50`，`text-center`） | 80%(`:49`) / 85%(`:53`) |
| `app/(app)/assets/[id]/page.tsx:130`              | **居中**（`:135`）              | 85%(`:133,138`)         |

同一张卡在账单页左对齐、在资产两页居中；`text-white/80` 与 `text-white/85` 混用。

### C-3 · 「激活 / 选中」色有 5 套表达 ★★★

| 语义       | 表达                                                  | 位置                                                                                          |
| -------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 底部导航激活   | `text-primary`（近黑）                                  | `components/layout/bottom-nav.tsx:66`                                                       |
| 后台导航激活   | `bg-primary/10 text-primary`                        | `components/layout/admin-shell.tsx:98`                                                      |
| 应用内筛选选中  | `bg-blue-500/10 text-blue-600 dark:text-blue-400`   | `search:263`、`filter:227`、`category/[id]:431`、`account-sheet:92,112`、`transactions/new:316` |
| 分段控件激活   | 类型色实底 `bg-rose-500/emerald-500/blue-500 text-white` | `stats:80-82`、`transactions/new:30-32`                                                      |
| 统计页「月/年」 | `bg-background shadow-sm`                           | `stats:249`                                                                                 |

`--primary` 是近黑（`globals.css:58`），而应用识别色是蓝。于是「主按钮 = 黑」但「选中 = 蓝」，两个都叫「强调」。

### C-4 · 暗色主题不可达，但 `dark:` 变体遍布 ★★

`next-themes` 仅在 `components/ui/sonner.tsx:3,8` 被引用 —— **没有 ThemeProvider、没有任何写入 `.dark` 的位置**（`app/layout.tsx:51` 只有 `lang="zh-CN"`）。  
但代码里有 20+ 处 `dark:text-rose-400`、`dark:bg-blue-400` 之类的双写。这些永远不会生效，却让每次配色改动都要改两遍、且没人能验证。

**建议**：接上主题开关，或删掉全部 `dark:` 变体（二选一，不要停在中间态）。

### C-5 · 面与分隔线的透明度档位零散 ★

| 类             | 次数                  | 类                  | 次数              |
| ------------- | ------------------- | ------------------ | --------------- |
| `bg-muted/60` | 41                  | `border-border/60` | 23              |
| `bg-muted`    | 24                  | `border-border`    | 4               |
| `bg-muted/50` | 7                   | `border-border/70` | 1               |
| `bg-muted/30` | 1（`admin-shell:57`） | `border-border/50` | 1（`filter:149`） |

---

## 3. 字体与字号

### T-1 · 微字号 9 / 10 / 11px 三档并存，且同一信息用了不同档 ★★★

`text-xs` 是 12px，但项目在它之下又切了 9、10、11 三档，**没有规则**：

| 档    | 用例                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 9px  | 只有一处：`stats/category/[id]/page.tsx:317`（12 个月柱顶金额）                                                                                                                                                                                                           |
| 10px | `weekly-bars.tsx:22`（**七日柱柱顶金额**）、`stats/page.tsx:653`（环外标签）、`transaction-row.tsx:99,104,107,112`、`settings:391,481,486,629`、`admin-shell:63,67`、`bill-list-sheet:243`、admin 五页徽章共 12 处                                                                      |
| 11px | `transaction-row.tsx:130,132`、`change-badge.tsx:26,35`、`category-rank.tsx:45`、`weekly-bars.tsx:32`、`account-sheet.tsx:97`、`calendar-picker.tsx:151`、`transactions/new:450`、`bottom-nav.tsx:65`、`admin/(dashboard)/page.tsx:172`、`users:178`、`audit-logs:147` |

**同一信息跨页不同档**的实例：

- **柱顶金额**：七日柱 10px（`weekly-bars.tsx:22`）vs 分类详情 12 个月柱 9px（`category/[id]:317`）
- **余额**：列表行 `text-sm`（`account-sheet.tsx:117`）vs 网格磁贴 11px（`:97`）
- **百分比**：排行是 11px（`category-rank.tsx:45`）、环比徽章也是 11px —— 但同页环形中心占比是 `text-xs`（`stats:459`）

### T-2 · 金额字号 6 档，字重不一致 ★★★

| 位置                                                                             | 字号             | 字重                                 |
| ------------------------------------------------------------------------------ | -------------- | ---------------------------------- |
| Hero 卡（3 处）                                                                    | `text-3xl`     | `font-semibold` + `tracking-tight` |
| 记账页输入金额 `transactions/new:352`                                                 | `text-2xl`     | **无**                              |
| 分类详情汇总 `category/[id]:330`、后台 StatCard `admin/(dashboard)/page.tsx:171`        | `text-xl`      | `font-semibold`                    |
| 统计页「收支总览」`stats/page.tsx:673`                                                  | `text-lg`      | **无**                              |
| 指标格 `summary-cell.tsx:23-30`、`category/[id]:460`；流水行 `transaction-row.tsx:125` | `text-sm`（靠继承） | **无**                              |

`tracking-tight` 只加在 3xl 那三处，xl / lg / 2xl 全没有。

### T-3 · 「指标格」是同一件的三种实现，其中两个逐字重复 ★★★

| 组件                   | 位置                                               | 结构                                                                                |
| -------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `SummaryCell`        | `components/transaction/summary-cell.tsx:21-33`  | `rounded-lg bg-muted/60 px-3 py-2` + label `text-xs` + 值 `font-mono tabular-nums` |
| `Metric`（页面私有）       | `app/(app)/stats/category/[id]/page.tsx:446-468` | **与 SummaryCell 完全相同**，只是 tone 映射少了 `transfer`                                    |
| `OverviewCell`（页面私有） | `app/(app)/stats/page.tsx:661-675`               | 无底色、居中、值 `text-lg`                                                                |

消费方：`SummaryCell` 用于 `/search`（5 格）与 `/assets/[id]`（4 格）；`Metric` 用于分类详情（5 格）；`OverviewCell` 用于统计页（5 格）。  
**同一个「标签 + 金额」的小格子，三个页面三种长法。**

### T-4 · `font-heading` 是空操作 ★

`globals.css:12` 写着 `--font-heading: var(--font-sans)` —— 它和 `font-sans` 是同一个字族。  
但它被用在 13 个 `h1`、`CardTitle`（`card.tsx:40`）、`DialogTitle`（`dialog.tsx:133`）、抽屉标题（`bottom-sheet.tsx:65`）上，纯噪音。

### T-5 · 页面标题：字重不一致，两个页面根本没有 `h1` ★★

- 13 处都是 `<h1 className="font-heading text-lg font-semibold">` —— 一致。
- **`/`（账单页）没有 `h1`**：标题是个按钮 `app/(app)/page.tsx:162`，且用的是 `text-lg font-medium`（**medium，不是 semibold**）。
- **`/transactions/new` 没有 `h1`**：只有 X + 分段控件（`:271-292`）。
- 登录 / 离线页用 `text-xl font-semibold`（`login:116`、`admin/login:57`、`offline:19`），且离线页漏了 `font-heading`（`offline:19`）。

### T-6 · 自制输入框绕过了 `Input` 的字号策略 ★

`components/ui/input.tsx:10` 是 `text-base md:text-sm` —— 移动端 16px 防 iOS 聚焦缩放。  
但两处用了原生 `<input className="... text-sm">`：

- 搜索框 `app/(app)/search/page.tsx:179`
- 记账页备注行 `app/(app)/transactions/new/page.tsx:350`

移动端为 14px，iOS 聚焦会缩放；且外层容器圆角是 `rounded-xl`（`:172` / `:344`），与 `Input` 的 `rounded-lg` 不是一套。

### T-7 · 汇总单元格的字号靠父级继承 ★

`Card` 根节点给 `text-sm`（`card.tsx:14`），`SummaryCell` / `Metric` 的值没有再声明字号，靠 `CardContent className="... text-sm"` 传下来（`search:208`、`assets/[id]:145`、`category/[id]:263`）。  
一旦挪进 `text-xs` 容器就会静默变小。

---

## 4. 间距与布局

### S-1 · 页面根容器间距两套 ★★

| `gap-5`                                                 | `gap-4`                                                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `app/(app)/page.tsx:157`、`app/(app)/assets/page.tsx:47` | 其余 12 处：`stats:232`、`search:140`、`filter:116`、`settings:339`、`assets/[id]:104`、`category/[id]:204`、`transactions/new:270`、admin 5 页 |

### S-2 · 标题区有 5 种结构 ★★★

| 型  | 结构                                                        | 位置                                                                          |
| -- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| a  | `justify-between` + **按钮标题** + 4 个图标，无 `h1`               | `app/(app)/page.tsx:158-193`                                                |
| b  | `items-center gap-2` + 返回 + `h1` + 右侧控件                   | `stats:233`、`search:141`、`filter:117`、`assets/[id]:105`、`category/[id]:205` |
| c  | admin：`flex flex-wrap items-center justify-between gap-3` | `admin/(dashboard)/page.tsx:51`、`admins:85`、`users:98`、`transactions:72`    |
| c′ | admin 内又有一个纯 `<header>`（无 flex）                           | `audit-logs:62`                                                             |
| d  | **裸 `h1`**，无 header 包裹、无返回                                | `settings/page.tsx:340`                                                     |
| e  | X + 分段控件，无标题                                              | `transactions/new:271`                                                      |

### S-3 · 返回符号语义混用 ★

`←` 用于 `stats` / `search` / `filter` / `assets/[id]` / `category/[id]`；`X` 用于 `transactions/new:272`；`settings` 完全没有返回。

### S-4 · 壳宽度与内边距：三套，且吸底元素各自复制常量 ★★

| 位置                               | 约束                             |
| -------------------------------- | ------------------------------ |
| 用户端壳 `app-shell.tsx:48`          | `max-w-2xl px-4 pt-6`          |
| 筛选页吸底「确定」`filter/page.tsx:209`   | `max-w-2xl px-4 py-3`（**复制**）  |
| 数字键盘 `number-keypad.tsx:35`      | `max-w-2xl px-2`（**复制**）       |
| 抽屉壳 `bottom-sheet.tsx:54`        | `max-w-2xl`（**第三份**）           |
| 后台壳 `admin-shell.tsx:59,110`     | `max-w-6xl px-4 py-3` / `py-6` |
| 登录页 `login:111`、`admin/login:52` | `max-w-md px-4 py-10`          |
| 离线页 `offline:15`                 | `max-w-md **px-6**`            |

### S-5 · 抽底留白是三个互不知晓的魔法值 ★★

- `transactions/new:270` → `pb-[calc(15.5rem+env(safe-area-inset-bottom))]`（键盘高度）
- `filter/page.tsx:116` → `pb-24`
- `app-shell.tsx:48` → `pb-28`（有导航时）

### S-6 · 列表行的内边距有 5 种 ★★★

| 类                        | 位置                                                                   |
| ------------------------ | -------------------------------------------------------------------- |
| `rounded-xl px-1 py-2.5` | `transaction-row.tsx:85`、`category-rank.tsx:36`、`assets/page.tsx:67` |
| `rounded-xl px-2 py-2.5` | `category/[id]:430`、`account-sheet.tsx:111`                          |
| `rounded-xl px-2 py-3`   | `account-sheet.tsx:73`（「不选择账户」首行）                                    |
| `rounded-xl px-3 py-2.5` | `search:261`、`filter:226`                                            |
| `rounded-xl px-3 py-2`   | `settings:385,474,563,619`                                           |

同是「可点的列表行」，左内边距 4 / 8 / 12px 三档、纵向 8 / 10 / 12px 三档。

### S-7 · 区块内间距零散 ★

列表区 `gap-3`（`page.tsx:222`、`search:217`、`assets/[id]:153`、`category/[id]:342`、`bill-list-sheet:167`）；抽屉选项 `gap-1`（`search:251`、`filter:218`、`category/[id]:392`、`account-sheet:104`）；设置页列表 `gap-2`（`settings:381,470,559,615`）、抽屉网格也是 `gap-2`（`account-sheet:68,84`）。

### S-8 · 指标格网格间距与末格跨列不一致 ★★

- 间距：`gap-3`（`search:208`、`assets/[id]:145`、`category/[id]:263`）vs `gap-4`（`stats:294`）
- **末格跨列**：统计页 5 格的最后一项加了 `col-span-2`（`stats:299-303`）；但 `/search` 的 5 格（`search:208-214`）与分类详情的 5 格（`category/[id]:263-269`）**没加**，末尾留半格空位。

---

## 5. 组件样式

### M-1 · 分段控件：方案 §2.4 声明「共用同一套结构」，实际 4 种规格，`/stats` 一页内自相矛盾 ★★★

| 出处                               | 容器                                             | 项                                                              |
| -------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| 记账页类型 `transactions/new:275-290` | `flex flex-1 gap-1 rounded-xl bg-muted/60 p-1` | `flex-1 rounded-lg py-1.5 **text-sm**`，类型色实底                   |
| 统计页「月/年」`stats:240-256`          | `flex gap-1 rounded-xl bg-muted/60 p-1`        | `rounded-lg px-2.5 py-1 **text-xs**`，`bg-background shadow-sm` |
| 统计页口径（上方）`stats:376-392`         | `flex gap-1 ...`                               | `flex-1 rounded-lg py-1.5 **text-sm**`，类型色实底                   |
| **统计页口径（环图下方）** `stats:474-490`  | `flex **justify-center** gap-1 ...`            | `flex-1 rounded-lg py-1.5 **text-xs**`，类型色实底                   |


→ **同一个「支出 / 收入」分段，在同一页出现两次**：一个 `text-sm` 满宽、一个 `text-xs` 居中。

### M-2 · 小胶囊（chip）：同概念用了 3 种圆角、3 种内边距 ★★★

| 类                                                          | 位置                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| `rounded-full border border-border/60 px-3 py-1.5 text-xs` | `search:153,163`、`transactions/new:473`                |
| `rounded-full border px-2.5 py-1 text-xs`                  | `transactions/new:374`（标签）、`bill-list-sheet:235`（排序）   |
| `rounded-full px-3 py-1 text-xs`                           | `category/[id]:245`（时间 tab）                            |
| **`rounded-xl border px-1 py-2 text-xs`**                  | `filter/page.tsx:146`（日期快捷）← 同为「快捷选择胶囊」却用 `rounded-xl` |
| `rounded-xl border px-2 py-3 text-xs`                      | `month-picker.tsx:74`（显示方式）                            |

### M-3 · 选中态两套视觉，同类组件混用 ★★

- **实底**：`bg-blue-500 text-white` —— `category/[id]:247`、`calendar-picker:116,166`、`month-picker:124,149`、`bill-list-sheet:237`
- **浅底彩字**：`bg-blue-500/10 text-blue-600 dark:text-blue-400` —— `search:263`、`filter:227`、`category/[id]:431`、`account-sheet:92,112`、`transactions/new:316`
- **描边**：`border-blue-500/50 bg-blue-500/10`（`filter:149`）、`border-blue-500/40`（`month-picker:76`、`search:154`）

同为「选项被选中」，日期类用实底、筛选类用浅底，且描边深浅不一。

### M-4 · 徽章基类 12px，但有 17 处手动降到 10px ★★

`components/ui/badge.tsx:7` 基类是 `text-xs`（12px）。覆盖成 `text-[10px]` 的调用点：

`admin-shell.tsx:63,67` · `settings/page.tsx:391,481,486,629` · `transaction-row.tsx:99,107,112` · `users/page.tsx:101,185,189` · `admins/page.tsx:133,137,142,147` · `transactions/page.tsx:205` · `audit-logs/page.tsx:138`

基类与实用值不符 —— 说明 12px 这个基类选错了。

### M-5 · 空/错「轻量内联态」重复 8 + 6 次，没收进 `states.tsx` ★★

- `py-6 text-center text-xs text-muted-foreground`：`stats:335,337,403,504`、`category/[id]:281`、`admin/(dashboard)/page.tsx:125,127`、`bill-list-sheet:173`
- `text-center text-xs text-destructive`：`page.tsx:249`、`search:236`、`assets/[id]:174`、`category/[id]:358`、`bill-list-sheet:171,194`

`EmptyBlock` / `ErrorBlock` / `LoadingBlock` 已经集中了「大块」状态，但「图表区内一小行字」这种轻量态没有对应抽象。

### M-6 · 骨架屏与真实列表行已经不是一套版式 ★★

`ListSkeleton`（`states.tsx:26`）打样的是：`rounded-xl border border-border/60 px-3 py-3` + `size-9` 圆形占位。  
但当前真实流水行是（`transaction-row.tsx:85,90`）：`rounded-xl px-1 py-2.5` + **`size-2` 小圆点**、**无边框**。

这是「期 6 把行首从 36px 分类图标改成类型色小圆点」时漏掉的依赖 —— 骨架屏仍按旧版式渲染，数据到达时会有一次可见跳动，恰好违背了该组件注释里「与真实列表行高度接近」的初衷。  
（注：它**恰好**还是对的 —— 对 `/settings` 的 `rounded-xl border px-3 py-2` 行。）

### M-7 · 图表配色来源三类、指示器三种 ★

- 配色来源：硬编码 HEX（`stats:66-67,195`、`admin:18-21`）/ 分类色（`category/[id]:284,310`、`category-rank:58`）/ Tailwind 类（`weekly-bars:27`）
- `ChartTooltip` 的 `indicator`：柱状图 `line`（`stats:361`）· 柱状图 默认（`category/[id]:304`）· 后台柱状图 `dashed`（`admin:144`）· 环形图默认（`stats:417`）

### M-8 · 色点尺寸 8px / 10px 两种 ★

`size-2`（8px）：`transaction-row.tsx:90`（类型色点）、`transactions/new:382`（标签色点）  
`size-2.5`（10px）：`settings:566`（标签色点）、`category/[id]:436`（标签色点）

→ **同一个「标签色点」在记账页 8px、在设置页与筛选抽屉 10px。**

### M-9 · 容器面两种实现：Card 用 ring，自建容器用 border ★

- `Card`：`bg-card` + `ring-1 ring-foreground/10`，**无 border**（`card.tsx:14`）
- 页内自建容器：`rounded-xl border border-border/60`（`search:172` 搜索框、`settings:357,385,474,563,619`、`transactions/new:344`、`filter:51`）
- 弹层：`bg-popover` + `ring-1 ring-foreground/10`（`bottom-sheet.tsx:54`、`dialog.tsx:64`）

`ring-foreground/10` 与 `border-border/60` **不是同一个灰**，同页并排时能看出色差。

---

## 6. 统一规范建议

### 6.1 配色

在 `globals.css` 的 `:root` 里补语义色，并让所有 UI 只引用它：

```css
:root {
  /* 语义色：每色四档，UI 只允许引用这四档 */
  --tone-expense: #f43f5e;  --tone-expense-text: #e11d48;  --tone-expense-soft: oklch(... / 10%);
  --tone-income:  #10b981;  --tone-income-text:  #059669;  --tone-income-soft:  ...;
  --tone-transfer:#3b82f6;  --tone-transfer-text:#2563eb;  --tone-transfer-soft:...;

  /* 面 / 线：只保留两档 */
  --surface: oklch(...);          /* 卡片面，替代 --card 之外的临场搭配 */
  --surface-muted: .../60%;       /* 次级面（按钮底、胶囊底、指标格底） */
  --hairline: .../60%;            /* 所有分隔线 */

  /* 激活态：两条明确规则，不再有第三、第四条 */
  --state-active-solid: var(--tone-transfer);     /* 单值选择：实底 + 白字 */
  --state-active-soft:  .../10% + --tone-transfer-text; /* 多选/筛选标记 */
}
```

配套决定：

1. `--chart-1..5`（灰度、未使用）删除或改建为语义色。
2. 「主操作按钮」到底用 `--primary`（近黑）还是蓝 —— 现在两处都叫强调（C-3）。建议 `--primary` 改为蓝，与应用识别色对齐。
3. **暗色主题：二选一** —— 接上开关，或删掉全部 `dark:` 变体（C-4）。
4. 透明度收敛：容器面 `bg-muted`、交互面 `bg-muted/60`、分隔线 `border-border/60`，其余档位删除（C-5）。

### 6.2 字号阶梯（把 9 / 10 / 11 / 12 四档收敛为两档）

| 名称         | 值                 | 字重                        | 用途                          |
| ---------- | ----------------- | ------------------------- | --------------------------- |
| `display`  | `text-3xl`        | semibold + tracking-tight | Hero 金额（唯一大额）               |
| `title-lg` | `text-lg`         | **semibold**              | 页面标题（含账单页，补 `h1`）           |
| `title`    | `text-base`       | medium                    | 卡片标题 / 抽屉标题 / `DialogTitle` |
| `body`     | `text-sm`         | normal / medium           | 正文、列表主标题、**金额值**            |
| `caption`  | `text-xs`         | normal                    | 次要行、说明文案                    |
| `micro`    | **`text-[10px]`** | normal                    | 徽章、图表标签、柱顶金额、微说明            |

**取消 9px 与 11px**：`category/[id]:317` 的 9px 并入 `micro`；`transaction-row:130,132`、`change-badge`、`category-rank:45`、`weekly-bars:32`、`account-sheet:97`、`calendar-picker:151`、`bottom-nav:65`、admin 三处的 11px 全部并入 `micro` 或 `caption`（按是否参与对齐决定）。

金额字号统一（消除 T-2 的 6 档）：  
`Hero 3xl/semibold` · `卡片主额 xl/semibold` · `指标格与行内 sm/mono`，删掉 `text-lg` 与无字重的 `text-2xl`。

### 6.3 间距

| 位置                | 值                                      |
| ----------------- | -------------------------------------- |
| 页面根容器             | **`gap-4`**（删掉 `gap-5`，统一到 12 处已用的那一套） |
| 页面内区块（列表 section） | `gap-3`                                |
| 卡片内               | `gap-3`（表单）／`gap-2`（分行列表）              |
| 抽屉选项列表            | `gap-1`                                |
| 指标格网格             | `gap-3`，**5 格时末格一律 `col-span-2`**      |
| 列表行（Card 内）       | `px-1 py-2.5`                          |
| 列表行（独立容器内）        | `px-3 py-2`                            |
| 卡片内边距             | 16px（`--card-spacing`，已是默认，不要再临时改）     |

吸底元素：定义 `--shell-max-w: 2rem*?` / `--shell-px` 两个变量（或一个 `LayoutWidth` 常量），  
`app-shell` / `bottom-sheet` / `filter` 吸底条 / `number-keypad` 全部引用它（S-4）；  
底部留白改为引用吸底元素高度变量，不再手写 `15.5rem` / `pb-24` / `pb-28`（S-5）。

### 6.4 组件契约

| 组件                            | 要解决的问题          | 契约                                                                                                                                                           |
| ----------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PageHeader`                  | S-2 / S-3 / T-5 | `{ title, back?, actions?, subtitle? }`；二级页一律 `←` + `h1`，全屏模态（记账）用 `variant="modal"`（`X`，无标题）                                                                |
| `HeroCard`                    | C-2             | `{ label, value, align }`；**对齐默认左**（把资产两页改成左，与账单页一致）                                                                                                         |
| `MetricCell`                  | T-3 / S-8 / T-7 | 合并 `SummaryCell` + `Metric` + `OverviewCell`：`{ label, value, tone?, variant: "box" \| "plain", align, span? }`；值显式 `text-sm`                                |
| `SegmentedControl`            | M-1             | `{ size: "sm" \| "md", tone: "type" \| "neutral", items, value }`；`tone="type"` → 实底类型色；`tone="neutral"` → `bg-background shadow-sm`。**并规定同页同语义只用同一 `size`** |
| `Chip`                        | M-2             | 统一 `rounded-full`；`size="md"`（`px-3 py-1.5`，带图标）/ `size="sm"`（`px-2.5 py-1`，纯文字）；`active` 走 `state-active-*`                                                 |
| `InlineEmpty` / `InlineError` | M-5             | 收进 `components/layout/states.tsx`，供图表区与抽屉内使用                                                                                                                 |
| `Badge`                       | M-4             | 加 `size="sm"`（10px = `micro`），或直接把基类改为 10px；删掉 17 处手工覆盖                                                                                                      |
| `Money`                       | T-2 / D-12      | `<Money cents />` 统一 `font-mono tabular-nums` 与 4 档字号；`pagination.tsx:29-31` 的「共 N 笔」也应使用                                                                    |

另外三项小修：

- `ListSkeleton` 改为匹配当前 `size-2` 小圆点、无边框的行版式（M-6）。
- 标签色点尺寸统一（M-8）：建议全用 `size-2.5`（10px，与 `micro` 字号呼应）。
- 图表的 `indicator` 按图形类型统一：柱状图 `line`、饼图默认（M-7）。

### 6.5 落地顺序

**P0 · 零风险，纯收敛（可一次批量改，不改视觉结构）**

1. 微字号：9px / 11px → 10px 或 12px（T-1）
2. 金额字号 6 档 → 4 档（T-2）
3. 页面根容器统一 `gap-4`（S-1）
4. 列表行内边距 5 种 → 2 种（S-6）
5. `Badge` 恢复一致（M-4）
6. 色点尺寸统一（M-8）
7. 补 `/` 与 `/transactions/new` 的 `h1`（T-5）
8. `filter` 日期胶囊 `rounded-xl` → `rounded-full`（M-2）
9. 指标格网格 `gap-4` → `gap-3`，5 格补 `col-span-2`（S-8）
10. 移除 `font-heading` 或给它真正的字族（T-4）
11. `/stats` 两处口径分段控件的 `size` 对齐（M-1）

**P1 · 抽组件（有回归面，需要走查验证）**  
12\. `HeroCard`（C-2）　13. `MetricCell`（T-3）　14. `SegmentedControl`（M-1）  
15\. `Chip`（M-2）　16. `PageHeader`（S-2）　17. `InlineEmpty`/`InlineError`（M-5）  
18\. `ListSkeleton` 对齐新行版式（M-6）

**P2 · 需要裁决**  
19\. 语义色 token 化 + `--chart-*` 处置（C-1 / A5）  
20\. 暗色主题去留（C-4）  
21\. `--primary` 是近黑还是蓝（C-3）  
22\. 吸底宽度 / 留白变量化（S-4 / S-5）  
23\. 分隔线、面、透明度档位收敛（C-5 / M-9）  
24\. 搜索框与备注行改用 `Input`（T-6）

---

## 7. 与既有文档的关系 / 下一步

- 本次是**样式**维度的走查，功能与元素的差异仍以 [`design-consistency-review.md`](./design-consistency-review.md) 为准，二者无重叠。
- 按项目惯例（见 `docs/interaction-plan.md` §9 / 期 6），上面 **P2 的 6 项需要先裁决**；  
  裁决后应把 §6 的规范文字正式写进 `docs/interaction-plan.md` 的 **§2 全局交互规范**，  
  并作为 **期 7（样式规范收口）** 落地，落地后在 §2 追加「实现期决定（期 7 落地时确认）」小节、更新 §6 进度表。
- P0 的 11 项互相独立、无回归面，可作为期 7 的第一批单独提交。
