// ============================================
// 金额工具：内部统一使用「分」(integer)
// ============================================

/** 分 -> 元字符串，固定两位小数 */
export function centsToYuan(cents: number): string {
  const safe = Math.round(Number(cents) || 0);
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** 分 -> 带千分位的元字符串 */
export function formatCents(cents: number): string {
  const raw = centsToYuan(cents);
  const negative = raw.startsWith('-');
  const body = negative ? raw.slice(1) : raw;
  const [intPart, decPart] = body.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}.${decPart}`;
}

/** 元输入 -> 分（非法输入返回 0） */
export function yuanToCents(input: string | number): number {
  const num = typeof input === 'number' ? input : Number(String(input).replace(/[^\d.-]/g, ''));
  if (!isFinite(num)) return 0;
  return Math.round(num * 100);
}

/** 键盘拼接：把当前输入串追加一个 token，返回新的输入串 */
export function appendAmountToken(current: string, token: string): string {
  if (token === '.') {
    if (current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }
  if (current === '0') return token === '0' ? '0' : token;
  const dotIndex = current.indexOf('.');
  if (dotIndex >= 0 && current.length - dotIndex > 2) return current;
  if (dotIndex < 0 && current.replace('.', '').length >= 9) return current;
  return `${current}${token}`;
}

/** 键盘删除一位 */
export function backspaceAmount(current: string): string {
  if (!current) return '';
  return current.slice(0, -1);
}

export function sumCents(list: number[]): number {
  return list.reduce((acc, cur) => acc + (Number(cur) || 0), 0);
}
