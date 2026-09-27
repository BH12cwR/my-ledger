-- =============================================================================
-- 0001_init.sql — 轻记账核心数据模型
--
-- 约定：
--  * 所有主键使用 TEXT（UUID v4），便于端上生成与后续分库。
--  * 所有金额使用 INTEGER 存储「分」（amount_cents），彻底避免浮点误差。
--  * 所有时间戳使用 INTEGER 存储 Unix 毫秒。
--  * 软删除统一使用 deleted_at / archived_at（NULL 表示有效）。
--  * D1 建表语句一条一条执行，不使用事务包裹 DDL 之外的操作。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 用户：普通用户，通过微信开放平台扫码登录
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  openid        TEXT,                                    -- 微信应用内唯一标识
  unionid       TEXT,                                    -- 微信开放平台唯一标识
  nickname      TEXT NOT NULL DEFAULT '记账用户',
  avatar_url    TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  currency      TEXT NOT NULL DEFAULT 'CNY',
  timezone      TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  last_login_at INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_users_openid ON users (openid) WHERE openid IS NOT NULL;
CREATE UNIQUE INDEX idx_users_unionid ON users (unionid) WHERE unionid IS NOT NULL;
CREATE INDEX idx_users_created_at ON users (created_at DESC);

-- ---------------------------------------------------------------------------
-- 管理员：与普通用户完全隔离的独立账户体系
-- password_hash 采用 PBKDF2-SHA256，格式 pbkdf2$sha256$<iterations>$<saltB64>$<hashB64>
-- ---------------------------------------------------------------------------
CREATE TABLE admin_users (
  id                   TEXT PRIMARY KEY,
  username             TEXT NOT NULL,
  display_name         TEXT NOT NULL,
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'auditor')),
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  failed_attempts      INTEGER NOT NULL DEFAULT 0,
  locked_until         INTEGER,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at        INTEGER,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_admin_users_username ON admin_users (username);

-- ---------------------------------------------------------------------------
-- 会话：用户端与后台共用一张表，通过 principal_type 区分，便于统一撤销与审计
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id             TEXT PRIMARY KEY,
  principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'admin')),
  principal_id   TEXT NOT NULL,
  expires_at     INTEGER NOT NULL,
  revoked_at     INTEGER,
  user_agent     TEXT,
  ip             TEXT,
  created_at     INTEGER NOT NULL,
  last_seen_at   INTEGER NOT NULL
);

CREATE INDEX idx_sessions_principal ON sessions (principal_type, principal_id);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- 资金账户：现金 / 银行卡 / 微信 / 支付宝 等
-- ---------------------------------------------------------------------------
CREATE TABLE accounts (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  type                  TEXT NOT NULL DEFAULT 'cash'
                          CHECK (type IN ('cash', 'bank', 'wechat', 'alipay', 'credit', 'other')),
  icon                  TEXT NOT NULL DEFAULT 'wallet',
  initial_balance_cents INTEGER NOT NULL DEFAULT 0,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  archived_at           INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE INDEX idx_accounts_user ON accounts (user_id, sort_order);

-- ---------------------------------------------------------------------------
-- 分类：user_id 为 NULL 表示系统内置分类，所有用户可见；否则为用户自定义分类
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  icon        TEXT NOT NULL DEFAULT 'tag',
  color       TEXT NOT NULL DEFAULT '#64748b',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_categories_scope ON categories (user_id, kind, sort_order);

-- ---------------------------------------------------------------------------
-- 标签：用户自定义，用于跨分类的横向归类（如「出差」「报销」）
-- ---------------------------------------------------------------------------
CREATE TABLE tags (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#64748b',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_tags_user_name ON tags (user_id, name);

-- ---------------------------------------------------------------------------
-- 账目记录
-- happened_on 为 YYYY-MM-DD 冗余字段，用于按自然日聚合与命中索引
-- ---------------------------------------------------------------------------
CREATE TABLE transactions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  account_id       TEXT REFERENCES accounts (id) ON DELETE SET NULL,
  category_id      TEXT REFERENCES categories (id) ON DELETE SET NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'transfer')),
  amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
  currency         TEXT NOT NULL DEFAULT 'CNY',
  note             TEXT,
  happened_at      INTEGER NOT NULL,
  happened_on      TEXT NOT NULL,
  transfer_peer_id TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  deleted_at       INTEGER
);

CREATE INDEX idx_transactions_user_time ON transactions (user_id, happened_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_user_day ON transactions (user_id, happened_on)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_user_category ON transactions (user_id, category_id, happened_on)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_user_account ON transactions (user_id, account_id)
  WHERE deleted_at IS NULL;

CREATE TABLE transaction_tags (
  transaction_id TEXT NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  tag_id         TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE INDEX idx_transaction_tags_tag ON transaction_tags (tag_id);

-- ---------------------------------------------------------------------------
-- 审计日志：管理后台的监控数据来源
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id          TEXT PRIMARY KEY,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('user', 'admin', 'system')),
  actor_id    TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      TEXT,
  ip          TEXT,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_type, actor_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs (action, created_at DESC);