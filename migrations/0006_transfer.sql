-- =============================================================================
-- 0006_transfer.sql — 转账类型落地
--
-- 语义：一笔转账是「单条记录 + 转入账户」的模型：
--  * account_id    表示转出账户（沿用既有列，语义收窄为「转出」）；
--  * to_account_id 表示转入账户（新增列）；
--  * 金额以正数存储，getAccountBalances 对转出账户扣减、对转入账户增加。
--
-- 早期为「双向关联」预留的 transfer_peer_id 从未写入过数据，这里直接删除，
-- 避免留下一个语义冲突的空列。该列无索引、无外键引用，删除是安全的。
-- =============================================================================

ALTER TABLE transactions ADD COLUMN to_account_id TEXT REFERENCES accounts (id) ON DELETE SET NULL;

ALTER TABLE transactions DROP COLUMN transfer_peer_id;

CREATE INDEX idx_transactions_to_account ON transactions (to_account_id)
  WHERE to_account_id IS NOT NULL;
