// 云函数 login：获取或创建用户；首次登录时初始化默认账户、分类、标签
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const DEFAULT_AVATAR = 'https://picsum.photos/id/64/200/200'

const DEFAULT_ACCOUNTS = [
  { name: '微信零钱', type: 'wechat', icon: '💬', color: '#07c160', initialBalanceCents: 0, archived: false, sortOrder: 1 },
  { name: '支付宝', type: 'alipay', icon: '🅰️', color: '#1677ff', initialBalanceCents: 0, archived: false, sortOrder: 2 },
  { name: '银行卡', type: 'bank', icon: '🏦', color: '#ff8f1f', initialBalanceCents: 0, archived: false, sortOrder: 3 },
  { name: '现金', type: 'cash', icon: '💵', color: '#00b578', initialBalanceCents: 0, archived: false, sortOrder: 4 },
  { name: '信用卡', type: 'credit', icon: '💳', color: '#f5222d', initialBalanceCents: 0, archived: false, sortOrder: 5 }
]

const DEFAULT_CATEGORIES = [
  { name: '餐饮', kind: 'expense', icon: '🍜', color: '#ff8f1f', isSystem: true, sortOrder: 1 },
  { name: '交通', kind: 'expense', icon: '🚇', color: '#1677ff', isSystem: true, sortOrder: 2 },
  { name: '购物', kind: 'expense', icon: '🛒', color: '#eb2f96', isSystem: true, sortOrder: 3 },
  { name: '居住', kind: 'expense', icon: '🏠', color: '#7a5af8', isSystem: true, sortOrder: 4 },
  { name: '娱乐', kind: 'expense', icon: '🎬', color: '#00b8d9', isSystem: true, sortOrder: 5 },
  { name: '医疗', kind: 'expense', icon: '💊', color: '#f5222d', isSystem: true, sortOrder: 6 },
  { name: '学习', kind: 'expense', icon: '📚', color: '#8f6a3d', isSystem: true, sortOrder: 7 },
  { name: '其他', kind: 'expense', icon: '📦', color: '#86909c', isSystem: true, sortOrder: 8 },
  { name: '工资', kind: 'income', icon: '💼', color: '#00b578', isSystem: true, sortOrder: 1 },
  { name: '奖金', kind: 'income', icon: '🎁', color: '#ff8f1f', isSystem: true, sortOrder: 2 },
  { name: '理财', kind: 'income', icon: '📈', color: '#7a5af8', isSystem: true, sortOrder: 3 },
  { name: '其他', kind: 'income', icon: '💰', color: '#86909c', isSystem: true, sortOrder: 4 }
]

const DEFAULT_TAGS = [
  { name: '必要', color: '#1677ff' },
  { name: '可选', color: '#ff8f1f' },
  { name: '报销', color: '#00b578' }
]

async function addAll(collection, list) {
  await Promise.all(
    list.map((item) => db.collection(collection).add({ data: item }))
  )
}

async function seedDefaults(openid, now) {
  const withUser = (item) => Object.assign({ _openid: openid, createdAt: now }, item)
  await Promise.all([
    addAll('accounts', DEFAULT_ACCOUNTS.map(withUser)),
    addAll('categories', DEFAULT_CATEGORIES.map(withUser)),
    addAll('tags', DEFAULT_TAGS.map(withUser))
  ])
}

function toUser(doc) {
  return {
    _id: doc._id,
    openid: doc._openid,
    nickname: doc.nickname,
    avatar: doc.avatar,
    createdAt: doc.createdAt
  }
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) throw new Error('未获取到用户身份')

    const action = (event && event.action) || 'login'
    const users = db.collection('users')
    const existed = await users.where({ _openid: openid }).limit(1).get()

    if (existed.data.length) {
      return { code: 0, message: 'success', data: toUser(existed.data[0]) }
    }

    if (action === 'me') {
      return { code: 0, message: 'success', data: null }
    }

    const now = Date.now()
    const doc = {
      _openid: openid,
      nickname: '微信用户',
      avatar: DEFAULT_AVATAR,
      createdAt: now
    }
    const created = await users.add({ data: doc })
    await seedDefaults(openid, now)

    return { code: 0, message: 'success', data: toUser(Object.assign({ _id: created._id }, doc)) }
  } catch (err) {
    console.error('[login] error:', err)
    return { code: -1, message: (err && err.message) || '服务异常', data: null }
  }
}
