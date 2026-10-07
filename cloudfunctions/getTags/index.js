// 云函数 getTags：标签列表
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) throw new Error('未获取到用户身份')

    const res = await db.collection('tags').where({ _openid: openid }).limit(1000).get()
    return { code: 0, message: 'success', data: res.data }
  } catch (err) {
    console.error('[getTags] error:', err)
    return { code: -1, message: (err && err.message) || '服务异常', data: null }
  }
}
