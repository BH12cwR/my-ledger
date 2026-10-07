// 云函数 saveTag：标签的创建 / 更新 / 删除
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) throw new Error('未获取到用户身份')

    const data = event || {}
    const action = data.action
    const coll = db.collection('tags')

    if (action === 'delete') {
      if (!data.id) throw new Error('缺少标签 ID')
      await coll.where({ _id: data.id, _openid: openid }).remove()
      return { code: 0, message: 'success', data: { id: data.id } }
    }

    if (action === 'update') {
      if (!data.id) throw new Error('缺少标签 ID')
      const existed = await coll.where({ _id: data.id, _openid: openid }).limit(1).get()
      const target = existed.data[0]
      if (!target) throw new Error('标签不存在')

      const patch = {
        name: data.name || target.name,
        color: data.color || target.color
      }
      await coll.doc(target._id).update({ data: patch })
      return { code: 0, message: 'success', data: { id: target._id } }
    }

    const doc = {
      _openid: openid,
      name: data.name || '新标签',
      color: data.color || '#1677ff',
      createdAt: Date.now()
    }
    const created = await coll.add({ data: doc })
    return { code: 0, message: 'success', data: { id: created._id } }
  } catch (err) {
    console.error('[saveTag] error:', err)
    return { code: -1, message: (err && err.message) || '服务异常', data: null }
  }
}
