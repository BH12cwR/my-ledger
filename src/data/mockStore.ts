// ============================================
// H5 预览用的内存 mock 数据源
// 字段设计与云函数返回结构完全一致，切换平台无需改前端
// ============================================
import type {
  Account,
  AccountDetail,
  Budget,
  Category,
  CategoryKind,
  HomeSummary,
  StatsOverview,
  Tag,
  Transaction,
  TransactionQuery,
  TransactionView,
  User
} from '@/types/ledger';
import { dateKeyOf, dateKeyToTs, monthKeyOf, recentDateKeys, shiftMonth } from '@/utils/dates';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const pad = (n: number) => String(n).padStart(2, '0');

function dateKeyDaysAgo(days: number): string {
  return dateKeyOf(NOW - days * DAY);
}

/** 指定日期（UTC+8）的某个整点时间戳 */
function tsOf(dateKey: string, hour = 12): number {
  return dateKeyToTs(dateKey) + hour * 3600 * 1000;
}

export const mockUser: User = {
  _id: 'u_1',
  openid: 'mock-openid-0001',
  nickname: '微信用户',
  avatar: 'https://picsum.photos/id/64/200/200',
  createdAt: NOW - 200 * DAY
};

export const mockAccounts: Account[] = [
  { _id: 'a_wx', name: '微信零钱', type: 'wechat', icon: '💬', color: '#07c160', initialBalanceCents: 200000, balanceCents: 0, archived: false, sortOrder: 1 },
  { _id: 'a_alipay', name: '支付宝', type: 'alipay', icon: '🅰️', color: '#1677ff', initialBalanceCents: 150000, balanceCents: 0, archived: false, sortOrder: 2 },
  { _id: 'a_bank', name: '招商银行', type: 'bank', icon: '🏦', color: '#ff8f1f', initialBalanceCents: 800000, balanceCents: 0, archived: false, sortOrder: 3 },
  { _id: 'a_cash', name: '现金', type: 'cash', icon: '💵', color: '#00b578', initialBalanceCents: 50000, balanceCents: 0, archived: false, sortOrder: 4 },
  { _id: 'a_credit', name: '信用卡', type: 'credit', icon: '💳', color: '#f5222d', initialBalanceCents: 0, balanceCents: 0, archived: false, sortOrder: 5 }
];

const expenseCategorySeeds: [string, string, string, string][] = [
  ['c_food', '餐饮', '🍜', '#ff8f1f'],
  ['c_transport', '交通', '🚇', '#1677ff'],
  ['c_shopping', '购物', '🛒', '#eb2f96'],
  ['c_home', '居住', '🏠', '#7a5af8'],
  ['c_fun', '娱乐', '🎬', '#00b8d9'],
  ['c_medical', '医疗', '💊', '#f5222d'],
  ['c_study', '学习', '📚', '#8f6a3d'],
  ['c_other_e', '其他', '📦', '#86909c']
];

const incomeCategorySeeds: [string, string, string, string][] = [
  ['c_salary', '工资', '💼', '#00b578'],
  ['c_bonus', '奖金', '🎁', '#ff8f1f'],
  ['c_invest', '理财', '📈', '#7a5af8'],
  ['c_other_i', '其他', '💰', '#86909c']
];

export const mockCategories: Category[] = [
  ...expenseCategorySeeds.map(([id, name, icon, color], index) => ({
    _id: id,
    name,
    kind: 'expense' as CategoryKind,
    icon,
    color,
    isSystem: true,
    sortOrder: index + 1
  })),
  ...incomeCategorySeeds.map(([id, name, icon, color], index) => ({
    _id: id,
    name,
    kind: 'income' as CategoryKind,
    icon,
    color,
    isSystem: true,
    sortOrder: index + 1
  }))
];

export const mockTags: Tag[] = [
  { _id: 'g_need', name: '必要', color: '#1677ff' },
  { _id: 'g_opt', name: '可选', color: '#ff8f1f' },
  { _id: 'g_reimb', name: '报销', color: '#00b578' }
];

interface Seed {
  d: number;
  h?: number;
  type: Transaction['type'];
  cat?: string;
  acc: string;
  to?: string;
  yuan: number;
  note?: string;
  tags?: string[];
}

