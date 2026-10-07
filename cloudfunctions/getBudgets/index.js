// 云函数 getBudgets：按月查询预算
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const TZ = 480 * 60 * 1000
const pad = (n) => String(n).padStart(2, '0')

function monthKeyOf(ts) {
  const d = new Date(ts + TZ)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) throw new Error('未获取到用户身份')

    const data = event || {}
    const monthKey = data.monthKey || monthKeyOf(Date.now())

    const res = await db.collection('budgets')
      .where({ _openid: openid, monthKey })
      .limit(1000)
      .get()

    return { code: 0, message: 'success', data: res.data }
  } catch (err) {
    console.error('[getBudgets] error:', err)
    return { code: -1, message: (err && err.message) || '服务异常', data: null }
  }
}
