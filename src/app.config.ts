export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/transactions/index',
    'pages/stats/index',
    'pages/mine/index',
    'pages/login/index',
    'pages/transaction-new/index',
    'pages/transaction-detail/index',
    'pages/assets/index',
    'pages/account-detail/index',
    'pages/search/index',
    'pages/search-filter/index',
    'pages/category-detail/index',
    'pages/accounts/index',
    'pages/categories/index',
    'pages/tags/index',
    'pages/budgets/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    backgroundColor: '#f5f6f7',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '我的账本',
    navigationBarTextStyle: 'black'
  },
  tabBar: {
    color: '#86909c',
    selectedColor: '#1677ff',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '账单',
        iconPath: 'assets/tabbar/home.svg',
        selectedIconPath: 'assets/tabbar/home-selected.svg'
      },
      {
        pagePath: 'pages/transactions/index',
        text: '明细',
        iconPath: 'assets/tabbar/transactions.svg',
        selectedIconPath: 'assets/tabbar/transactions-selected.svg'
      },
      {
        pagePath: 'pages/stats/index',
        text: '统计',
        iconPath: 'assets/tabbar/stats.svg',
        selectedIconPath: 'assets/tabbar/stats-selected.svg'
      },
      {
        pagePath: 'pages/mine/index',
        text: '我的',
        iconPath: 'assets/tabbar/mine.svg',
        selectedIconPath: 'assets/tabbar/mine-selected.svg'
      }
    ]
  }
})
