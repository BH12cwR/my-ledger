-- =============================================================================
-- 0004_budgets.sql — 预算（周期性限额）
--
-- 语义：一条预算代表「每个自然月 / 自然年」循环生效的限额，不按周期存多行；
-- 当前周期的已用金额由统计服务在查询时根据 transactions 实时聚合得出。
--  * category_id 为 NULL 表示「总预算」（该周期内全部支出的合计限额）；
--    否则为某个分类的预算。
--  * period 取 monthly（当月 1 日起）或 yearly（当年 1/1 起），区间右端为业务日。
--  * 唯一约束按 (user_id, period, category_id) 生效，用 COALESCE 把 NULL 归一为 ''
--    以规避 SQLite 中多行 NULL 互不冲突的问题。
-- =============================================================================

CREATE TABLE budgets (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id  TEXT REFERENCES categories (id) ON DELETE CASCADE,
  period       TEXT NOT NULL CHECK (period IN ('monthly', 'yearly')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_budgets_unique ON budgets (user_id, period, COALESCE(category_id, ''));
CREATE INDEX idx_budgets_user ON budgets (user_id, period);
