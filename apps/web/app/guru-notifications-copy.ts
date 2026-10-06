import type { Locale } from './destinations'

const copy = {
  en: {
    title: 'Guru alerts', intro: 'Choose which disclosed Guru events reach you, and how large a move has to be before it does.',
    inbox: 'Recent events', preferences: 'Event types', thresholds: 'Meaningful change',
    minWeight: 'Minimum portfolio weight (%)', minChange: 'Minimum reported quantity change (%)',
    thresholdHint: 'Leave a threshold empty to receive every event of that type. A move must clear both thresholds you set.',
    events: {
      newFiling: 'New filing from a followed Guru', newPosition: 'New position', exitedPosition: 'Exited position',
      strongAdd: 'Strong add', strongReduce: 'Strong reduction', newStockHolder: 'New holder of a watched stock',
      consensusChange: 'Consensus direction change',
    },
    save: 'Save alert settings', saved: 'Alert settings saved.', saveFailed: 'Alert settings could not be saved.',
    following: 'Followed Gurus', watching: 'Watched stocks', noFollowing: 'You do not follow any Guru yet.',
    noWatching: 'You do not watch any stock’s Guru activity yet.', privacy: 'Follows and watches are private. No one else sees them.',
    markRead: 'Mark all read', unread: (count: number) => `${count} unread`, empty: 'No Guru events have been delivered yet.',
    loading: 'Loading your Guru alerts…', failed: 'Guru alerts could not be loaded.', retry: 'Try again',
    signIn: 'Sign in to manage Guru alerts.', quarter: 'Reported quarter',
    watch: 'Watch Guru activity', unwatch: 'Watching', watchSignIn: 'Sign in to watch', watchFailed: 'The watch could not be saved.',
    snapshotTitle: 'Guru context at decision time', snapshotIntro: 'Attach what the tracked investors had disclosed when you recorded this entry. The attachment never changes afterwards.',
    snapshotSymbol: 'Stock symbol', snapshotAttach: 'Attach Guru snapshot', snapshotEmpty: 'No Guru snapshot is attached to this entry.',
    snapshotFailed: 'The Guru snapshot could not be attached.', snapshotReused: 'This quarter is already attached.',
    snapshotHolders: 'Holders', snapshotNet: 'Net buyers', snapshotWeight: 'Average weight', snapshotCaptured: 'Captured',
    snapshotSource: 'Prepared SEC Form 13F analytics only. Generated commentary is never part of a snapshot.',
  },
  'zh-TW': {
    title: '大師提醒', intro: '選擇哪些已披露的大師動作要通知你，以及動作要多大才算有意義。',
    inbox: '最近事件', preferences: '事件類型', thresholds: '有意義的變動',
    minWeight: '最低組合權重（%）', minChange: '最低申報數量變動（%）',
    thresholdHint: '留空表示該類型全部接收。設定後，動作必須同時超過你設定的兩個門檻。',
    events: {
      newFiling: '追蹤大師的新申報', newPosition: '新建持倉', exitedPosition: '清空持倉',
      strongAdd: '大幅增持', strongReduce: '大幅減持', newStockHolder: '關注個股出現新持有人',
      consensusChange: '共識方向改變',
    },
    save: '儲存提醒設定', saved: '提醒設定已儲存。', saveFailed: '無法儲存提醒設定。',
    following: '追蹤的大師', watching: '關注的個股', noFollowing: '你尚未追蹤任何大師。',
    noWatching: '你尚未關注任何個股的大師動作。', privacy: '追蹤與關注都是私人資料，其他人看不到。',
    markRead: '全部標為已讀', unread: (count: number) => `${count} 則未讀`, empty: '目前沒有已送出的大師事件。',
    loading: '正在載入大師提醒…', failed: '暫時無法載入大師提醒。', retry: '重試',
    signIn: '請登入以管理大師提醒。', quarter: '申報季度',
    watch: '關注大師動作', unwatch: '關注中', watchSignIn: '登入後關注', watchFailed: '無法儲存關注設定。',
    snapshotTitle: '決策當下的大師脈絡', snapshotIntro: '記錄這筆日記時，把追蹤大師當時已披露的資料一併保存。保存後不會再變動。',
    snapshotSymbol: '股票代號', snapshotAttach: '附上大師快照', snapshotEmpty: '這筆日記尚未附上大師快照。',
    snapshotFailed: '無法附上大師快照。', snapshotReused: '這個季度已經附上。',
    snapshotHolders: '持有大師', snapshotNet: '淨買方', snapshotWeight: '平均權重', snapshotCaptured: '保存時間',
    snapshotSource: '僅使用已整理的 SEC Form 13F 分析資料，快照不包含任何生成內容。',
  },
  'zh-CN': {
    title: '大师提醒', intro: '选择哪些已披露的大师动作要通知你，以及动作要多大才算有意义。',
    inbox: '最近事件', preferences: '事件类型', thresholds: '有意义的变动',
    minWeight: '最低组合权重（%）', minChange: '最低申报数量变动（%）',
    thresholdHint: '留空表示该类型全部接收。设定后，动作必须同时超过你设定的两个门槛。',
    events: {
      newFiling: '追踪大师的新申报', newPosition: '新建持仓', exitedPosition: '清空持仓',
      strongAdd: '大幅增持', strongReduce: '大幅减持', newStockHolder: '关注个股出现新持有人',
      consensusChange: '共识方向改变',
    },
    save: '保存提醒设置', saved: '提醒设置已保存。', saveFailed: '无法保存提醒设置。',
    following: '追踪的大师', watching: '关注的个股', noFollowing: '你尚未追踪任何大师。',
    noWatching: '你尚未关注任何个股的大师动作。', privacy: '追踪与关注均为私人数据，其他人看不到。',
    markRead: '全部标为已读', unread: (count: number) => `${count} 条未读`, empty: '目前没有已送达的大师事件。',
    loading: '正在加载大师提醒…', failed: '暂时无法加载大师提醒。', retry: '重试',
    signIn: '请登录以管理大师提醒。', quarter: '申报季度',
    watch: '关注大师动作', unwatch: '关注中', watchSignIn: '登录后关注', watchFailed: '无法保存关注设置。',
    snapshotTitle: '决策当下的大师脉络', snapshotIntro: '记录这条日记时，把追踪大师当时已披露的数据一并保存。保存后不会再变动。',
    snapshotSymbol: '股票代码', snapshotAttach: '附上大师快照', snapshotEmpty: '这条日记尚未附上大师快照。',
    snapshotFailed: '无法附上大师快照。', snapshotReused: '该季度已经附上。',
    snapshotHolders: '持有大师', snapshotNet: '净买方', snapshotWeight: '平均权重', snapshotCaptured: '保存时间',
    snapshotSource: '仅使用整理完成的 SEC Form 13F 分析数据，快照不包含任何生成内容。',
  },
}

export type GuruNotificationsCopy = typeof copy['en']

export function guruNotificationsCopy(locale: Locale): GuruNotificationsCopy {
  return copy[locale]
}
