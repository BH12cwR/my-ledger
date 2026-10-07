// 云函数 getStats：按月统计（收支合计、分类排行、按日趋势）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const TZ = 480 * 60 * 1000
const pad = (n) => String(n).padStart(2, '0')

function dateKeyOf(ts) {
  const d = new Date(ts + TZ)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function monthKeyOf(ts) {
  return dateKeyOf(ts).slice(0, 7)
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) throw new Error('未获取到用户身份')

    const data = event || {}
    const monthKey = data.monthKey || monthKeyOf(Date.now())
    const categoryId = data.categoryId

    const categoryRes = await db.collection('categories')
      .where({ _openid: openid })
      .limit(1000)
      .get()
    const categoryMap = {}
    categoryRes.data.forEach((item) => { categoryMap[item._id] = item })

    const txRes = await db.collection('transactions')
      .where({ _openid: openid, monthKey, type: _.neq('transfer') })
      .limit(1000)
      .get()

    const list = categoryId
      ? txRes.data.filter((item) => item.categoryId === categoryId)
      : txRes.data

    const incomeCents = list
      .filter((item) => item.type === 'income')
      .reduce((acc, item) => acc + item.amountCents, 0)
    const expenseCents = list
      .filter((item) => item.type === 'expense')
      .reduce((acc, item) => acc + item.amountCents, 0)
    const totalExpense = expenseCents || 1

    const byCategory = {}
    list
      .filter((item) => item.type === 'expense')
      .forEach((item) => {
        const key = item.categoryId || 'unknown'
        byCategory[key] = (byCategory[key] || 0) + item.amountCents
      })

    const categoryRanks = Object.keys(byCategory)
      .map((id) => {
        const category = categoryMap[id]
        const amountCents = byCategory[id]
        return {
          categoryId: id,
          name: category ? category.name : '未分类',
          icon: category ? category.icon : '📦',
          color: category ? category.color : '#86909c',
          amountCents,
          ratio: Math.round((amountCents / totalExpense) * 100)
        }
      })
      .sort((a, b) => b.amountCents - a.amountCents)

    const [year, month] = monthKey.split('-').map(Number)
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const trend = Array.from({ length: daysInMonth }, (_, index) => {
      const dateKey = `${monthKey}-${pad(index + 1)}`
      const dayTx = list.filter((item) => item.happenedOn === dateKey)
      return {
        dateKey,
        incomeCents: dayTx.filter((item) => item.type === 'income').reduce((acc, item) => acc + item.amountCents, 0),
        expenseCents: dayTx.filter((item) => item.type === 'expense').reduce((acc, item) => acc + item.amountCents, 0)
      }
    })

    return {
      code: 0,
      message: 'success',
      data: {
        monthKey,
        incomeCents,
        expenseCents,
        balanceCents: incomeCents - expenseCents,
        categoryRanks,
        trend
      }
    }
  } catch (err) {
    console.error('[getStats] error:', err)
    return { code: -1, message: (err && err.message) || '服务异常', data: null }
  }
}
