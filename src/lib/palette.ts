/**
 * 分类 / 标签的可选颜色。
 *
 * 这些 HEX 会写进数据库、按字符串存，因此不做 token 映射 ——
 * 它们属于「用户数据」而不是「设计系统」。
 *
 * `NEUTRAL_COLOR` 同时是「没有颜色」时的兜底（如账户图标圆）。
 * 之前设置页调色板的第一格是 `#64748b`、`category-icon` 的兜底是 `#94a3b8`，
 * 两个不同的灰表达同一件事，这里统一到调色板第一格。
 */
export const COLOR_PALETTE: readonly string[] = [
  "#64748b",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

/** 无颜色时的兜底色 */
export const NEUTRAL_COLOR = COLOR_PALETTE[0];
