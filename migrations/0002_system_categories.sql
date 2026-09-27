-- =============================================================================
-- 0002_system_categories.sql — 内置分类（参照数据，所有用户共享）
--
-- user_id 为 NULL 即代表系统内置分类；用户不可修改或删除，但可以基于它创建
-- 自己的同名自定义分类。id 使用稳定的可读主键，便于后续业务代码直接引用。
-- =============================================================================

INSERT INTO categories (id, user_id, name, kind, icon, color, sort_order, archived_at, created_at, updated_at) VALUES
  -- 支出
  ('cat_sys_expense_food',        NULL, '餐饮',     'expense', 'utensils',        '#f97316', 10, NULL, 1758902400000, 1758902400000),
  ('cat_sys_expense_transport',   NULL, '交通',     'expense', 'bus',             '#0ea5e9', 20, NULL, 1758902400000, 1758902400000),
  ('cat_sys_expense_shopping',    NULL, '购物',     'expense', 'shopping-bag',    '#ec4899', 30, NULL, 1758902400000, 1758902400000),
  ('cat_sys_expense_housing',     NULL, '居住',     'expense', 'house',           '#8b5cf6', 40, NULL, 1758902400000, 1758902400000),
  ('cat_sys_expense_communication', NULL, '通讯',   'expense', 'smartphone',      '#14b8a6', 50, NULL, 1758902400000, 1758902400000),
  ('cat_sys_expense_entertainment', NULL, '娱乐',   'expense', 'gamepad-2',       '#f43f5e', 60, NULL, 1758902400000, 1758902400000),
  ('cat_sys_expense_medical',     NULL, '医疗',     'expense', 'heart-pulse',     '#ef4444', 70, NULL, 1758902400000, 1758902400000),
  ('cat_sys_expense_education',   NULL, '教育',     'expense', 'graduation-cap',  '#6366f1', 80, NULL, 1758902400000, 1758902400000),
  ('cat_sys_expense_social',      NULL, '人情往来', 'expense', 'gift',            '#d946ef', 90, NULL, 1758902400000, 1758902400000),
  ('cat_sys_expense_travel',      NULL, '旅行',     'expense', 'plane',           '#22c55e', 100, NULL, 1758902400000, 1758902400000),
  ('cat_sys_expense_pet',         NULL, '宠物',     'expense', 'paw-print',       '#a16207', 110, NULL, 1758902400000, 1758902400000),
  ('cat_sys_expense_other',       NULL, '其他支出', 'expense', 'circle-ellipsis', '#64748b', 999, NULL, 1758902400000, 1758902400000),
  -- 收入
  ('cat_sys_income_salary',       NULL, '工资',     'income',  'briefcase',       '#22c55e', 10, NULL, 1758902400000, 1758902400000),
  ('cat_sys_income_bonus',        NULL, '奖金',     'income',  'trophy',          '#eab308', 20, NULL, 1758902400000, 1758902400000),
  ('cat_sys_income_parttime',     NULL, '兼职',     'income',  'hammer',          '#0ea5e9', 30, NULL, 1758902400000, 1758902400000),
  ('cat_sys_income_investment',   NULL, '投资收益', 'income',  'trending-up',     '#f97316', 40, NULL, 1758902400000, 1758902400000),
  ('cat_sys_income_redpacket',    NULL, '红包',     'income',  'gift',            '#ef4444', 50, NULL, 1758902400000, 1758902400000),
  ('cat_sys_income_refund',       NULL, '退款',     'income',  'rotate-ccw',      '#14b8a6', 60, NULL, 1758902400000, 1758902400000),
  ('cat_sys_income_other',        NULL, '其他收入', 'income',  'circle-ellipsis', '#64748b', 999, NULL, 1758902400000, 1758902400000);