// 云函数 getTransactions：按条件查询流水（返回带名称的展示态）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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

function buildConditions(openid, query) {
  const conditions = [{ _openid: openid }]
  if (query.monthKey) conditions.push({ monthKey: query.monthKey })
  if (query.type) conditions.push({ type: query.type })
  if (query.categoryId) conditions.push({ categoryId: query.categoryId })
  if (query.tagId) conditions.push({ tagIds: query.tagId })
  if (query.accountId) {
    conditions.push(_.or([{ accountId: query.accountId }, { toAccountId: query.accountId }]))
  }
  if (typeof query.minAmountCents === 'number' || typeof query.maxAmountCents === 'number') {
    const min = typeof query.minAmountCents === 'number' ? query.minAmountCents : 0
    const max = typeof query.maxAmountCents === 'number' ? query.maxAmountCents : Number.MAX_SAFE_INTEGER
    conditions.push({ amountCents: _.gte(min).and(_.lte(max)) })
  }
  if (query.startDate || query.endDate) {
    const start = query.startDate || '0000-00-00'
    const end = query.endDate || '9999-99-99'
    conditions.push({ happenedOn: _.gte(start).and(_.lte(end)) })
  }
  return conditions
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) throw new Error('未获取到用户身份')

    const query = event || {}
    const { accountMap, categoryMap, tagMap } = await loadMaps(openid)

    const res = await db.collection('transactions')
      .where(_.and(buildConditions(openid, query)))
      .limit(1000)
      .get()

    let list = res.data
    if (query.keyword) {
      const kw = String(query.keyword).trim().toLowerCase()
      list = list.filter((item) => {
        const view = buildView(item, accountMap, categoryMap, tagMap)
        return (
          (item.note || '').toLowerCase().includes(kw) ||
          view.categoryName.toLowerCase().includes(kw) ||
          view.accountName.toLowerCase().includes(kw) ||
          String(item.amountCents / 100).includes(kw)
        )
      })
    }

    list.sort((a, b) => b.happenedAt - a.happenedAt)
    const skip = query.skip || 0
    const limit = query.limit || 500
    const data = list
      .slice(skip, skip + limit)
      .map((item) => buildView(item, accountMap, categoryMap, tagMap))

    return { code: 0, message: 'success', data }
  } catch (err) {
    console.error('[getTransactions] error:', err)
    return { code: -1, message: (err && err.message) || '服务异常', data: null }
  }
}
