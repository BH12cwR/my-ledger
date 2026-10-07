// 云函数 getAccountDetail：单个账户详情（余额、期间收支、关联流水）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

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
  return { accounts: accounts.data, accountMap, categoryMap, tagMap }
}

function balanceOf(account, transactions) {
  let balance = account.initialBalanceCents || 0
  transactions.forEach((t) => {
    if (t.type === 'expense' && t.accountId === account._id) balance -= t.amountCents
    if (t.type === 'income' && t.accountId === account._id) balance += t.amountCents
    if (t.type === 'transfer') {
      if (t.accountId === account._id) balance -= t.amountCents
      if (t.toAccountId === account._id) balance += t.amountCents
    }
  })
  return balance
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

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) throw new Error('未获取到用户身份')

    const data = event || {}
    if (!data.accountId) throw new Error('缺少账户 ID')

    const { accounts, accountMap, categoryMap, tagMap } = await loadMaps(openid)
    const txRes = await db.collection('transactions').where({ _openid: openid }).limit(1000).get()
    const allTx = txRes.data

    const list = accounts
      .map((account) => Object.assign({}, account, { balanceCents: balanceOf(account, allTx) }))
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const account = list.find((item) => item._id === data.accountId) || list[0]
    if (!account) throw new Error('账户不存在')

    let records = allTx.filter(
      (t) => t.accountId === account._id || t.toAccountId === account._id
    )
    if (data.monthKey) records = records.filter((t) => t.monthKey === data.monthKey)
    records.sort((a, b) => b.happenedAt - a.happenedAt)

    const incomeCents = records
      .filter((t) => t.type === 'income' || (t.type === 'transfer' && t.toAccountId === account._id))
      .reduce((acc, t) => acc + t.amountCents, 0)
    const expenseCents = records
      .filter((t) => t.type === 'expense' || (t.type === 'transfer' && t.accountId === account._id))
      .reduce((acc, t) => acc + t.amountCents, 0)

    return {
      code: 0,
      message: 'success',
      data: {
        account,
        incomeCents,
        expenseCents,
        transactions: records.map((item) => buildView(item, accountMap, categoryMap, tagMap))
      }
    }
  } catch (err) {
    console.error('[getAccountDetail] error:', err)
    return { code: -1, message: (err && err.message) || '服务异常', data: null }
  }
}
