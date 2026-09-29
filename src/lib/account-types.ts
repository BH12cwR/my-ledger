/** 账户类型的中文标签，与「我的 → 账户」表单里的选项保持一致 */

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash: "现金",
  bank: "银行卡",
  wechat: "微信",
  alipay: "支付宝",
  credit: "信用卡",
  other: "其他",
};

export function accountTypeLabel(type: string | null | undefined): string {
  if (!type) return ACCOUNT_TYPE_LABELS.other;
  return ACCOUNT_TYPE_LABELS[type] ?? type;
}
