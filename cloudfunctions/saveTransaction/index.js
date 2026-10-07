// 云函数 saveTransaction：流水的创建 / 更新 / 删除 / 退款
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

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
    const action = data.action
    const coll = db.collection('transactions')

    if (action === 'delete') {
      if (!data.id) throw new Error('缺少记录 ID')
      await coll.where({ _id: data.id, _openid: openid }).remove()
      return { code: 0, message: 'success', data: { id: data.id } }
    }

    if (action === 'update') {
      if (!data.id) throw new Error('缺少记录 ID')
      const existed = await coll.where({ _id: data.id, _openid: openid }).limit(1).get()
      const target = existed.data[0]
      if (!target) throw new Error('记录不存在')

      const happenedAt = data.happenedAt || target.happenedAt
      const patch = {
        type: data.type || target.type,
        amountCents: typeof data.amountCents === 'number' ? data.amountCents : target.amountCents,
        accountId: data.accountId || target.accountId,
        toAccountId: data.toAccountId || '',
        categoryId: data.categoryId || '',
        tagIds: data.tagIds || [],
        happenedAt,
        happenedOn: dateKeyOf(happenedAt),
        monthKey: monthKeyOf(happenedAt),
        note: data.note || ''
      }
      await coll.doc(target._id).update({ data: patch })
      return { code: 0, message: 'success', data: { id: target._id } }
    }

    const happenedAt = data.happenedAt || Date.now()
    const doc = {
      _openid: openid,
      type: data.type || 'expense',
      amountCents: data.amountCents || 0,
      accountId: data.accountId || '',
      toAccountId: data.toAccountId || '',
      categoryId: data.categoryId || '',
      tagIds: data.tagIds || [],
      happenedAt,
      happenedOn: dateKeyOf(happenedAt),
      monthKey: monthKeyOf(happenedAt),
      note: data.note || '',
      refundedFromId: action === 'refund' ? data.refundedFromId || '' : '',
      createdAt: Date.now()
    }
    const created = await coll.add({ data: doc })
    return { code: 0, message: 'success', data: { id: created._id } }
  } catch (err) {
    console.error('[saveTransaction] error:', err)
    return { code: -1, message: (err && err.message) || '服务异常', data: null }
  }
}
