-- =============================================================================
-- dev_seed.sql — 本地开发演示数据
--
-- 用法：npm run db:seed:local   （等价于 wrangler d1 execute my-ledger-db --local --file=./seeds/dev_seed.sql）
--
-- 设计要点：
--  * 全部使用固定主键 + INSERT OR IGNORE，脚本可重复执行而不会产生重复数据。
--  * 演示用户的 openid 为 `dev:演示用户`，与 /api/auth/dev-login 的账号规则一致，
--    因此本地用昵称「演示用户」登录时，会直接复用这份数据。
--  * 账目按「距今 N 天」相对生成，随时执行都能落在最近 30 天的统计区间内。
--  * 金额单位是「分」，与线上口径完全一致，不存在演示数据与真实逻辑的偏差。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 演示用户（45 天前注册）
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO users
  (id, openid, unionid, nickname, avatar_url, status, currency, timezone, last_login_at, created_at, updated_at)
VALUES
  ('user_demo_0001', 'dev:演示用户', NULL, '演示用户', NULL, 'active', 'CNY', 'Asia/Shanghai',
   CAST(strftime('%s','now') AS INTEGER) * 1000,
   (CAST(strftime('%s','now') AS INTEGER) - 45 * 86400) * 1000,
   CAST(strftime('%s','now') AS INTEGER) * 1000);

-- 给演示用户补上账号密码登录能力：用户名 demo / 密码 demo1234。
-- 上面的 INSERT OR IGNORE 对已存在的行不生效，因此这里用 UPDATE 兜底，
-- 保证脚本重复执行时也能把凭据补齐（哈希格式与线上 PBKDF2 口径一致）。
UPDATE users
   SET username            = 'demo',
       password_hash       = 'pbkdf2$sha256$20000$DWI0ARhPd7ngFJlPjmXMHw==$s4FiHjc8qGy8QnYd3LxhMEVyk2WquP0+wH7YCozYXHM=',
       failed_attempts     = 0,
       locked_until        = NULL,
       password_updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
 WHERE id = 'user_demo_0001';

-- ---------------------------------------------------------------------------
-- 资金账户
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO accounts
  (id, user_id, name, type, icon, initial_balance_cents, sort_order, archived_at, created_at, updated_at)
