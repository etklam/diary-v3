import { useEffect, useRef, useState } from 'react'
import { aiAdminAuditResponseSchema, aiAdminUsageResponseSchema } from '@diary/contracts/admin-ai'
import type { z } from 'zod'
import { api, useUi } from '../ui'
import { useSessionState } from '../session'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { adminAiCopy } from '../ai-copy'
import { AdminAiShell, useAdminAiDateTime, useAdminAiSettings } from './admin-ai-shell'

type UsageItem = z.infer<typeof aiAdminUsageResponseSchema>['data'][number]
type AuditEvent = z.infer<typeof aiAdminAuditResponseSchema>['data'][number]

const utcMonth = () => new Date().toISOString().slice(0, 7)

/**
 * One job: reading what was spent and what was changed. This view has no save
 * scope at all — every control on it is a filter.
 *
 * Both tables are nine and four columns wide, so each lives in its own named
 * scroll region: the page keeps the workspace content width at every viewport
 * and the headers stop wrapping to three lines.
 */
export default function AdminAiUsage() {
  const { locale, t } = useUi()
  const c = adminAiCopy[locale]
  const session = useSessionState()
  const state = useAdminAiSettings()
  const { adminReady, alive, ledger, sessionRevision } = state
  const fmtDateTime = useAdminAiDateTime()
  const translate = useRef(t); translate.current = t

  const [month, setMonth] = useState(utcMonth())
  const [user, setUser] = useState('')
  const [userQuery, setUserQuery] = useState('')
  const [usage, setUsage] = useState<UsageItem[] | null>(null)
  const [usageFailure, setUsageFailure] = useState<Failure | null>(null)
  const [audit, setAudit] = useState<{ items: AuditEvent[]; nextCursor: string | null } | null>(null)
  const [auditFailure, setAuditFailure] = useState<Failure | null>(null)
  const [morePending, setMorePending] = useState(false)
  const epochRef = useRef(0)

  useEffect(() => {
    if (!adminReady) return
    const controller = new AbortController()
    setUsage(null); setUsageFailure(null)
    api.GET('/api/admin/ai/usage', { params: { query: { month: month ? `${month}-01` : undefined, userId: userQuery || undefined, limit: 50 } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = aiAdminUsageResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) setUsage(parsed.data.data)
      else setUsageFailure(apiFailure(result.error, translate.current('failed')))
    }).catch(() => { if (!controller.signal.aborted) setUsageFailure({ message: translate.current('connection'), fields: [] }) })
    return () => controller.abort()
  }, [month, userQuery, session.revision, adminReady, ledger])

  useEffect(() => {
    if (!adminReady) return
    const controller = new AbortController()
    epochRef.current += 1
    setAudit(null); setAuditFailure(null); setMorePending(false)
    api.GET('/api/admin/ai/audit', { params: { query: { limit: 50 } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = aiAdminAuditResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) setAudit({ items: parsed.data.data, nextCursor: parsed.data.nextCursor })
      else setAuditFailure(apiFailure(result.error, translate.current('failed')))
    }).catch(() => { if (!controller.signal.aborted) setAuditFailure({ message: translate.current('connection'), fields: [] }) })
    return () => controller.abort()
  }, [session.revision, adminReady, ledger])

  async function loadMoreAudit() {
    if (!audit?.nextCursor) return
    const revision = sessionRevision()
    const epoch = epochRef.current
    const cursor = audit.nextCursor
    setMorePending(true)
    try {
      const result = await api.GET('/api/admin/ai/audit', { params: { query: { limit: 50, cursor } } })
      if (!alive(revision) || epochRef.current !== epoch) return
      const parsed = aiAdminAuditResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setAuditFailure(apiFailure(result.error, t('failed'))); return }
      setAudit(known => {
        if (!known || known.nextCursor !== cursor) return known
        return { items: [...known.items, ...parsed.data.data.filter(event => !known.items.some(seen => seen.id === event.id))], nextCursor: parsed.data.nextCursor }
      })
    } catch { if (alive(revision) && epochRef.current === epoch) setAuditFailure({ message: t('connection'), fields: [] }) }
    finally { if (alive(revision) && epochRef.current === epoch) setMorePending(false) }
  }

  return <AdminAiShell view="usage" state={state}>
    <form className="admin-ai-usage-controls" onSubmit={event => { event.preventDefault(); setUserQuery(user.trim()) }}>
      <label>{c.usageMonth}<input type="month" data-testid="admin-ai-usage-month" value={month} onChange={event => setMonth(event.target.value)} /></label>
      <label>{c.usageUser}<input type="text" inputMode="numeric" value={user} onChange={event => setUser(event.target.value)} /></label>
      <button type="submit" className="secondary">{c.accessSearchAction}</button>
    </form>
    <FailureNotice failure={usageFailure} />
    {usage === null && !usageFailure ? <p role="status">{t('loading')}</p>
      : usage !== null && usage.length === 0 ? <div className="empty-state"><p>{c.usageEmpty}</p></div>
        : usage !== null && <>
          <div className="admin-ai-table-wrap admin-ai-usage-wrap" role="region" aria-label={c.viewUsage} tabIndex={0}><table data-testid="admin-ai-usage-table">
            <caption className="sr-only">{c.viewUsage}</caption>
            <thead><tr><th scope="col">{c.usageMonth}</th><th scope="col">{c.usageOwner}</th><th scope="col">{c.usageReserved}</th><th scope="col">{c.usageReservedCost}</th><th scope="col">{c.usageConsumed}</th><th scope="col">{c.usageReleased}</th><th scope="col">{c.usageUnknown}</th><th scope="col">{c.usageInputTokens}</th><th scope="col">{c.usageOutputTokens}</th><th scope="col">{c.usageEstimated}</th></tr></thead>
            <tbody>{usage.map((row, index) => <tr key={`${row.userId ?? 'site'}-${row.month}-${index}`}>
              <td>{row.month}</td>
              <td>{row.userId ? <code>{row.userId}</code> : c.usageGlobal}</td>
              <td className="num">{row.reserved}</td>
              <td className="num">{row.reservedCostCents}</td>
              <td className="num">{row.consumed}</td>
              <td className="num">{row.released}</td>
              <td className="num">{row.unknown}</td>
              <td className="num">{row.inputTokens ?? <span className="muted">—</span>}</td>
              <td className="num">{row.outputTokens ?? <span className="muted">—</span>}</td>
              <td className="num">{row.estimatedCostCents === null ? <span className="muted">—</span> : row.estimatedCostCents} {row.pricingCurrency ?? <span className="muted">—</span>}</td>
            </tr>)}</tbody>
          </table></div>
          <p className="muted">{c.usageCap}</p></>}

    <div className="admin-ai-region">
      <h2>{c.auditHeading}</h2>
      <FailureNotice failure={auditFailure} />
      {audit === null && !auditFailure ? <p role="status">{t('loading')}</p>
        : audit !== null && audit.items.length === 0 ? <div className="empty-state"><p>{c.auditEmpty}</p></div>
          : audit !== null && <div className="admin-ai-table-wrap" role="region" aria-label={c.auditHeading} tabIndex={0}><table data-testid="admin-ai-audit-table">
            <caption className="sr-only">{c.auditHeading}</caption>
            <thead><tr><th scope="col">{c.auditTime}</th><th scope="col">{c.auditAction}</th><th scope="col">{c.auditTarget}</th><th scope="col">{c.auditSummary}</th></tr></thead>
            <tbody>{audit.items.map(event => <tr key={event.id}>
              <td><time dateTime={event.createdAt}>{fmtDateTime.format(new Date(event.createdAt))}</time></td>
              <td><code>{event.action}</code></td>
              <td>{event.targetType}{event.targetId ? <> · <code>{event.targetId}</code></> : null}</td>
              <td>{event.summary}</td>
            </tr>)}</tbody>
          </table></div>}
      {audit?.nextCursor && <button type="button" className="secondary" disabled={morePending} onClick={() => void loadMoreAudit()}>{morePending ? '…' : c.loadMore}</button>}
    </div>
  </AdminAiShell>
}