const seeds: Seed[] = [
  { d: 0, h: 8, type: 'expense', cat: 'c_food', acc: 'a_wx', yuan: 18, note: '早餐豆浆油条', tags: ['g_need'] },
  { d: 0, h: 12, type: 'expense', cat: 'c_food', acc: 'a_alipay', yuan: 32, note: '公司楼下简餐', tags: ['g_need'] },
  { d: 0, h: 19, type: 'expense', cat: 'c_shopping', acc: 'a_alipay', yuan: 199, note: '日用品补货', tags: ['g_opt'] },
  { d: 1, h: 9, type: 'expense', cat: 'c_transport', acc: 'a_wx', yuan: 6, note: '地铁通勤' },
  { d: 1, h: 21, type: 'expense', cat: 'c_fun', acc: 'a_alipay', yuan: 68, note: '电影票', tags: ['g_opt'] },
  { d: 2, h: 10, type: 'income', cat: 'c_bonus', acc: 'a_bank', yuan: 1200, note: '季度绩效奖金', tags: ['g_need'] },
  { d: 2, h: 13, type: 'expense', cat: 'c_food', acc: 'a_wx', yuan: 45, note: '团队聚餐 AA', tags: ['g_reimb'] },
  { d: 3, h: 11, type: 'expense', cat: 'c_study', acc: 'a_alipay', yuan: 99, note: '技术书籍' },
  { d: 3, h: 20, type: 'expense', cat: 'c_medical', acc: 'a_wx', yuan: 156, note: '感冒药' },
  { d: 4, h: 14, type: 'expense', cat: 'c_home', acc: 'a_bank', yuan: 1800, note: '水电燃气费', tags: ['g_need'] },
  { d: 4, h: 18, type: 'expense', cat: 'c_food', acc: 'a_alipay', yuan: 76, note: '超市食材' },
  { d: 5, h: 9, type: 'expense', cat: 'c_transport', acc: 'a_wx', yuan: 32, note: '打车上班' },
  { d: 5, h: 22, type: 'expense', cat: 'c_fun', acc: 'a_alipay', yuan: 128, note: '视频会员年卡' },
  { d: 6, h: 12, type: 'expense', cat: 'c_food', acc: 'a_wx', yuan: 58, note: '外卖午餐', tags: ['g_need'] },
  { d: 8, h: 10, type: 'income', cat: 'c_invest', acc: 'a_bank', yuan: 236.5, note: '货币基金收益' },
  { d: 9, h: 15, type: 'expense', cat: 'c_shopping', acc: 'a_credit', yuan: 899, note: '换季衣物', tags: ['g_opt'] },
  { d: 10, h: 8, type: 'transfer', acc: 'a_bank', to: 'a_wx', yuan: 500, note: '银行卡转入零钱' },
  { d: 11, h: 19, type: 'expense', cat: 'c_food', acc: 'a_cash', yuan: 24, note: '菜市场' },
  { d: 12, h: 13, type: 'expense', cat: 'c_transport', acc: 'a_wx', yuan: 15, note: '共享单车月卡' },
  { d: 14, h: 11, type: 'expense', cat: 'c_home', acc: 'a_bank', yuan: 3200, note: '房租', tags: ['g_need'] },
  { d: 15, h: 20, type: 'expense', cat: 'c_fun', acc: 'a_alipay', yuan: 260, note: '朋友生日礼物', tags: ['g_opt'] },
  { d: 16, h: 9, type: 'expense', cat: 'c_medical', acc: 'a_credit', yuan: 420, note: '体检套餐' },
  { d: 18, h: 12, type: 'expense', cat: 'c_food', acc: 'a_wx', yuan: 88, note: '周末早午餐' },
  { d: 20, h: 14, type: 'expense', cat: 'c_study', acc: 'a_alipay', yuan: 399, note: '在线课程' },
  { d: 22, h: 10, type: 'expense', cat: 'c_shopping', acc: 'a_credit', yuan: 1260, note: '数码配件', tags: ['g_opt'] },
  { d: 24, h: 18, type: 'expense', cat: 'c_food', acc: 'a_alipay', yuan: 66, note: '火锅 AA' },
  { d: 26, h: 9, type: 'expense', cat: 'c_transport', acc: 'a_wx', yuan: 240, note: '高铁票', tags: ['g_reimb'] },
  { d: 28, h: 15, type: 'expense', cat: 'c_home', acc: 'a_bank', yuan: 156, note: '宽带续费' },
  { d: 30, h: 11, type: 'expense', cat: 'c_fun', acc: 'a_alipay', yuan: 480, note: '短途旅行门票' },
  { d: 33, h: 12, type: 'expense', cat: 'c_food', acc: 'a_wx', yuan: 102, note: '朋友聚餐' },
  { d: 36, h: 10, type: 'income', cat: 'c_salary', acc: 'a_bank', yuan: 18500, note: '月薪', tags: ['g_need'] },
  { d: 40, h: 16, type: 'expense', cat: 'c_shopping', acc: 'a_credit', yuan: 560, note: '家居用品' }
];

