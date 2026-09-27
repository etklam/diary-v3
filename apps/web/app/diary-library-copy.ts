export const diaryLibraryCopy = {
  en: {
    savedViews: 'Saved views', chooseView: 'Choose a saved view', noSavedViews: 'No saved views yet.', saveView: 'Save current filters', viewName: 'View name', save: 'Save view', update: 'Update view', rename: 'Rename', remove: 'Delete view', apply: 'Apply', viewLimit: 'Up to 20 views per account; names can be up to 80 characters.', viewSaved: 'Saved view created.', viewUpdated: 'Saved view updated.', viewDeleted: 'Saved view deleted.', viewDirty: 'Filters differ from this saved view.', viewNameRequired: 'Enter a name for this view.', sourceTitle: 'Title match', sourceContent: 'Content match', sourceThesis: 'Thesis match', sourceRisk: 'Risk match', sourceExecution: 'Execution match', sourceTag: 'Tag match', sourceSymbol: 'Symbol match', searchMatch: 'Search match', loosenSearch: 'Clear search', loosenDates: 'Clear date filters',
  },
  'zh-TW': {
    savedViews: '已儲存檢視', chooseView: '選擇已儲存檢視', noSavedViews: '尚未有已儲存檢視。', saveView: '儲存目前篩選', viewName: '檢視名稱', save: '儲存檢視', update: '更新檢視', rename: '重新命名', remove: '刪除檢視', apply: '套用', viewLimit: '每個帳戶最多 20 個檢視；名稱最多 80 個字元。', viewSaved: '已建立檢視。', viewUpdated: '已更新檢視。', viewDeleted: '已刪除檢視。', viewDirty: '目前篩選已偏離這個已儲存檢視。', viewNameRequired: '請輸入檢視名稱。', sourceTitle: '命中標題', sourceContent: '命中內容', sourceThesis: '命中論點', sourceRisk: '命中風險', sourceExecution: '命中執行', sourceTag: '命中標籤', sourceSymbol: '命中代號', searchMatch: '搜尋命中', loosenSearch: '清除搜尋', loosenDates: '清除日期篩選',
  },
  'zh-CN': {
    savedViews: '已保存视图', chooseView: '选择已保存视图', noSavedViews: '尚无已保存视图。', saveView: '保存当前筛选', viewName: '视图名称', save: '保存视图', update: '更新视图', rename: '重命名', remove: '删除视图', apply: '应用', viewLimit: '每个账户最多 20 个视图；名称最多 80 个字符。', viewSaved: '已创建视图。', viewUpdated: '已更新视图。', viewDeleted: '已删除视图。', viewDirty: '当前筛选已偏离这个已保存视图。', viewNameRequired: '请输入视图名称。', sourceTitle: '命中标题', sourceContent: '命中内容', sourceThesis: '命中论点', sourceRisk: '命中风险', sourceExecution: '命中执行', sourceTag: '命中标签', sourceSymbol: '命中代码', searchMatch: '搜索命中', loosenSearch: '清除搜索', loosenDates: '清除日期筛选',
  },
} as const

export type DiaryLibraryCopy = (typeof diaryLibraryCopy)[keyof typeof diaryLibraryCopy]
