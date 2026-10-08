import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  adminDiaryListResponseSchema,
  adminStatsResponseSchema,
  adminUserListResponseSchema,
  adminUserRoleResponseSchema,
  type AdminUserListItem,
} from '@diary/contracts/admin-users'
import { authUserResponseSchema } from '@diary/contracts'
import { api, useUi } from '../ui'
import { signInPath } from '../session'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { ConfirmDialog } from '../authoring-controls'
import './admin-users.css'

const copy = {
  en: {
    title: 'Admin accounts', intro: 'Find an account, review its activity, then make one explicit change.', stats: 'System counts', users: 'Accounts', search: 'Search email or name', searchAction: 'Search', loading: 'Loading…', retry: 'Try again', denied: 'You do not have permission to manage accounts.', failed: 'Admin account data is temporarily unavailable.', name: 'Name', email: 'Email', role: 'Role', created: 'Created', diaries: 'Diaries', actions: 'Actions', save: 'Save', saved: 'Role updated.', remove: 'Delete account', current: 'Current account', unnamed: 'Unnamed account', user: 'User', admin: 'Admin', previous: 'Previous', next: 'Next', page: 'Page', confirmDelete: (email: string) => `Delete ${email}? This removes the account and its related data.`, deleteDone: 'Account deleted.', recent: 'Recent Diaries', date: 'Date', author: 'Author', alerts: 'Alerts', transactions: 'Transactions', totalUsers: 'Total users', admins: 'Admins', regular: 'Regular users', totalDiaries: 'Total Diaries', totalAlerts: 'Total alerts', activeAlerts: 'Active', dismissedAlerts: 'Dismissed', totalTransactions: 'Total transactions', buys: 'BUY', sells: 'SELL', accountPrivate: 'You cannot change or delete your own account.', back: 'Preferences', signIn: 'Sign in',
  },
  'zh-TW': {
    title: '管理員帳戶', intro: '尋找帳戶、查看活動，再明確執行一項變更。', stats: '系統統計', users: '帳戶', search: '搜尋電郵或名稱', searchAction: '搜尋', loading: '正在載入…', retry: '重試', denied: '你沒有管理帳戶的權限。', failed: '管理員帳戶資料暫時無法使用。', name: '名稱', email: '電郵', role: '角色', created: '建立日期', diaries: '日記', actions: '操作', save: '儲存', saved: '角色已更新。', remove: '刪除帳戶', current: '目前帳戶', unnamed: '未命名帳戶', user: '使用者', admin: '管理員', previous: '上一頁', next: '下一頁', page: '頁', confirmDelete: (email: string) => `刪除 ${email}？這會移除帳戶及其相關資料。`, deleteDone: '帳戶已刪除。', recent: '近期日記', date: '日期', author: '作者', alerts: '提醒', transactions: '交易', totalUsers: '使用者總數', admins: '管理員', regular: '一般使用者', totalDiaries: '日記總數', totalAlerts: '提醒總數', activeAlerts: '未處理', dismissedAlerts: '已處理', totalTransactions: '交易總數', buys: '買入', sells: '賣出', accountPrivate: '你不能變更或刪除自己的帳戶。', back: '偏好設定', signIn: '登入',
  },
  'zh-CN': {
    title: '管理员账户', intro: '查找账户、查看活动，再明确执行一项更改。', stats: '系统统计', users: '账户', search: '搜索邮箱或姓名', searchAction: '搜索', loading: '正在加载…', retry: '重试', denied: '你没有管理账户的权限。', failed: '管理员账户资料暂时无法使用。', name: '名称', email: '邮箱', role: '角色', created: '创建日期', diaries: '日记', actions: '操作', save: '保存', saved: '角色已更新。', remove: '删除账户', current: '当前账户', unnamed: '未命名账户', user: '用户', admin: '管理员', previous: '上一页', next: '下一页', page: '页', confirmDelete: (email: string) => `删除 ${email}？这会移除账户及其相关资料。`, deleteDone: '账户已删除。', recent: '近期日记', date: '日期', author: '作者', alerts: '提醒', transactions: '交易', totalUsers: '用户总数', admins: '管理员', regular: '普通用户', totalDiaries: '日记总数', totalAlerts: '提醒总数', activeAlerts: '未处理', dismissedAlerts: '已处理', totalTransactions: '交易总数', buys: '买入', sells: '卖出', accountPrivate: '你不能更改或删除自己的账户。', back: '偏好设置', signIn: '登录',
  },
} as const

