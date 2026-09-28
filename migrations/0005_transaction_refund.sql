-- =============================================================================
-- 0005_transaction_refund.sql — 支出退款
--
-- 语义：一笔支出被退款时，不改动原记录金额，而是新增一笔等额的「退款」收入
-- （refund_of_id 指向原支出），并把原支出的 refunded_at 打上时间戳。
-- 这样：
--  * 明细中两条都在，收支自动抵消，账户余额无需额外修正；
--  * 原支出被标记为已退款，不可重复退款；
--  * 原记录金额保持不变，历史统计口径可追溯。
-- =============================================================================

ALTER TABLE transactions ADD COLUMN refund_of_id TEXT REFERENCES transactions (id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN refunded_at INTEGER;

CREATE INDEX idx_transactions_refund_of ON transactions (refund_of_id)
  WHERE refund_of_id IS NOT NULL;
