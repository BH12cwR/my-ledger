// 云函数 saveBudget：预算的创建 / 更新 / 删除（同月同分类去重）
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
    const action = data.action
    const coll = db.collection('budgets')

    if (action === 'delete') {
      if (!data.id) throw new Error('缺少预算 ID')
      await coll.where({ _id: data.id, _openid: openid }).remove()
      return { code: 0, message: 'success', data: { id: data.id } }
    }

    if (action === 'update') {
      if (!data.id) throw new Error('缺少预算 ID')
      const existed = await coll.where({ _id: data.id, _openid: openid }).limit(1).get()
      const target = existed.data[0]
      if (!target) throw new Error('预算不存在')

      const patch = {
        monthKey: data.monthKey || target.monthKey,
        categoryId: data.categoryId || '',
        amountCents: typeof data.amountCents === 'number' ? data.amountCents : target.amountCents
      }
      await coll.doc(target._id).update({ data: patch })
      return { code: 0, message: 'success', data: { id: target._id } }
    }

    const monthKey = data.monthKey || monthKeyOf(Date.now())
    const categoryId = data.categoryId || ''
    const existed = await coll
      .where({ _openid: openid, monthKey, categoryId })
      .limit(1)
      .get()

    if (existed.data.length) {
      const target = existed.data[0]
      await coll.doc(target._id).update({ data: { amountCents: data.amountCents || 0 } })
      return { code: 0, message: 'success', data: { id: target._id } }
    }

    const doc = {
      _openid: openid,
      monthKey,
      categoryId,
      amountCents: data.amountCents || 0,
      createdAt: Date.now()
    }
    const created = await coll.add({ data: doc })
    return { code: 0, message: 'success', data: { id: created._id } }
  } catch (err) {
    console.error('[saveBudget] error:', err)
    return { code: -1, message: (err && err.message) || '服务异常', data: null }
  }
}
