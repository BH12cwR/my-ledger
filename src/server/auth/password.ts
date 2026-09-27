/**
 * 口令哈希与口令策略：PBKDF2-SHA256（Web Crypto，Edge / Workers 原生可用，无原生依赖）。
 *
 * 迭代次数默认 20_000：与 bcrypt cost=10 的开销相当，同时落在 Cloudflare Workers
 * 免费版单请求 10ms CPU 预算的可控范围内。付费版可通过环境变量
 * ADMIN_PBKDF2_ITERATIONS / USER_PBKDF2_ITERATIONS 提高（例如 200_000）。
 *
 * 存储格式：pbkdf2$sha256$<iterations>$<saltBase64>$<hashBase64>
 * 管理员与普通用户共用同一格式，因此同一套哈希与校验逻辑即可覆盖两端。
 */

export const DEFAULT_PBKDF2_ITERATIONS = 20_000;
const KEY_LENGTH_BYTES = 32;
const SALT_LENGTH_BYTES = 16;

/** 口令连续失败次数上限与锁定时长，用户端与管理员端共用同一策略 */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

/** 解析环境变量中的迭代次数，非法值一律回落到默认值 */
export function resolvePbkdf2Iterations(raw?: string): number {
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 1_000_000
    ? parsed
    : DEFAULT_PBKDF2_ITERATIONS;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** 恒定时间比较，避免通过响应耗时侧信道推断哈希 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(
  password: string,
  iterations = DEFAULT_PBKDF2_ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const hash = await deriveKey(password, salt, iterations);
  return `pbkdf2$sha256$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;
  try {
    const salt = base64ToBytes(parts[3]);
    const expected = base64ToBytes(parts[4]);
    const actual = await deriveKey(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** 判断存量哈希是否需要按新的迭代次数重新计算 */
export function needsRehash(stored: string, iterations = DEFAULT_PBKDF2_ITERATIONS): boolean {
  const parts = stored.split("$");
  if (parts.length !== 5) return true;
  return Number(parts[2]) < iterations;
}

/** 口令强度规则：错误提示中的主语 + 长度区间 + 需满足的字符种类数 */
export interface PasswordStrengthRule {
  /** 提示文案的主语，如「管理员」「普通用户」 */
  subject: string;
  minLength: number;
  maxLength: number;
  /** 需满足的字符种类数（小写 / 大写 / 数字 / 符号，共 4 类） */
  minGroups: number;
}

/** 管理员：至少 12 位且覆盖 3 类字符 */
export const ADMIN_PASSWORD_RULE: PasswordStrengthRule = {
  subject: "管理员",
  minLength: 12,
  maxLength: 128,
  minGroups: 3,
};

/** 普通用户：自助注册场景，至少 8 位且覆盖 2 类字符 */
export const USER_PASSWORD_RULE: PasswordStrengthRule = {
  subject: "普通用户",
  minLength: 8,
  maxLength: 128,
  minGroups: 2,
};

const CHINESE_NUMERALS: Record<number, string> = { 2: "两", 3: "三", 4: "四" };

/** 口令强度校验：长度 + 字符种类，避免弱口令；通过时返回 null */
export function validatePasswordStrength(
  password: string,
  rule: PasswordStrengthRule,
): string | null {
  if (password.length < rule.minLength) return `${rule.subject}密码长度至少 ${rule.minLength} 位`;
  if (password.length > rule.maxLength) return `${rule.subject}密码长度不能超过 ${rule.maxLength} 位`;
  const groups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (groups < rule.minGroups) {
    const numeral = CHINESE_NUMERALS[rule.minGroups] ?? String(rule.minGroups);
    return `${rule.subject}密码需包含大写字母、小写字母、数字、符号中的至少${numeral}类`;
  }
  return null;
}

export function validateAdminPasswordStrength(password: string): string | null {
  return validatePasswordStrength(password, ADMIN_PASSWORD_RULE);
}

export function validateUserPasswordStrength(password: string): string | null {
  return validatePasswordStrength(password, USER_PASSWORD_RULE);
}