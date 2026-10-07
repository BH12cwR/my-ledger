// 云函数 getAccounts：账户列表（按流水聚合当前余额）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function withBalance(accounts, transactions) {
  return accounts
    .map((account) => {
      let balance = account.initialBalanceCents || 0
      transactions.forEach((t) => {
        if (t.type === 'expense' && t.accountId === account._id) balance -= t.amountCents
        if (t.type === 'income' && t.accountId === account._id) balance += t.amountCents
        if (t.type === 'transfer') {
          if (t.accountId === account._id) balance -= t.amountCents
          if (t.toAccountId === account._id) balance += t.amountCents
        }
      })
      return Object.assign({}, account, { balanceCents: balance })
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

exports.main = async () => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    if (!openid) throw new Error('未获取到用户身份')

    const [accountRes, txRes] = await Promise.all([
      db.collection('accounts').where({ _openid: openid }).limit(1000).get(),
      db.collection('transactions').where({ _openid: openid }).limit(1000).get()
    ])

    return { code: 0, message: 'success', data: withBalance(accountRes.data, txRes.data) }
  } catch (err) {
    console.error('[getAccounts] error:', err)
    return { code: -1, message: (err && err.message) || '服务异常', data: null }
  }
}
