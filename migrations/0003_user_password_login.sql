-- =============================================================================
-- 0003_user_password_login.sql — 普通用户支持账号密码登录
--
-- 背景：用户端此前只有微信 OAuth 与本地开发模拟登录，users 表没有任何凭据字段。
-- 本迁移为其补充用户名 + 口令登录能力，字段语义与 admin_users 保持一致，
-- 因此可直接复用同一套 PBKDF2 哈希与失败锁定策略。
--
-- 设计要点：
--  * 口令存储格式与 admin_users.password_hash 完全相同：
--      pbkdf2$sha256$<iterations>$<saltBase64>$<hashBase64>
--  * username / password_hash 可空：微信账号不需要密码，两类账号互不干扰。
--  * 唯一性用「部分索引」而非列上的 UNIQUE，避免多个 NULL 之间互相冲突。
--  * 失败次数与锁定时间落在 users 行上，无需额外的限流中间件。
-- =============================================================================

ALTER TABLE users ADD COLUMN username            TEXT;
ALTER TABLE users ADD COLUMN password_hash       TEXT;
ALTER TABLE users ADD COLUMN failed_attempts     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until        INTEGER;
ALTER TABLE users ADD COLUMN password_updated_at INTEGER;

CREATE UNIQUE INDEX idx_users_username ON users (username) WHERE username IS NOT NULL;
