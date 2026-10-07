// 云函数 getCategories：分类列表（可按收支类型过滤）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) throw new Error('未获取到用户身份')

    const data = event || {}
    const where = { _openid: openid }
    if (data.kind) where.kind = data.kind

    const res = await db.collection('categories').where(where).limit(1000).get()
    const list = res.data.slice().sort((a, b) => a.sortOrder - b.sortOrder)

    return { code: 0, message: 'success', data: list }
  } catch (err) {
    console.error('[getCategories] error:', err)
    return { code: -1, message: (err && err.message) || '服务异常', data: null }
  }
}
