/** 分类/账户可选的标签色板 */
export const PALETTE: string[] = [
  '#1677ff',
  '#00b578',
  '#ff8f1f',
  '#f5222d',
  '#7a5af8',
  '#00b8d9',
  '#eb2f96',
  '#8f6a3d',
  '#5f6b7a',
  '#52c41a'
];

export function pickColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

/** 分类图标候选 */
export const CATEGORY_ICONS: string[] = [
  '🍜', '🍔', '🛒', '🚇', '🚗', '🏠', '💡', '📱', '👕', '💊',
  '🎬', '✈️', '📚', '🎁', '💰', '🧧', '💼', '📈', '🏋️', '🐱'
];