VALUES
  ('acc_demo_cash',   'user_demo_0001', '现金',     'cash',   'banknote',       50000, 10, NULL,
   CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('acc_demo_wechat', 'user_demo_0001', '微信钱包', 'wechat', 'message-circle', 120000, 20, NULL,
   CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('acc_demo_alipay', 'user_demo_0001', '支付宝',   'alipay', 'wallet',          80000, 30, NULL,
   CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('acc_demo_bank',   'user_demo_0001', '招商银行', 'bank',   'landmark',      2600000, 40, NULL,
   CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);

-- ---------------------------------------------------------------------------
-- 标签
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO tags (id, user_id, name, color, created_at, updated_at) VALUES
  ('tag_demo_large',     'user_demo_0001', '大额',   '#f97316',
   CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('tag_demo_reimburse', 'user_demo_0001', '可报销', '#22c55e',
   CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);

-- ---------------------------------------------------------------------------
-- 账目明细
-- happened_on 为 UTC+8 下的业务日，happened_at 为对应毫秒时间戳
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO transactions
  (id, user_id, account_id, category_id, kind, amount_cents, currency, note,
   happened_at, happened_on, transfer_peer_id, created_at, updated_at, deleted_at)
VALUES
  ('tx_demo_01', 'user_demo_0001', 'acc_demo_bank',   'cat_sys_income_salary',        'income',  1850000, 'CNY', '八月工资',
   (CAST(strftime('%s','now') AS INTEGER) - 28 * 86400) * 1000, date('now', '+8 hours', '-28 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_02', 'user_demo_0001', 'acc_demo_wechat', 'cat_sys_expense_food',         'expense',    3860, 'CNY', '楼下快餐',
   (CAST(strftime('%s','now') AS INTEGER) - 27 * 86400) * 1000, date('now', '+8 hours', '-27 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_03', 'user_demo_0001', 'acc_demo_alipay', 'cat_sys_expense_transport',    'expense',    1200, 'CNY', '地铁通勤',
   (CAST(strftime('%s','now') AS INTEGER) - 26 * 86400) * 1000, date('now', '+8 hours', '-26 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_04', 'user_demo_0001', 'acc_demo_alipay', 'cat_sys_expense_shopping',     'expense',   29900, 'CNY', '运动鞋',
   (CAST(strftime('%s','now') AS INTEGER) - 25 * 86400) * 1000, date('now', '+8 hours', '-25 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_05', 'user_demo_0001', 'acc_demo_wechat', 'cat_sys_expense_food',         'expense',    6850, 'CNY', '朋友聚餐',
   (CAST(strftime('%s','now') AS INTEGER) - 24 * 86400) * 1000, date('now', '+8 hours', '-24 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_06', 'user_demo_0001', 'acc_demo_bank',   'cat_sys_expense_housing',      'expense',  180000, 'CNY', '房租',
   (CAST(strftime('%s','now') AS INTEGER) - 22 * 86400) * 1000, date('now', '+8 hours', '-22 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_07', 'user_demo_0001', 'acc_demo_alipay', 'cat_sys_expense_communication','expense',    9900, 'CNY', '手机话费',
   (CAST(strftime('%s','now') AS INTEGER) - 21 * 86400) * 1000, date('now', '+8 hours', '-21 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_08', 'user_demo_0001', 'acc_demo_wechat', 'cat_sys_income_redpacket',     'income',    20000, 'CNY', '朋友红包',
   (CAST(strftime('%s','now') AS INTEGER) - 20 * 86400) * 1000, date('now', '+8 hours', '-20 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_09', 'user_demo_0001', 'acc_demo_wechat', 'cat_sys_expense_entertainment','expense',    6800, 'CNY', '电影票',
   (CAST(strftime('%s','now') AS INTEGER) - 18 * 86400) * 1000, date('now', '+8 hours', '-18 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_10', 'user_demo_0001', 'acc_demo_wechat', 'cat_sys_expense_food',         'expense',    2450, 'CNY', '早餐',
   (CAST(strftime('%s','now') AS INTEGER) - 17 * 86400) * 1000, date('now', '+8 hours', '-17 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_11', 'user_demo_0001', 'acc_demo_alipay', 'cat_sys_expense_medical',      'expense',   15600, 'CNY', '感冒药',
   (CAST(strftime('%s','now') AS INTEGER) - 15 * 86400) * 1000, date('now', '+8 hours', '-15 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_12', 'user_demo_0001', 'acc_demo_alipay', 'cat_sys_expense_education',    'expense',   39900, 'CNY', '在线课程',
   (CAST(strftime('%s','now') AS INTEGER) - 14 * 86400) * 1000, date('now', '+8 hours', '-14 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_13', 'user_demo_0001', 'acc_demo_wechat', 'cat_sys_expense_social',       'expense',   50000, 'CNY', '同事随礼',
   (CAST(strftime('%s','now') AS INTEGER) - 12 * 86400) * 1000, date('now', '+8 hours', '-12 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_14', 'user_demo_0001', 'acc_demo_alipay', 'cat_sys_expense_transport',    'expense',    4600, 'CNY', '打车',
   (CAST(strftime('%s','now') AS INTEGER) - 10 * 86400) * 1000, date('now', '+8 hours', '-10 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_15', 'user_demo_0001', 'acc_demo_wechat', 'cat_sys_expense_food',         'expense',    5230, 'CNY', '外卖',
   (CAST(strftime('%s','now') AS INTEGER) - 9 * 86400) * 1000, date('now', '+8 hours', '-9 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_16', 'user_demo_0001', 'acc_demo_bank',   'cat_sys_income_parttime',      'income',    80000, 'CNY', '接单收入',
   (CAST(strftime('%s','now') AS INTEGER) - 7 * 86400) * 1000, date('now', '+8 hours', '-7 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_17', 'user_demo_0001', 'acc_demo_alipay', 'cat_sys_expense_shopping',     'expense',   12900, 'CNY', '日用品补货',
   (CAST(strftime('%s','now') AS INTEGER) - 6 * 86400) * 1000, date('now', '+8 hours', '-6 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_18', 'user_demo_0001', 'acc_demo_wechat', 'cat_sys_expense_pet',          'expense',   23800, 'CNY', '猫粮',
   (CAST(strftime('%s','now') AS INTEGER) - 5 * 86400) * 1000, date('now', '+8 hours', '-5 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_19', 'user_demo_0001', 'acc_demo_bank',   'cat_sys_expense_travel',       'expense',  120000, 'CNY', '周末短途旅行',
   (CAST(strftime('%s','now') AS INTEGER) - 4 * 86400) * 1000, date('now', '+8 hours', '-4 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_20', 'user_demo_0001', 'acc_demo_wechat', 'cat_sys_expense_food',         'expense',    4180, 'CNY', '午餐',
   (CAST(strftime('%s','now') AS INTEGER) - 3 * 86400) * 1000, date('now', '+8 hours', '-3 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_21', 'user_demo_0001', 'acc_demo_alipay', 'cat_sys_expense_transport',    'expense',    1500, 'CNY', '公交',
   (CAST(strftime('%s','now') AS INTEGER) - 2 * 86400) * 1000, date('now', '+8 hours', '-2 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_22', 'user_demo_0001', 'acc_demo_wechat', 'cat_sys_expense_food',         'expense',    8800, 'CNY', '火锅',
   (CAST(strftime('%s','now') AS INTEGER) - 1 * 86400) * 1000, date('now', '+8 hours', '-1 day'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_23', 'user_demo_0001', 'acc_demo_wechat', 'cat_sys_expense_food',         'expense',    2600, 'CNY', '早餐',
   CAST(strftime('%s','now') AS INTEGER) * 1000, date('now', '+8 hours'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL),
  ('tx_demo_24', 'user_demo_0001', 'acc_demo_alipay', 'cat_sys_income_refund',        'income',     9900, 'CNY', '订单退款',
   CAST(strftime('%s','now') AS INTEGER) * 1000, date('now', '+8 hours'), NULL, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL);

-- ---------------------------------------------------------------------------
-- 标签关联
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES
  ('tx_demo_06', 'tag_demo_large'),
  ('tx_demo_19', 'tag_demo_large'),
  ('tx_demo_12', 'tag_demo_reimburse');

-- ---------------------------------------------------------------------------
-- 审计日志样例，用于后台监控页展示
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO audit_logs
  (id, actor_type, actor_id, action, target_type, target_id, detail, ip, user_agent, created_at)
VALUES
  ('audit_demo_01', 'user', 'user_demo_0001', 'user.login.dev', 'user', 'user_demo_0001',
   '{"source":"seed"}', '127.0.0.1', 'seed-script',
   (CAST(strftime('%s','now') AS INTEGER) - 2 * 86400) * 1000),
  ('audit_demo_02', 'system', NULL, 'admin.login.failed', 'admin_user', 'unknown',
   '{"reason":"unknown_username"}', '127.0.0.1', 'seed-script',
   (CAST(strftime('%s','now') AS INTEGER) - 1 * 86400) * 1000);