type Role = 'USER' | 'ADMIN'

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value))
}

export default function AdminUsers() {
  const { locale } = useUi()
  const c = copy[locale]
  const [rows, setRows] = useState<ReturnType<typeof adminUserListResponseSchema.parse> | null>(null)
  const [stats, setStats] = useState<ReturnType<typeof adminStatsResponseSchema.parse>['data'] | null>(null)
  const [recent, setRecent] = useState<ReturnType<typeof adminDiaryListResponseSchema.parse> | null>(null)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [roleDrafts, setRoleDrafts] = useState<Record<string, Role>>({})
  const [pending, setPending] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState<Failure | null>(null)
  // Deletion names its consequence in the project dialog; `window.confirm` is
  // not a confirmation this design system has.
  const [doomed, setDoomed] = useState<AdminUserListItem | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setFailure(null)
    const loadUsers = api.GET('/api/admin/users', { params: { query: { page, limit: 10, search: submittedSearch || undefined } }, signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return
        const parsed = adminUserListResponseSchema.safeParse(result.data)
        if (!result.response.ok || !parsed.success) { setFailure(apiFailure(result.error, result.response.status === 403 ? c.denied : c.failed)); return }
        setRows(parsed.data)
        setRoleDrafts(current => Object.fromEntries(parsed.data.data.map(row => [row.id, current[row.id] ?? row.role])))
      }).catch(() => { if (!controller.signal.aborted) setFailure({ message: c.failed, fields: [] }) })
    const loadStats = api.GET('/api/admin/stats', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = adminStatsResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) setStats(parsed.data.data)
      else if (!failure) setFailure(apiFailure(result.error, result.response.status === 403 ? c.denied : c.failed))
    }).catch(() => { if (!controller.signal.aborted) setFailure({ message: c.failed, fields: [] }) })
    const loadRecent = api.GET('/api/admin/diaries', { params: { query: { page: 1, limit: 5 } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = adminDiaryListResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) setRecent(parsed.data)
    }).catch(() => undefined)
    const loadCurrentUser = api.GET('/api/auth/me', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = authUserResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) setCurrentUserId(parsed.data.data.id)
    }).catch(() => undefined)
    void Promise.all([loadUsers, loadStats, loadRecent, loadCurrentUser])
    return () => controller.abort()
  }, [attempt, page, submittedSearch, c.denied, c.failed])

  async function updateRole(row: AdminUserListItem) {
    const role = roleDrafts[row.id] ?? row.role
    if (role === row.role || pending) return
    setPending(`role:${row.id}`); setNotice(''); setFailure(null)
    try {
      const result = await api.PUT('/api/admin/users/{id}/role', { params: { path: { id: row.id } }, body: { role } })
      const parsed = adminUserRoleResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailure(apiFailure(result.error, c.failed)); return }
      setRows(current => current ? { ...current, data: current.data.map(item => item.id === row.id ? { ...item, role: parsed.data.data.role } : item) } : current)
      setNotice(c.saved)
    } catch { setFailure({ message: c.failed, fields: [] }) }
    finally { setPending(null) }
  }

  async function deleteUser(row: AdminUserListItem) {
    if (pending) return
    setPending(`delete:${row.id}`); setNotice(''); setFailure(null)
    try {
      const result = await api.DELETE('/api/admin/users/{id}', { params: { path: { id: row.id } } })
      if (!result.response.ok || !result.data) { setFailure(apiFailure(result.error, c.failed)); return }
      setNotice(c.deleteDone)
      const nextPage = rows && rows.data.length <= 1 && rows.pagination.page > 1 ? rows.pagination.page - 1 : rows?.pagination.page ?? 1
      setPage(nextPage); setAttempt(value => value + 1)
    } catch { setFailure({ message: c.failed, fields: [] }) }
    finally { setPending(null) }
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault(); setPage(1); setSubmittedSearch(search.trim()); setAttempt(value => value + 1)
  }

  const roleLabel = (role: Role) => role === 'ADMIN' ? c.admin : c.user
  const roleControl = (row: AdminUserListItem) => <div className="admin-users-role">
    <select aria-label={`${c.role}: ${row.email}`} value={roleDrafts[row.id] ?? row.role} disabled={row.id === currentUserId || pending !== null} onChange={event => setRoleDrafts(current => ({ ...current, [row.id]: event.target.value as Role }))}><option value="USER">{c.user}</option><option value="ADMIN">{c.admin}</option></select>
    {/* Row controls stay quiet-weight so they do not compete with the data.
        Delete keeps `danger-button` — its semantics are required — but at
        compact height it stops being the loudest element in the table. */}
    <button type="button" className="quiet-button button-compact" disabled={row.id === currentUserId || pending !== null || (roleDrafts[row.id] ?? row.role) === row.role} onClick={() => void updateRole(row)}>{pending === `role:${row.id}` ? '…' : c.save}</button>
  </div>
  // The guard is unchanged; only its presentation is. Every other row has one
  // control here, so this one has one chip, and the reason it cannot be acted
  // on is a note below the table that the chip points at.
  const rowAction = (row: AdminUserListItem) => row.id === currentUserId
    ? <span className="badge" aria-describedby="admin-users-self-note">{c.current}</span>
    : <button type="button" className="danger-button button-compact admin-users-delete" disabled={pending !== null} onClick={() => setDoomed(row)}>{pending === `delete:${row.id}` ? '…' : c.remove}</button>

  return <section className="admin-users-page">
    <header className="admin-users-header"><div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div><Link className="secondary admin-users-back" to="/settings">{c.back}</Link></header>
    <FailureNotice failure={failure} />
    {notice && <p className="admin-users-notice" role="status">{notice}</p>}
    {failure?.code === 'AUTH_UNAUTHORIZED' && <Link to={signInPath('/admin/users')}>{c.signIn}</Link>}
    <section className="admin-users-section" aria-labelledby="admin-users-stats"><h2 id="admin-users-stats">{c.stats}</h2>
      {/* Four figures read as a ledger. Four stat tiles side by side is the
          hero-metric template, not a design. */}
      {stats ? <div className="ledger admin-users-ledger">
        <div className="ledger-row"><span>{c.totalUsers}<small>{c.admins}: {stats.users.admin} · {c.regular}: {stats.users.regular}</small></span><span>{stats.users.total}</span></div>
        <div className="ledger-row"><span>{c.totalDiaries}</span><span>{stats.diaries.total}</span></div>
        <div className="ledger-row"><span>{c.totalAlerts}<small>{c.activeAlerts}: {stats.alerts.active} · {c.dismissedAlerts}: {stats.alerts.dismissed}</small></span><span>{stats.alerts.total}</span></div>
        <div className="ledger-row"><span>{c.totalTransactions}<small>{c.buys}: {stats.transactions.buy} · {c.sells}: {stats.transactions.sell}</small></span><span>{stats.transactions.total}</span></div>
      </div> : <p role="status">{c.loading}</p>}
    </section>
    {/* The scroll region below carries the accessible name. A named section
        around it made two landmarks called "Accounts", one inside the other. */}
    <section className="admin-users-section"><h2 id="admin-users-list">{c.users}</h2>
      {/* One control group: label over field, field and submit on one row. It
          is its own block rather than three loose children of a heading row. */}
      <form className="admin-users-search" onSubmit={submitSearch}>
        <label htmlFor="admin-users-search">{c.search}</label>
        <div className="admin-users-search-row"><input id="admin-users-search" value={search} onChange={event => setSearch(event.target.value)} maxLength={255} /><button type="submit" className="secondary">{c.searchAction}</button></div>
      </form>
      {rows === null ? <p role="status">{c.loading}</p> : rows.data.length === 0 ? <p>{c.failed}</p> : <>
        {/* The section heading names this table, so it carries no caption of
            its own: the page printed "Accounts" twice. */}
        <div className="table-scroll admin-users-table-wrap" role="region" aria-labelledby="admin-users-list" tabIndex={0}><table className="admin-users-table" aria-labelledby="admin-users-list"><thead><tr><th scope="col">{c.email}</th><th scope="col">{c.name}</th><th scope="col">{c.role}</th><th scope="col" className="num">{c.created}</th><th scope="col" className="num">{c.diaries}</th><th scope="col">{c.actions}</th></tr></thead><tbody>{rows.data.map(row => <tr key={row.id}><th scope="row"><span className="admin-users-email">{row.email}</span></th><td>{row.name ?? c.unnamed}</td><td>{roleControl(row)}</td><td className="num"><time dateTime={row.createdAt}>{formatDate(row.createdAt, locale)}</time></td><td className="num">{row.diaryCount}</td><td>{rowAction(row)}</td></tr>)}</tbody></table></div>
        <div className="admin-users-mobile-list">{rows.data.map(row => <article key={row.id} className="admin-users-mobile-row"><h3>{row.email}</h3><p>{row.name ?? c.unnamed}</p><dl><div><dt>{c.role}</dt><dd>{roleLabel(row.role)}</dd></div><div><dt>{c.created}</dt><dd><time dateTime={row.createdAt}>{formatDate(row.createdAt, locale)}</time></dd></div><div><dt>{c.diaries}</dt><dd className="num">{row.diaryCount}</dd></div></dl><div className="admin-users-role"><select aria-label={`${c.role}: ${row.email}`} value={roleDrafts[row.id] ?? row.role} disabled={row.id === currentUserId || pending !== null} onChange={event => setRoleDrafts(current => ({ ...current, [row.id]: event.target.value as Role }))}><option value="USER">{c.user}</option><option value="ADMIN">{c.admin}</option></select><button type="button" className="quiet-button button-compact" disabled={row.id === currentUserId || pending !== null || (roleDrafts[row.id] ?? row.role) === row.role} onClick={() => void updateRole(row)}>{c.save}</button>{rowAction(row)}</div></article>)}</div>
        {rows.data.some(row => row.id === currentUserId) && <p id="admin-users-self-note" className="muted admin-users-self-note">{c.current}: {c.accountPrivate}</p>}
        {rows.pagination.totalPages > 1 && <nav className="admin-users-pagination" aria-label={c.users}><button type="button" className="secondary" disabled={rows.pagination.page <= 1 || pending !== null} onClick={() => setPage(value => value - 1)}>{c.previous}</button><span>{c.page} {rows.pagination.page} / {rows.pagination.totalPages}</span><button type="button" className="secondary" disabled={rows.pagination.page >= rows.pagination.totalPages || pending !== null} onClick={() => setPage(value => value + 1)}>{c.next}</button></nav>}
      </>}
    </section>
    <section className="admin-users-section"><h2 id="admin-users-recent">{c.recent}</h2>{recent?.data.length ? <div className="table-scroll admin-users-table-wrap" role="region" aria-labelledby="admin-users-recent" tabIndex={0}><table className="admin-users-table admin-users-diary-table" aria-labelledby="admin-users-recent"><thead><tr><th scope="col" className="num">{c.date}</th><th scope="col">{c.name}</th><th scope="col">{c.author}</th><th scope="col" className="num">{c.alerts}</th><th scope="col" className="num">{c.transactions}</th></tr></thead><tbody>{recent.data.map(row => <tr key={row.id}><td className="num"><time dateTime={row.date}>{row.date}</time></td><th scope="row">{row.title}</th><td>{row.author.name ?? row.author.email}</td><td className="num">{row.alertCount}</td><td className="num">{row.transactionCount}</td></tr>)}</tbody></table></div> : <p>{c.loading}</p>}</section>
    <ConfirmDialog open={doomed !== null} title={c.remove} body={doomed ? c.confirmDelete(doomed.email) : ''} confirmLabel={c.remove} danger
      onConfirm={() => { const row = doomed; setDoomed(null); if (row) void deleteUser(row) }}
      onCancel={() => setDoomed(null)} />
  </section>
}
