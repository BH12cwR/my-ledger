// 云函数 getHomeSummary：首页汇总（本月收支、近七日支出、最近流水）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const TZ = 480 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000
const pad = (n) => String(n).padStart(2, '0')

function dateKeyOf(ts) {
  const d = new Date(ts + TZ)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function monthKeyOf(ts) {
  return dateKeyOf(ts).slice(0, 7)
}

async function loadMaps(openid) {
  const [accounts, categories, tags] = await Promise.all([
    db.collection('accounts').where({ _openid: openid }).limit(1000).get(),
    db.collection('categories').where({ _openid: openid }).limit(1000).get(),
    db.collection('tags').where({ _openid: openid }).limit(1000).get()
  ])
  const accountMap = {}
  const categoryMap = {}
  const tagMap = {}
  accounts.data.forEach((item) => { accountMap[item._id] = item })
  categories.data.forEach((item) => { categoryMap[item._id] = item })
  tags.data.forEach((item) => { tagMap[item._id] = item })
  return { accountMap, categoryMap, tagMap }
}

function buildView(t, accountMap, categoryMap, tagMap) {
  const account = accountMap[t.accountId]
  const toAccount = accountMap[t.toAccountId]
  const category = categoryMap[t.categoryId]
  const tagNames = (t.tagIds || []).map((id) => (tagMap[id] ? tagMap[id].name : '')).filter(Boolean)
  return Object.assign({}, t, {
    accountName: account ? account.name : '未知账户',
    toAccountName: toAccount ? toAccount.name : undefined,
    categoryName: category ? category.name : t.type === 'transfer' ? '转账' : '未分类',
    categoryIcon: category ? category.icon : t.type === 'transfer' ? '🔄' : '📦',
    categoryColor: category ? category.color : '#86909c',
    tagNames
  })
}

function sumCents(list, predicate) {
  return list.filter(predicate).reduce((acc, item) => acc + item.amountCents, 0)
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) throw new Error('未获取到用户身份')

    const monthKey = (event && event.monthKey) || monthKeyOf(Date.now())
    const { accountMap, categoryMap, tagMap } = await loadMaps(openid)

    const monthRes = await db.collection('transactions')
      .where({ _openid: openid, monthKey })
      .limit(1000)
      .get()
    const monthTx = monthRes.data

    const incomeCents = sumCents(monthTx, (item) => item.type === 'income')
    const expenseCents = sumCents(monthTx, (item) => item.type === 'expense')

    const now = Date.now()
    const dateKeys = []
    for (let i = 6; i >= 0; i--) dateKeys.push(dateKeyOf(now - i * DAY))

    const recentRes = await db.collection('transactions')
      .where({ _openid: openid, happenedOn: _.in(dateKeys) })
      .limit(1000)
      .get()

    const recentDays = dateKeys.map((dateKey) => ({
      dateKey,
      expenseCents: sumCents(recentRes.data, (item) => item.happenedOn === dateKey && item.type === 'expense')
    }))

    const recentTransactions = monthTx
      .slice()
      .sort((a, b) => b.happenedAt - a.happenedAt)
      .slice(0, 8)
      .map((item) => buildView(item, accountMap, categoryMap, tagMap))

    return {
      code: 0,
      message: 'success',
      data: {
        monthKey,
        incomeCents,
        expenseCents,
        balanceCents: incomeCents - expenseCents,
        recentDays,
        recentTransactions
      }
    }
  } catch (err) {
    console.error('[getHomeSummary] error:', err)
    return { code: -1, message: (err && err.message) || '服务异常', data: null }
  }
}