export const mockTransactions: Transaction[] = seeds.map((seed, index) => {
  const dateKey = dateKeyDaysAgo(seed.d);
  const happenedAt = tsOf(dateKey, seed.h ?? 12);
  return {
    _id: `t_${index + 1}`,
    type: seed.type,
    amountCents: Math.round(seed.yuan * 100),
    accountId: seed.acc,
    toAccountId: seed.to,
    categoryId: seed.cat,
    tagIds: seed.tags || [],
    happenedAt,
    happenedOn: dateKey,
    monthKey: monthKeyOf(happenedAt),
    note: seed.note || '',
    createdAt: happenedAt
  };
});

// 一条退款记录（退款到微信零钱），用于展示退款态
const refundSource = mockTransactions.find((item) => item.note === '数码配件');
if (refundSource) {
  mockTransactions.push({
    _id: 't_refund_1',
    type: 'income',
    amountCents: 30000,
    accountId: 'a_wx',
    categoryId: 'c_other_i',
    tagIds: [],
    happenedAt: tsOf(dateKeyDaysAgo(20), 11),
    happenedOn: dateKeyDaysAgo(20),
    monthKey: monthKeyOf(tsOf(dateKeyDaysAgo(20), 11)),
    note: '数码配件部分退款',
    refundedFromId: refundSource._id,
    createdAt: tsOf(dateKeyDaysAgo(20), 11)
  });
}

const thisMonth = monthKeyOf(NOW);
const lastMonth = shiftMonth(thisMonth, -1);

export const mockBudgets: Budget[] = [
  { _id: 'b_1', monthKey: thisMonth, categoryId: 'c_food', amountCents: 150000 },
  { _id: 'b_2', monthKey: thisMonth, categoryId: 'c_transport', amountCents: 60000 },
  { _id: 'b_3', monthKey: thisMonth, categoryId: 'c_shopping', amountCents: 200000 },
  { _id: 'b_4', monthKey: thisMonth, amountCents: 600000 },
  { _id: 'b_5', monthKey: lastMonth, amountCents: 600000 }
];

/* ---------------- 派生逻辑 ---------------- */

export function viewOf(t: Transaction): TransactionView {
  const account = mockAccounts.find((item) => item._id === t.accountId);
  const toAccount = mockAccounts.find((item) => item._id === t.toAccountId);
  const category = mockCategories.find((item) => item._id === t.categoryId);
  const tags = mockTags.filter((item) => t.tagIds.includes(item._id));
  return {
    ...t,
    accountName: account ? account.name : '未知账户',
    toAccountName: toAccount ? toAccount.name : undefined,
    categoryName: category ? category.name : t.type === 'transfer' ? '转账' : '未分类',
    categoryIcon: category ? category.icon : t.type === 'transfer' ? '🔄' : '📦',
    categoryColor: category ? category.color : '#86909c',
    tagNames: tags.map((item) => item.name)
  };
}

export function accountWithBalance(): Account[] {
  return mockAccounts.map((account) => {
    let balance = account.initialBalanceCents;
    mockTransactions.forEach((t) => {
      if (t.type === 'expense' && t.accountId === account._id) balance -= t.amountCents;
      if (t.type === 'income' && t.accountId === account._id) balance += t.amountCents;
      if (t.type === 'transfer') {
        if (t.accountId === account._id) balance -= t.amountCents;
        if (t.toAccountId === account._id) balance += t.amountCents;
      }
    });
    return { ...account, balanceCents: balance };
  });
}

function inMonth(monthKey: string, t: Transaction): boolean {
  return t.monthKey === monthKey;
}

export function homeSummary(monthKey: string): HomeSummary {
  const monthTx = mockTransactions.filter((t) => inMonth(monthKey, t));
  const incomeCents = monthTx.filter((t) => t.type === 'income').reduce((a, t) => a + t.amountCents, 0);
  const expenseCents = monthTx.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amountCents, 0);
  const recentDays = recentDateKeys(7).map((dateKey) => ({
    dateKey,
    expenseCents: mockTransactions
      .filter((t) => t.happenedOn === dateKey && t.type === 'expense')
      .reduce((a, t) => a + t.amountCents, 0)
  }));
  const recentTransactions = mockTransactions
    .filter((t) => monthKeyOf(t.happenedAt) === monthKey)
    .sort((a, b) => b.happenedAt - a.happenedAt)
    .slice(0, 8)
    .map(viewOf);
  return {
    monthKey,
    incomeCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents,
    recentDays,
    recentTransactions
  };
}

