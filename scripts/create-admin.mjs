#!/usr/bin/env node
/**
 * 管理员引导脚本。
 *
 * 管理员账号体系与普通用户完全隔离，且不允许通过公开 API 自助注册，
 * 因此首个（以及应急新增的）管理员只能由运维人员在本机执行本脚本写入 D1。
 *
 * 用法：
 *   node scripts/create-admin.mjs --username admin --name 系统管理员 --role super_admin
 *   # 口令交互式输入（推荐，避免出现在 shell 历史里）
 *   ADMIN_PASSWORD='xxxx' node scripts/create-admin.mjs --username admin --remote
 *
 * 常用参数：
 *   --username <name>   必填，3-50 位，仅允许字母/数字/下划线/点/中划线
 *   --name <display>    显示名称，默认取 username
 *   --role <role>       super_admin | admin | auditor，默认 super_admin
 *   --password <pwd>    不传则读 ADMIN_PASSWORD，再没有则交互式输入
 *   --remote            写入线上 D1（默认写本地开发库）
 *   --database <name>   D1 数据库名，默认 my-ledger-db
 */

import { spawnSync } from "node:child_process";
import { webcrypto } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const PBKDF2_ITERATIONS = 20_000;
const KEY_LENGTH_BYTES = 32;
const SALT_LENGTH_BYTES = 16;
const ROLES = new Set(["super_admin", "admin", "auditor"]);

function parseArgs(argv) {
  const args = { role: "super_admin", database: "my-ledger-db", remote: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--remote") {
      args.remote = true;
      continue;
    }
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`参数 --${key} 缺少取值`);
    }
    args[key] = value;
    i++;
  }
  return args;
}

function toBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

/** 与 src/server/auth/password.ts 完全一致的哈希格式，保证服务端可校验 */
async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const keyMaterial = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH_BYTES * 8,
  );
  return `pbkdf2$sha256$${iterations}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}

function validatePassword(password) {
  if (password.length < 12) throw new Error("管理员密码长度至少 12 位");
  if (password.length > 128) throw new Error("管理员密码长度不能超过 128 位");
  const groups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (groups < 3) throw new Error("管理员密码需包含大写字母、小写字母、数字、符号中的至少三类");
}

async function readPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question("请输入管理员密码（不会回显到日志）：")).trim();
  } finally {
    rl.close();
  }
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runWrangler(sql, database, remote) {
  // 通过临时文件而不是 --command 传递 SQL：Windows 的 shell 会把带空格的
  // --command 取值按空格拆开，导致 wrangler 收到一堆无法解析的位置参数。
  const sqlFile = join(tmpdir(), `my-ledger-create-admin-${Date.now()}.sql`);
  writeFileSync(sqlFile, sql, "utf8");

  // 直接调用 wrangler 的入口脚本，不经过 npx / shell：
  // 既不受 Windows 脚本执行策略影响（npm.ps1 会被拦截），也避免了参数拼接风险。
  const wranglerBin = join(PROJECT_ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
  let status;
  try {
    const result = spawnSync(
      process.execPath,
      [
        wranglerBin,
        "d1",
        "execute",
        database,
        remote ? "--remote" : "--local",
        "--yes",
        `--file=${sqlFile}`,
      ],
      { stdio: "inherit", cwd: PROJECT_ROOT },
    );
    status = result.status;
  } finally {
    rmSync(sqlFile, { force: true });
  }

  if (status !== 0) {
    throw new Error(`wrangler 执行失败，退出码 ${status ?? "unknown"}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const username = args.username?.trim();
  if (!username) throw new Error("必须通过 --username 指定管理员用户名");
  if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) {
    throw new Error("用户名需为 3-50 位的字母、数字、下划线、点或中划线");
  }

  const displayName = (args.name ?? username).trim();
  const role = args.role ?? "super_admin";
  if (!ROLES.has(role)) throw new Error(`role 只能是 ${[...ROLES].join(" / ")}`);

  const password = args.password ?? (await readPassword());
  validatePassword(password);

  const passwordHash = await hashPassword(password);
  const now = Date.now();
  const id = webcrypto.randomUUID();

  // ON CONFLICT 让脚本可重复执行：既用于初始化，也用于忘记口令时的应急重置
  const sql = `
    INSERT INTO admin_users
      (id, username, display_name, password_hash, role, status,
       failed_attempts, locked_until, must_change_password, last_login_at, created_at, updated_at)
    VALUES (
      ${sqlQuote(id)}, ${sqlQuote(username)}, ${sqlQuote(displayName)},
      ${sqlQuote(passwordHash)}, ${sqlQuote(role)}, 'active',
      0, NULL, 1, NULL, ${now}, ${now}
    )
    ON CONFLICT (username) DO UPDATE SET
      display_name    = excluded.display_name,
      password_hash   = excluded.password_hash,
      role            = excluded.role,
      status          = 'active',
      failed_attempts = 0,
      locked_until    = NULL,
      updated_at      = excluded.updated_at;
  `.replace(/\s+/g, " ").trim();

  console.log(`\n[create-admin] 目标：${args.remote ? "线上 D1" : "本地 D1"} / 数据库：${args.database}`);
  console.log(`[create-admin] 用户名：${username}　角色：${role}　口令强度校验：通过`);
  runWrangler(sql, args.database, Boolean(args.remote));
  console.log(
    `\n[create-admin] 完成。该账号首次登录后建议立即修改密码（must_change_password = 1）。\n` +
      `[create-admin] 后台入口：/admin/login\n`,
  );
}

main().catch((error) => {
  console.error(`\n[create-admin] 失败：${error.message}\n`);
  process.exit(1);
});