export function statsOf(monthKey: string, categoryId?: string): StatsOverview {
  const monthTx = mockTransactions.filter((t) => inMonth(monthKey, t) && t.type !== 'transfer');
  const filtered = categoryId ? monthTx.filter((t) => t.categoryId === categoryId) : monthTx;
  const incomeCents = filtered.filter((t) => t.type === 'income').reduce((a, t) => a + t.amountCents, 0);
  const expenseCents = filtered.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amountCents, 0);
  const totalExpense = expenseCents || 1;
  const byCategory = new Map<string, number>();
  filtered
    .filter((t) => t.type === 'expense')
    .forEach((t) => byCategory.set(t.categoryId || 'unknown', (byCategory.get(t.categoryId || 'unknown') || 0) + t.amountCents));
  const categoryRanks = Array.from(byCategory.entries())
    .map(([id, amountCents]) => {
      const category = mockCategories.find((item) => item._id === id);
      return {
        categoryId: id,
        name: category ? category.name : '未分类',
        icon: category ? category.icon : '📦',
        color: category ? category.color : '#86909c',
        amountCents,
        ratio: Math.round((amountCents / totalExpense) * 100)
      };
    })
    .sort((a, b) => b.amountCents - a.amountCents);

  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const trend = Array.from({ length: daysInMonth }, (_, index) => {
    const dateKey = `${monthKey}-${pad(index + 1)}`;
    const dayTx = filtered.filter((t) => t.happenedOn === dateKey);
    return {
      dateKey,
      incomeCents: dayTx.filter((t) => t.type === 'income').reduce((a, t) => a + t.amountCents, 0),
      expenseCents: dayTx.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amountCents, 0)
    };
  });

  return { monthKey, incomeCents, expenseCents, balanceCents: incomeCents - expenseCents, categoryRanks, trend };
}

export function queryTransactions(query: TransactionQuery): TransactionView[] {
  let list = mockTransactions.slice();
  if (query.monthKey) list = list.filter((t) => t.monthKey === query.monthKey);
  if (query.type) list = list.filter((t) => t.type === query.type);
  if (query.categoryId) list = list.filter((t) => t.categoryId === query.categoryId);
  if (query.accountId) list = list.filter((t) => t.accountId === query.accountId || t.toAccountId === query.accountId);
  if (query.tagId) list = list.filter((t) => t.tagIds.includes(query.tagId as string));
  if (typeof query.minAmountCents === 'number') list = list.filter((t) => t.amountCents >= (query.minAmountCents as number));
  if (typeof query.maxAmountCents === 'number') list = list.filter((t) => t.amountCents <= (query.maxAmountCents as number));
  if (query.startDate) list = list.filter((t) => t.happenedOn >= (query.startDate as string));
  if (query.endDate) list = list.filter((t) => t.happenedOn <= (query.endDate as string));
  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase();
    list = list.filter((t) => {
      const view = viewOf(t);
      return (
        t.note.toLowerCase().includes(kw) ||
        view.categoryName.toLowerCase().includes(kw) ||
        view.accountName.toLowerCase().includes(kw) ||
        String(t.amountCents / 100).includes(kw)
      );
    });
  }
  list.sort((a, b) => b.happenedAt - a.happenedAt);
  const skip = query.skip || 0;
  const limit = query.limit || 500;
  return list.slice(skip, skip + limit).map(viewOf);
}

export function accountDetailOf(accountId: string, monthKey?: string): AccountDetail {
  const account = accountWithBalance().find((item) => item._id === accountId) || mockAccounts[0];
  let list = mockTransactions.filter(
    (t) => t.accountId === accountId || t.toAccountId === accountId
  );
  if (monthKey) list = list.filter((t) => t.monthKey === monthKey);
  list.sort((a, b) => b.happenedAt - a.happenedAt);
  const incomeCents = list
    .filter((t) => t.type === 'income' || (t.type === 'transfer' && t.toAccountId === accountId))
    .reduce((a, t) => a + t.amountCents, 0);
  const expenseCents = list
    .filter((t) => t.type === 'expense' || (t.type === 'transfer' && t.accountId === accountId))
    .reduce((a, t) => a + t.amountCents, 0);
  return { account, incomeCents, expenseCents, transactions: list.map(viewOf) };
}

/** 供 save* mock 复用的自增 id */
export function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}`;
}
