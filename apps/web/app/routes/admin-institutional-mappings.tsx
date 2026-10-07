import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  adminInstitutionalIdentityEventCreateRequestSchema,
  adminInstitutionalIdentityEventListResponseSchema,
  adminInstitutionalIdentityEventResponseSchema,
  adminInstitutionalMappingListResponseSchema,
  adminInstitutionalMappingOverrideRequestSchema,
  adminInstitutionalMappingOverrideResponseSchema,
  adminInstitutionalSecurityCreateRequestSchema,
  adminInstitutionalSecurityCreateResponseSchema,
  adminInstitutionalSecurityListResponseSchema,
  type InstitutionalMappingRow,
  type InstitutionalSecurity,
} from '@diary/contracts/admin-institutional'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { signInPath } from '../session'
import { api, LoadingBlock, useUi } from '../ui'
import './admin-institutional-mappings.css'
import { formatInstantUtc } from '../market-display';

type Locale = 'zh-TW' | 'zh-CN' | 'en'
type Filter = '' | 'UNRESOLVED' | 'AMBIGUOUS' | 'MANUAL_OVERRIDE'
type SecurityChoice = Pick<InstitutionalSecurity, 'id' | 'issuer' | 'titleOfClass' | 'status' | 'identifiers'> & Partial<Pick<InstitutionalSecurity, 'sourceUrl'>>

const copy = {
  'zh-TW': {
    title: '機構持倉映射', intro: '按 CUSIP 或 FIGI 審核尚未解決的持倉，並保留每次人工決定的來源與理由。',
    search: '搜尋發行人、CUSIP、FIGI 或 accession', searchAction: '搜尋', filter: '映射狀態', allOpen: '待處理（未解決及有歧義）', unresolved: '未解決', ambiguous: '有歧義', manual: '人工覆核',
    readout: '符合條件的持倉', filingCoverage: '申報持倉映射覆蓋率', period: '申報期', parsed: '已解析列', accession: 'Accession', issuer: 'SEC 申報發行人', identifier: '識別碼', security: '目前證券', state: '解析狀態', action: '審核', open: '審核映射', close: '收合', noRows: '目前沒有符合條件的映射項目。', noSearch: '沒有符合搜尋條件的持倉。', loading: '正在載入映射佇列…', loadFailed: '無法載入映射佇列。請重試。', retry: '重試', page: '頁', previous: '上一頁', next: '下一頁',
    resolved: '已匹配', unresolvedStatus: '未解決', ambiguousStatus: '有歧義', manualStatus: '人工覆核', matchedHint: '自動識別結果僅供審核；人工連結只會在管理員確認來源後建立。',
    candidates: '候選證券', searchSecurity: '搜尋現有證券', querySecurity: '公司、代號、CUSIP 或 FIGI', searchSecurityAction: '搜尋證券', searching: '搜尋中…', noSecurities: '沒有找到證券。可建立一筆已核實的證券主檔。', useSecurity: '選用此證券', selected: '已選證券', noSelection: '請搜尋並選取證券，或建立已核實的證券主檔。',
    createSecurity: '建立已核實證券', cancel: '取消', issuerLabel: '發行人名稱（需核對來源）', titleClass: '證券類別', exchange: '交易所（可留空）', securityType: '證券類型', sector: '產業板塊（可留空）', industry: '細分產業（可留空）', cusip: 'CUSIP（可留空）', figi: 'FIGI（可留空）', ticker: '代號（只有核實後才填）', validFrom: '識別碼有效起日', validTo: '識別碼有效迄日（可留空）', sourceUrl: '發行人或 SEC 來源網址', verifySource: '我已核對此發行人或 SEC 來源。代號只會依據明確填寫的已核實識別碼建立。', create: '儲存證券主檔', creating: '正在儲存…', createFailed: '無法建立證券主檔。請檢查識別碼與來源。', sourceRequired: '請先填寫來源網址並確認已核實。', invalidSecurity: '證券資料未通過欄位驗證。請檢查必填識別碼與有效日期。', securitySaved: '已建立證券主檔。請檢查選取的證券，再儲存映射。',
    overrideHistory: '人工覆核歷程', currentAudit: '目前版本', priorAudit: '先前版本', version: '版本', actor: '管理員 ID', created: '記錄時間', reason: '原因', evidence: '管理員核實來源', supersedes: '取代的覆核 ID', noOverride: '目前沒有人工覆核紀錄。儲存後會新增一筆可追溯的版本。', overrideHint: '儲存會新增覆核版本並保留上方紀錄；請先核對證券、理由與一手來源。', saveOverride: '儲存人工映射', saving: '正在儲存…', saved: '映射已儲存，並保留覆核紀錄。', saveFailed: '無法儲存映射。請重試並確認證券與來源。', reasonLabel: '覆核理由', evidenceLabel: '發行人或 SEC 證據網址', verifyMapping: '我已核對此一手來源，並確認它支持這項證券映射。',
    adminVerified: '管理員核實來源', identityEvents: '公司識別事件', identityHistoryHint: '事件保留一手來源及生效日；代號變更會延續證券身份並記錄識別碼有效期間，不會改寫申報持倉。', identityNotReady: '需先有已核實的 CUSIP 或 FIGI 識別碼，才能記錄公司識別事件。', noEvents: '沒有已記錄的識別事件。', eventLoadFailed: '無法載入識別事件。', eventSaved: '識別事件已新增。', eventSaveFailed: '無法新增識別事件。', addEvent: '新增識別事件', eventKind: '事件類型', effectiveOn: '生效日期', newTicker: '新代號（已核實）', relatedSecurity: '關聯證券', searchRelated: '搜尋關聯證券', relatedQuery: '公司、代號或識別碼', selectRelated: '選取關聯證券', ratio: '新股數／舊股數', eventReason: '事件說明', evidenceUrl: '發行人或 SEC 來源網址', supersedesEvent: '取代先前事件（可留空）', noSupersededEvent: '不取代既有事件', confirmEvent: '我已核對發行人或 SEC 一手來源。', saveEvent: '記錄事件', tickerChange: '代號變更', merger: '合併', spinOff: '分拆公司', delisting: '下市', split: '股票分割', classContinuity: '股份類別連續性',
    forbidden: '此管理功能只供管理員使用。', unauthorized: '登入工作階段已失效，請重新登入。', back: '大師檔案', searchFailed: '無法搜尋證券，請重試。',
  },
  'zh-CN': {
    title: '机构持仓映射', intro: '按 CUSIP 或 FIGI 审核尚未解决的持仓，并保留每次人工决定的来源与理由。',
    search: '搜索发行人、CUSIP、FIGI 或 accession', searchAction: '搜索', filter: '映射状态', allOpen: '待处理（未解决及有歧义）', unresolved: '未解决', ambiguous: '有歧义', manual: '人工复核',
    readout: '符合条件的持仓', filingCoverage: '申报持仓映射覆盖率', period: '申报期', parsed: '已解析行', accession: 'Accession', issuer: 'SEC 申报发行人', identifier: '标识码', security: '当前证券', state: '解析状态', action: '审核', open: '审核映射', close: '收起', noRows: '目前没有符合条件的映射项目。', noSearch: '没有符合搜索条件的持仓。', loading: '正在加载映射队列…', loadFailed: '无法加载映射队列。请重试。', retry: '重试', page: '页', previous: '上一页', next: '下一页',
    resolved: '已匹配', unresolvedStatus: '未解决', ambiguousStatus: '有歧义', manualStatus: '人工复核', matchedHint: '自动识别结果仅供审核；人工链接只会在管理员确认来源后建立。',
    candidates: '候选证券', searchSecurity: '搜索现有证券', querySecurity: '公司、代码、CUSIP 或 FIGI', searchSecurityAction: '搜索证券', searching: '搜索中…', noSecurities: '没有找到证券。可建立一条已核实的证券主档。', useSecurity: '选用此证券', selected: '已选证券', noSelection: '请搜索并选取证券，或建立已核实的证券主档。',
    createSecurity: '建立已核实证券', cancel: '取消', issuerLabel: '发行人名称（需核对来源）', titleClass: '证券类别', exchange: '交易所（可留空）', securityType: '证券类型', sector: '行业板块（可留空）', industry: '细分行业（可留空）', cusip: 'CUSIP（可留空）', figi: 'FIGI（可留空）', ticker: '代码（仅在核实后填写）', validFrom: '标识码有效起日', validTo: '标识码有效止日（可留空）', sourceUrl: '发行人或 SEC 来源网址', verifySource: '我已核对此发行人或 SEC 来源。代码只会依据明确填写且已核实的标识码建立。', create: '保存证券主档', creating: '正在保存…', createFailed: '无法建立证券主档。请检查标识码与来源。', sourceRequired: '请先填写来源网址并确认已核实。', invalidSecurity: '证券资料未通过字段验证。请检查必填标识码与有效日期。', securitySaved: '已建立证券主档。请检查选中的证券，再保存映射。',
    overrideHistory: '人工复核历史', currentAudit: '当前版本', priorAudit: '先前版本', version: '版本', actor: '管理员 ID', created: '记录时间', reason: '原因', evidence: '管理员核实来源', supersedes: '取代的复核 ID', noOverride: '目前没有人工复核记录。保存后会新增一条可追溯的版本。', overrideHint: '保存会新增复核版本并保留上方记录；请先核对证券、理由与一手来源。', saveOverride: '保存人工映射', saving: '正在保存…', saved: '映射已保存，并保留复核记录。', saveFailed: '无法保存映射。请重试并确认证券与来源。', reasonLabel: '复核理由', evidenceLabel: '发行人或 SEC 证据网址', verifyMapping: '我已核对此一手来源，并确认它支持这项证券映射。',
    adminVerified: '管理员核实来源', identityEvents: '公司标识事件', identityHistoryHint: '事件保留一手来源及生效日；代码变更会延续证券身份并记录标识码有效期间，不会改写申报持仓。', identityNotReady: '需先有已核实的 CUSIP 或 FIGI 标识码，才能记录公司标识事件。', noEvents: '没有已记录的标识事件。', eventLoadFailed: '无法加载标识事件。', eventSaved: '标识事件已新增。', eventSaveFailed: '无法新增标识事件。', addEvent: '新增标识事件', eventKind: '事件类型', effectiveOn: '生效日期', newTicker: '新代码（已核实）', relatedSecurity: '关联证券', searchRelated: '搜索关联证券', relatedQuery: '公司、代码或标识码', selectRelated: '选取关联证券', ratio: '新股数／旧股数', eventReason: '事件说明', evidenceUrl: '发行人或 SEC 来源网址', supersedesEvent: '取代先前事件（可留空）', noSupersededEvent: '不取代既有事件', confirmEvent: '我已核对发行人或 SEC 一手来源。', saveEvent: '记录事件', tickerChange: '代码变更', merger: '合并', spinOff: '拆分公司', delisting: '退市', split: '股票拆分', classContinuity: '股份类别连续性',
    forbidden: '此管理功能仅供管理员使用。', unauthorized: '登录会话已失效，请重新登录。', back: '大师档案', searchFailed: '无法搜索证券，请重试。',
  },
  en: {
    title: 'Institutional mappings', intro: 'Review holdings that lack a resolved CUSIP or FIGI match. Every manual decision keeps its source and reason.',
    search: 'Search issuer, CUSIP, FIGI, or accession', searchAction: 'Search', filter: 'Mapping status', allOpen: 'Needs review (unresolved and ambiguous)', unresolved: 'Unresolved', ambiguous: 'Ambiguous', manual: 'Manual overrides',
    readout: 'matching holdings', filingCoverage: 'Filing mapping coverage', period: 'Reported period', parsed: 'Parsed rows', accession: 'Accession', issuer: 'SEC-reported issuer', identifier: 'Identifiers', security: 'Current security', state: 'Resolution', action: 'Review', open: 'Review mapping', close: 'Collapse', noRows: 'There are no mapping items in this view.', noSearch: 'No holdings match this search.', loading: 'Loading the mapping queue…', loadFailed: 'The mapping queue could not be loaded. Try again.', retry: 'Try again', page: 'Page', previous: 'Previous', next: 'Next',
    resolved: 'Matched', unresolvedStatus: 'Unresolved', ambiguousStatus: 'Ambiguous', manualStatus: 'Admin-verified', matchedHint: 'Automatic matches remain reviewable. A manual link is saved only after an administrator verifies its source.',
    candidates: 'Candidate securities', searchSecurity: 'Search existing securities', querySecurity: 'Company, ticker, CUSIP, or FIGI', searchSecurityAction: 'Search securities', searching: 'Searching…', noSecurities: 'No security was found. You can create a verified security record.', useSecurity: 'Select security', selected: 'Selected security', noSelection: 'Search for a security to select, or create a verified security record.',
    createSecurity: 'Create verified security', cancel: 'Cancel', issuerLabel: 'Issuer name (verify against source)', titleClass: 'Title of class', exchange: 'Exchange (optional)', securityType: 'Security type', sector: 'Sector (optional)', industry: 'Industry (optional)', cusip: 'CUSIP (optional)', figi: 'FIGI (optional)', ticker: 'Ticker (enter only when verified)', validFrom: 'Identifier valid from', validTo: 'Identifier valid through (optional)', sourceUrl: 'Issuer or SEC source URL', verifySource: 'I checked this issuer or SEC source. A ticker is added only from an explicitly entered, verified identifier.', create: 'Save security record', creating: 'Saving…', createFailed: 'The security could not be created. Check identifiers and source.', sourceRequired: 'Enter a source URL and confirm it has been verified.', invalidSecurity: 'The security did not pass field validation. Check a stable identifier and its validity date.', securitySaved: 'Security created. Review the selected record before saving the mapping.',
    overrideHistory: 'Manual override history', currentAudit: 'Current version', priorAudit: 'Prior version', version: 'Version', actor: 'Admin ID', created: 'Recorded', reason: 'Reason', evidence: 'Admin-verified source', supersedes: 'Supersedes override', noOverride: 'No manual override is recorded. Saving adds an auditable version.', overrideHint: 'Saving appends a new override and keeps the record above. Verify the security, reason, and primary source first.', saveOverride: 'Save manual mapping', saving: 'Saving…', saved: 'Mapping saved with its audit record.', saveFailed: 'The mapping could not be saved. Retry and verify the security and source.', reasonLabel: 'Review reason', evidenceLabel: 'Issuer or SEC evidence URL', verifyMapping: 'I checked this primary source and confirm it supports this security mapping.',
    adminVerified: 'Admin-verified source', identityEvents: 'Corporate identity events', identityHistoryHint: 'Events retain a primary source and effective date. Ticker changes keep the security identity and date identifiers; reported holdings stay unchanged.', identityNotReady: 'A verified CUSIP or FIGI is required before recording corporate identity events.', noEvents: 'No identity events are recorded.', eventLoadFailed: 'Identity events could not be loaded.', eventSaved: 'Identity event added.', eventSaveFailed: 'The identity event could not be added.', addEvent: 'Add identity event', eventKind: 'Event type', effectiveOn: 'Effective date', newTicker: 'New ticker (verified)', relatedSecurity: 'Related security', searchRelated: 'Search related securities', relatedQuery: 'Company, ticker, or identifier', selectRelated: 'Select related security', ratio: 'New shares per old share', eventReason: 'Event details', evidenceUrl: 'Issuer or SEC source URL', supersedesEvent: 'Supersede earlier event (optional)', noSupersededEvent: 'Do not supersede an event', confirmEvent: 'I checked the issuer or SEC primary source.', saveEvent: 'Record event', tickerChange: 'Ticker change', merger: 'Merger', spinOff: 'Spin-off', delisting: 'Delisting', split: 'Stock split', classContinuity: 'Share-class continuity',
    forbidden: 'This administration feature is restricted to administrators.', unauthorized: 'Your session has expired. Sign in again.', back: 'Guru profiles', searchFailed: 'Securities could not be searched. Try again.',
  },
} as const

function failureMessage(failure: Failure | null, c: typeof copy[Locale], fallback: string) {
  if (failure?.code === 'AUTH_FORBIDDEN') return c.forbidden
  if (failure?.code === 'AUTH_UNAUTHORIZED') return c.unauthorized
  return failure?.message ?? fallback
}

function eventKindLabel(kind: string, c: typeof copy[Locale]) {
  return ({ TICKER_CHANGE: c.tickerChange, MERGER: c.merger, SPIN_OFF: c.spinOff, DELISTING: c.delisting, STOCK_SPLIT: c.split, SHARE_CLASS_CONTINUITY: c.classContinuity } as Record<string, string>)[kind] ?? kind
}

function SourceLink({ href, label }: { href: string; label: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
}

function dateTime(value: string, locale: Locale) {
  return formatInstantUtc(locale, value)
}

function date(value: string | null, locale: Locale) {
  return value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : '—'
}

function secFilingUrl(accession: string) {
  const match = /^(\d{10})-(\d{2})-(\d{6})$/.exec(accession)
  return match ? `https://www.sec.gov/Archives/edgar/data/${Number(match[1])}/${accession.replaceAll('-', '')}/` : null
}

function SecurityIdentityEvents({ security, locale, c }: { security: SecurityChoice; locale: Locale; c: typeof copy[Locale] }) {
  const [events, setEvents] = useState<Awaited<ReturnType<typeof adminInstitutionalIdentityEventListResponseSchema.parse>> | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [kind, setKind] = useState<'TICKER_CHANGE' | 'MERGER' | 'SPIN_OFF' | 'DELISTING' | 'STOCK_SPLIT' | 'SHARE_CLASS_CONTINUITY'>('TICKER_CHANGE')
  const [effectiveOn, setEffectiveOn] = useState('')
  const [newTicker, setNewTicker] = useState('')
  const [ratio, setRatio] = useState('')
  const [reason, setReason] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [supersedesEventId, setSupersedesEventId] = useState('')
  const [relatedQuery, setRelatedQuery] = useState('')
  const [relatedRows, setRelatedRows] = useState<InstitutionalSecurity[]>([])
  const [relatedSearched, setRelatedSearched] = useState(false)
  const [relatedSearchPending, setRelatedSearchPending] = useState(false)
  const [relatedSecurity, setRelatedSecurity] = useState<InstitutionalSecurity | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [formFailure, setFormFailure] = useState<Failure | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setEvents(null); setFailure(null)
    void api.GET('/api/admin/institutional/securities/{id}/identity-events', { params: { path: { id: security.id }, query: { limit: 50, offset: 0 } }, signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return
        const parsed = adminInstitutionalIdentityEventListResponseSchema.safeParse(result.data)
        if (!result.response.ok || !parsed.success) { setFailure(apiFailure(result.error, c.eventLoadFailed)); return }
        setEvents(parsed.data); setFailure(null)
      })
      .catch(() => { if (!controller.signal.aborted) setFailure({ message: c.eventLoadFailed, fields: [] }) })
    return () => controller.abort()
  }, [attempt, c.eventLoadFailed, security.id])

  async function searchRelated() {
    if (relatedSearchPending) return
    setRelatedSearchPending(true); setFormFailure(null); setRelatedRows([])
    try {
      const result = await api.GET('/api/admin/institutional/securities', { params: { query: { q: relatedQuery.trim(), limit: 20, offset: 0 } } })
      const parsed = adminInstitutionalSecurityListResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFormFailure(apiFailure(result.error, c.searchFailed)); return }
      setFormFailure(null); setRelatedRows(parsed.data.data); setRelatedSearched(true)
    } catch { setFormFailure({ message: c.searchFailed, fields: [] }) }
    finally { setRelatedSearchPending(false) }
  }

  async function saveEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const base = { kind, effectiveOn, reason, evidenceUrl, confirmPrimarySource: confirmed, ...(supersedesEventId ? { supersedesEventId } : {}) }
    const body = kind === 'TICKER_CHANGE' ? { ...base, newTicker: newTicker.trim().toUpperCase() }
      : kind === 'MERGER' || kind === 'SPIN_OFF' ? { ...base, relatedSecurityId: relatedSecurity?.id ?? '' }
        : kind === 'STOCK_SPLIT' ? { ...base, newSharesPerOldShare: ratio }
          : kind === 'SHARE_CLASS_CONTINUITY' ? { ...base, relatedSecurityId: relatedSecurity?.id ?? '', comparable: true as const, newSharesPerOldShare: ratio }
            : base
    const parsedBody = adminInstitutionalIdentityEventCreateRequestSchema.safeParse(body)
    if (!parsedBody.success) { setFormFailure({ message: c.eventSaveFailed, fields: parsedBody.error.issues.map(issue => issue.path.join('.')) }); return }
    setPending(true); setFormFailure(null); setNotice('')
    try {
      const result = await api.POST('/api/admin/institutional/securities/{id}/identity-events', { params: { path: { id: security.id } }, body: parsedBody.data })
      const parsed = adminInstitutionalIdentityEventResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFormFailure(apiFailure(result.error, c.eventSaveFailed)); return }
      setNotice(c.eventSaved); setEffectiveOn(''); setNewTicker(''); setRatio(''); setReason(''); setEvidenceUrl(''); setSupersedesEventId(''); setRelatedSecurity(null); setConfirmed(false); setAttempt(value => value + 1)
    } catch { setFormFailure({ message: c.eventSaveFailed, fields: [] }) }
    finally { setPending(false) }
  }

  const needsRelated = kind === 'MERGER' || kind === 'SPIN_OFF' || kind === 'SHARE_CLASS_CONTINUITY'
  const needsRatio = kind === 'STOCK_SPLIT' || kind === 'SHARE_CLASS_CONTINUITY'
  return <section className="admin-mapping-events" aria-labelledby={`events-${security.id}`}>
    <h3 id={`events-${security.id}`}>{c.identityEvents}</h3>
    <p className="field-hint">{c.identityHistoryHint}</p>
    {failure && <><FailureNotice failure={failure} messageOverride={failureMessage(failure, c, c.eventLoadFailed)} /><button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{c.retry}</button></>}
    {events === null && !failure && <p role="status">{c.loading}</p>}
    {events && (events.data.length ? <ol className="admin-mapping-event-list">{events.data.map(item => <li key={item.id}>
      <div><strong>{eventKindLabel(item.kind, c)}</strong><span>{date(item.effectiveOn, locale)}</span></div>
      <p>{item.reason}</p>
      <dl><div><dt>{c.actor}</dt><dd><code>{item.actorUserId}</code></dd></div><div><dt>{c.created}</dt><dd><time dateTime={item.verifiedAt}>{dateTime(item.verifiedAt, locale)}</time></dd></div>{item.newTicker && <div><dt>{c.ticker}</dt><dd><code>{item.newTicker}</code></dd></div>}{item.newSharesPerOldShare && <div><dt>{c.ratio}</dt><dd><code>{item.newSharesPerOldShare}</code></dd></div>}{item.supersedesEventId && <div><dt>{c.supersedes}</dt><dd><code>{item.supersedesEventId}</code></dd></div>}</dl>
      <SourceLink href={item.evidenceUrl} label={c.adminVerified} />
    </li>)}</ol> : <p className="admin-mapping-empty-note">{c.noEvents}</p>)}
    {notice && <p role="status" className="admin-mapping-success">{notice}</p>}
    <details className="admin-mapping-event-create">
      <summary>{c.addEvent}</summary>
      <form onSubmit={saveEvent} aria-busy={pending}>
        <label>{c.eventKind}<select value={kind} onChange={event => { setKind(event.target.value as typeof kind); setRelatedSecurity(null); setFormFailure(null) }} disabled={pending}>
          <option value="TICKER_CHANGE">{c.tickerChange}</option><option value="STOCK_SPLIT">{c.split}</option><option value="MERGER">{c.merger}</option><option value="SPIN_OFF">{c.spinOff}</option><option value="DELISTING">{c.delisting}</option><option value="SHARE_CLASS_CONTINUITY">{c.classContinuity}</option>
        </select></label>
        <label>{c.effectiveOn}<input type="date" required value={effectiveOn} onChange={event => setEffectiveOn(event.target.value)} disabled={pending} /></label>
        {kind === 'TICKER_CHANGE' && <label>{c.newTicker}<input required maxLength={15} autoCapitalize="characters" value={newTicker} onChange={event => setNewTicker(event.target.value.toUpperCase())} disabled={pending} /></label>}
        {needsRatio && <label>{c.ratio}<input type="number" min="0.000000000001" step="any" required value={ratio} onChange={event => setRatio(event.target.value)} disabled={pending} /></label>}
        {needsRelated && <div className="admin-mapping-related">
          <p>{relatedSecurity ? `${c.relatedSecurity}: ${relatedSecurity.issuer} · ${relatedSecurity.id}` : c.relatedSecurity}</p>
          <div className="admin-mapping-related-search"><label>{c.searchRelated}<input value={relatedQuery} onChange={event => setRelatedQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void searchRelated() } }} /></label><button className="secondary" type="button" disabled={relatedSearchPending} onClick={() => void searchRelated()}>{relatedSearchPending ? c.searching : c.searchSecurityAction}</button></div>
          {relatedRows.length > 0 && <ul>{relatedRows.map(row => <li key={row.id}><button className="secondary" type="button" onClick={() => { setRelatedSecurity(row); setRelatedRows([]); setFormFailure(null) }}>{c.selectRelated}: {row.issuer} · {row.id}</button></li>)}</ul>}
          {relatedSearched && relatedRows.length === 0 && !relatedSearchPending && !formFailure && <p className="admin-mapping-empty-note">{c.noSecurities}</p>}
        </div>}
        <label>{c.eventReason}<textarea required minLength={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} disabled={pending} /></label>
        <label>{c.evidenceUrl}<input type="url" required value={evidenceUrl} onChange={event => setEvidenceUrl(event.target.value)} disabled={pending} /></label>
        {events && events.data.length > 0 && <label>{c.supersedesEvent}<select value={supersedesEventId} onChange={event => setSupersedesEventId(event.target.value)} disabled={pending}><option value="">{c.noSupersededEvent}</option>{events.data.map(item => <option key={item.id} value={item.id}>{eventKindLabel(item.kind, c)} · {date(item.effectiveOn, locale)} · {item.id}</option>)}</select></label>}
        <label className="admin-mapping-check"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={pending} />{c.confirmEvent}</label>
        <FailureNotice failure={formFailure} messageOverride={failureMessage(formFailure, c, c.eventSaveFailed)} />
        <button type="submit" disabled={pending || (needsRelated && !relatedSecurity)}>{pending ? c.saving : c.saveEvent}</button>
      </form>
    </details>
  </section>
}

function MappingDetails({ row, locale, c, onSaved }: { row: InstitutionalMappingRow; locale: Locale; c: typeof copy[Locale]; onSaved: () => void }) {
  const [securityQuery, setSecurityQuery] = useState('')
  const [securityRows, setSecurityRows] = useState<InstitutionalSecurity[]>([])
  const [securitySearched, setSecuritySearched] = useState(false)
  const [securitySearchPending, setSecuritySearchPending] = useState(false)
  const [securityFailure, setSecurityFailure] = useState<Failure | null>(null)
  const [selectedSecurity, setSelectedSecurity] = useState<SecurityChoice | null>(row.security)
  const [createOpen, setCreateOpen] = useState(false)
  const [createFailure, setCreateFailure] = useState<Failure | null>(null)
  const [createPending, setCreatePending] = useState(false)
  const [createNotice, setCreateNotice] = useState('')
  const [issuer, setIssuer] = useState(row.holding.issuer)
  const [titleOfClass, setTitleOfClass] = useState(row.holding.titleOfClass || 'Common Stock')
  const [exchange, setExchange] = useState('')
  const [securityType, setSecurityType] = useState('Common Stock')
  const [sector, setSector] = useState('')
  const [industry, setIndustry] = useState('')
  const [cusip, setCusip] = useState(row.holding.cusip ?? '')
  const [figi, setFigi] = useState(row.holding.figi ?? '')
  const [ticker, setTicker] = useState('')
  const [identifierFrom, setIdentifierFrom] = useState(row.holding.periodEnd ?? '')
  const [identifierTo, setIdentifierTo] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceConfirmed, setSourceConfirmed] = useState(false)
  const [reason, setReason] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [overrideConfirmed, setOverrideConfirmed] = useState(false)
  const [overridePending, setOverridePending] = useState(false)
  const [overrideFailure, setOverrideFailure] = useState<Failure | null>(null)
  const [overrideNotice, setOverrideNotice] = useState('')

  async function searchSecurities(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (securitySearchPending) return
    setSecuritySearchPending(true); setSecurityFailure(null); setSecurityRows([]); setSecuritySearched(false)
    try {
      const result = await api.GET('/api/admin/institutional/securities', { params: { query: { q: securityQuery.trim(), limit: 20, offset: 0 } } })
      const parsed = adminInstitutionalSecurityListResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setSecurityFailure(apiFailure(result.error, c.searchFailed)); return }
      setSecurityFailure(null); setSecurityRows(parsed.data.data); setSecuritySearched(true)
    } catch { setSecurityFailure({ message: c.searchFailed, fields: [] }) }
    finally { setSecuritySearchPending(false) }
  }

  async function createSecurity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (createPending) return
    const identifiers = [
      ...(cusip.trim() ? [{ type: 'CUSIP' as const, value: cusip.trim().toUpperCase(), validFrom: identifierFrom, validTo: identifierTo || null }] : []),
      ...(figi.trim() ? [{ type: 'FIGI' as const, value: figi.trim().toUpperCase(), validFrom: identifierFrom, validTo: identifierTo || null }] : []),
      ...(ticker.trim() ? [{ type: 'TICKER' as const, value: ticker.trim().toUpperCase(), validFrom: identifierFrom, validTo: identifierTo || null }] : []),
    ]
    const parsedBody = adminInstitutionalSecurityCreateRequestSchema.safeParse({
      issuer, titleOfClass, exchange: exchange.trim() || null, securityType,
      sector: sector.trim() || null, industry: industry.trim() || null, status: 'ACTIVE',
      sourceUrl: sourceUrl.trim(), confirmPrimarySource: sourceConfirmed, identifiers,
    })
    if (!parsedBody.success) { setCreateFailure({ message: sourceConfirmed ? c.invalidSecurity : c.sourceRequired, fields: parsedBody.error.issues.map(issue => issue.path.join('.')) }); return }
    setCreatePending(true); setCreateFailure(null)
    try {
      const result = await api.POST('/api/admin/institutional/securities', { body: parsedBody.data })
      const parsed = adminInstitutionalSecurityCreateResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setCreateFailure(apiFailure(result.error, c.createFailed)); return }
      const security = parsed.data.data
      setSelectedSecurity(security); setCreateOpen(false); setSecurityRows([]); setCreateNotice(c.securitySaved)
    } catch { setCreateFailure({ message: c.createFailed, fields: [] }) }
    finally { setCreatePending(false) }
  }

  async function saveOverride(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedSecurity || overridePending) return
    const parsedBody = adminInstitutionalMappingOverrideRequestSchema.safeParse({ securityId: selectedSecurity.id, reason, evidenceUrl, confirmPrimarySource: overrideConfirmed })
    if (!parsedBody.success) { setOverrideFailure({ message: c.saveFailed, fields: parsedBody.error.issues.map(issue => issue.path.join('.')) }); return }
    setOverridePending(true); setOverrideFailure(null); setOverrideNotice('')
    try {
      const result = await api.POST('/api/admin/institutional/mappings/{holdingId}/override', { params: { path: { holdingId: row.holding.id } }, body: parsedBody.data })
      const parsed = adminInstitutionalMappingOverrideResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setOverrideFailure(apiFailure(result.error, c.saveFailed)); return }
      setOverrideNotice(c.saved); setReason(''); setEvidenceUrl(''); setOverrideConfirmed(false); onSaved()
    } catch { setOverrideFailure({ message: c.saveFailed, fields: [] }) }
    finally { setOverridePending(false) }
  }

  const choices: SecurityChoice[] = row.candidates.map(candidate => ({ ...candidate, sourceUrl: candidate.identifiers[0]?.sourceUrl }))
  return <div className="admin-mapping-detail" data-testid="admin-mapping-detail">
    <p className="admin-mapping-detail-hint">{row.resolution.reason}. {c.matchedHint}</p>
    {row.overrideHistory.length > 0 ? <section className="admin-mapping-audit" aria-labelledby={`override-${row.holding.id}`}>
      <h3 id={`override-${row.holding.id}`}>{c.overrideHistory}</h3>
      <ol className="admin-mapping-override-history">{row.overrideHistory.map(override => <li key={override.id}>
        <h4>{override.id === row.override?.id ? c.currentAudit : c.priorAudit} · {c.version} {override.version}</h4>
        <dl><div><dt>{c.actor}</dt><dd><code>{override.actorUserId}</code></dd></div><div><dt>{c.created}</dt><dd><time dateTime={override.createdAt}>{dateTime(override.createdAt, locale)}</time></dd></div><div><dt>{c.reason}</dt><dd>{override.reason}</dd></div><div><dt>{c.supersedes}</dt><dd>{override.supersedesOverrideId ? <code>{override.supersedesOverrideId}</code> : '—'}</dd></div></dl>
        <SourceLink href={override.evidenceUrl} label={c.adminVerified} />
      </li>)}</ol>
    </section> : <p className="admin-mapping-empty-note">{c.noOverride}</p>}

    {selectedSecurity && <p className="admin-mapping-selected"><strong>{c.selected}:</strong> {selectedSecurity.issuer} · {selectedSecurity.titleOfClass} · <code>{selectedSecurity.id}</code>{selectedSecurity.sourceUrl && <> · <SourceLink href={selectedSecurity.sourceUrl} label={c.adminVerified} /></>}</p>}
    {!selectedSecurity && choices.length > 0 && <section aria-labelledby={`candidates-${row.holding.id}`} className="admin-mapping-candidates">
      <h3 id={`candidates-${row.holding.id}`}>{c.candidates}</h3>
      <ul>{choices.map(choice => <li key={choice.id}><span>{choice.issuer} · {choice.titleOfClass} · <code>{choice.id}</code></span><button className="secondary" type="button" aria-label={`${c.useSecurity}: ${choice.issuer}`} onClick={() => { setSelectedSecurity(choice); setOverrideFailure(null) }}>{c.useSecurity}</button></li>)}</ul>
    </section>}
    <form className="admin-mapping-security-search" onSubmit={searchSecurities}>
      <label>{c.searchSecurity}<input type="search" value={securityQuery} onChange={event => setSecurityQuery(event.target.value)} placeholder={c.querySecurity} /></label>
      <button className="secondary" type="submit" disabled={securitySearchPending}>{securitySearchPending ? c.searching : c.searchSecurityAction}</button>
    </form>
    {securitySearchPending && <p role="status">{c.searching}</p>}
    {securityFailure && <FailureNotice failure={securityFailure} messageOverride={failureMessage(securityFailure, c, c.searchFailed)} />}
    {securityRows.length > 0 && <ul className="admin-mapping-security-results">{securityRows.map(security => <li key={security.id}><div><strong>{security.issuer}</strong><span>{security.titleOfClass} · {security.identifiers.map(identifier => `${identifier.type} ${identifier.value}`).join(' · ')}</span></div><button type="button" className="secondary" aria-label={`${c.useSecurity}: ${security.issuer}`} onClick={() => { setSelectedSecurity(security); setSecurityRows([]); setCreateNotice('') }}>{c.useSecurity}</button></li>)}</ul>}
    {securitySearched && securityRows.length === 0 && !securitySearchPending && !securityFailure && <p className="admin-mapping-empty-note">{c.noSecurities}</p>}

    <button type="button" className="secondary admin-mapping-create-toggle" aria-expanded={createOpen} onClick={() => { setCreateOpen(value => !value); setCreateFailure(null) }}>{createOpen ? c.cancel : c.createSecurity}</button>
    {createNotice && <p role="status" className="admin-mapping-success">{createNotice}</p>}
    {createOpen && <form className="admin-mapping-create-form" onSubmit={createSecurity} aria-busy={createPending}>
      <div className="admin-mapping-form-grid">
        <label>{c.issuerLabel}<input required maxLength={1000} value={issuer} onChange={event => setIssuer(event.target.value)} disabled={createPending} /></label>
        <label>{c.titleClass}<input required maxLength={160} value={titleOfClass} onChange={event => setTitleOfClass(event.target.value)} disabled={createPending} /></label>
        <label>{c.exchange}<input maxLength={32} value={exchange} onChange={event => setExchange(event.target.value)} disabled={createPending} /></label>
        <label>{c.securityType}<input required maxLength={80} value={securityType} onChange={event => setSecurityType(event.target.value)} disabled={createPending} /></label>
        <label>{c.sector}<input maxLength={120} value={sector} onChange={event => setSector(event.target.value)} disabled={createPending} /></label>
        <label>{c.industry}<input maxLength={160} value={industry} onChange={event => setIndustry(event.target.value)} disabled={createPending} /></label>
      </div>
      <p className="field-hint">{c.matchedHint}</p>
      <div className="admin-mapping-form-grid">
        <label>{c.cusip}<input maxLength={9} value={cusip} onChange={event => setCusip(event.target.value.toUpperCase())} disabled={createPending} /></label>
        <label>{c.figi}<input maxLength={12} value={figi} onChange={event => setFigi(event.target.value.toUpperCase())} disabled={createPending} /></label>
        <label>{c.ticker}<input maxLength={15} value={ticker} onChange={event => setTicker(event.target.value.toUpperCase())} disabled={createPending} /></label>
        <label>{c.validFrom}<input type="date" required value={identifierFrom} onChange={event => setIdentifierFrom(event.target.value)} disabled={createPending} /></label>
        <label>{c.validTo}<input type="date" value={identifierTo} onChange={event => setIdentifierTo(event.target.value)} disabled={createPending} /></label>
        <label className="admin-mapping-source-field">{c.sourceUrl}<input type="url" required value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} disabled={createPending} /></label>
      </div>
      <label className="admin-mapping-check"><input type="checkbox" required checked={sourceConfirmed} onChange={event => setSourceConfirmed(event.target.checked)} disabled={createPending} />{c.verifySource}</label>
      <FailureNotice failure={createFailure} messageOverride={failureMessage(createFailure, c, c.createFailed)} />
      <button type="submit" disabled={createPending}>{createPending ? c.creating : c.create}</button>
    </form>}

    {selectedSecurity && (selectedSecurity.identifiers.some(identifier => identifier.type === 'CUSIP' || identifier.type === 'FIGI') && (selectedSecurity.sourceUrl || selectedSecurity.identifiers.some(identifier => identifier.sourceUrl))
      ? <SecurityIdentityEvents key={selectedSecurity.id} security={selectedSecurity} locale={locale} c={c} />
      : <p className="admin-mapping-empty-note">{c.identityNotReady}</p>)}
    {!selectedSecurity && <p className="admin-mapping-empty-note">{c.noSelection}</p>}

    {selectedSecurity && <form className="admin-mapping-override-form" onSubmit={saveOverride} aria-busy={overridePending}>
      <h3>{c.saveOverride}</h3><p className="field-hint">{c.overrideHint}</p>
      <label>{c.reasonLabel}<textarea required minLength={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} disabled={overridePending} /></label>
      <label>{c.evidenceLabel}<input type="url" required value={evidenceUrl} onChange={event => setEvidenceUrl(event.target.value)} disabled={overridePending} /></label>
      <label className="admin-mapping-check"><input type="checkbox" required checked={overrideConfirmed} onChange={event => setOverrideConfirmed(event.target.checked)} disabled={overridePending} />{c.verifyMapping}</label>
      <FailureNotice failure={overrideFailure} messageOverride={failureMessage(overrideFailure, c, c.saveFailed)} />
      {overrideNotice && <p role="status" className="admin-mapping-success">{overrideNotice}</p>}
      <button type="submit" disabled={overridePending}>{overridePending ? c.saving : c.saveOverride}</button>
    </form>}
  </div>
}

export default function AdminInstitutionalMappings() {
  const { locale } = useUi()
  const c = copy[locale]
  const [mobileView, setMobileView] = useState(false)
  const [rows, setRows] = useState<ReturnType<typeof adminInstitutionalMappingListResponseSchema.parse> | null>(null)
  const [filter, setFilter] = useState<Filter>('')
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [notice, setNotice] = useState('')
  const limit = 20

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setMobileView(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setRows(null); setFailure(null)
    void api.GET('/api/admin/institutional/mappings', { params: { query: { status: filter || undefined, search: submittedSearch || undefined, limit, offset } }, signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return
        const parsed = adminInstitutionalMappingListResponseSchema.safeParse(result.data)
        if (!result.response.ok || !parsed.success) { setFailure(apiFailure(result.error, c.loadFailed)); return }
        setRows(parsed.data); setFailure(null)
      })
      .catch(() => { if (!controller.signal.aborted) setFailure({ message: c.loadFailed, fields: [] }) })
    return () => controller.abort()
  }, [attempt, c.loadFailed, filter, limit, offset, submittedSearch])

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setOffset(0); setSubmittedSearch(search.trim()); setNotice(''); setAttempt(value => value + 1)
  }

  function changeFilter(value: Filter) {
    setFilter(value); setOffset(0); setExpandedId(null); setNotice('')
  }

  const total = rows?.pagination.total ?? 0
  const pageCount = rows ? Math.max(1, Math.ceil(rows.pagination.total / rows.pagination.limit)) : 1
  const page = Math.floor(offset / limit) + 1
  const stateLabel = (value: string) => value === 'MATCHED' ? c.resolved : value === 'AMBIGUOUS' ? c.ambiguousStatus : value === 'MANUAL_OVERRIDE' ? c.manualStatus : c.unresolvedStatus
  const formatPercent = (value: string) => `${value}%`
  const countLabel = locale === 'en' && total === 1 ? c.readout.replace('holdings', 'holding') : c.readout

  function rowCells(row: InstitutionalMappingRow) {
    const identifiers = [row.holding.cusip && `CUSIP ${row.holding.cusip}`, row.holding.figi && `FIGI ${row.holding.figi}`].filter(Boolean)
    const filingUrl = secFilingUrl(row.holding.accession)
    return <>
      <th scope="row" className="admin-mapping-main-cell"><strong>{row.holding.issuer || '—'}</strong><span>{row.holding.titleOfClass || '—'}</span></th>
      <td className="admin-mapping-ids">{identifiers.length ? identifiers.map(value => <code key={value}>{value}</code>) : <span>—</span>}</td>
      <td className="admin-mapping-filing"><code>{row.holding.accession}</code><time dateTime={row.holding.periodEnd ?? undefined}>{date(row.holding.periodEnd, locale)}</time>{filingUrl && <a href={filingUrl} target="_blank" rel="noopener noreferrer">SEC filing</a>}</td>
      <td><span className={`admin-mapping-status status-${row.resolution.status.toLowerCase().replace('_', '-')}`}>{stateLabel(row.resolution.status)}</span><span className="admin-mapping-reason">{row.resolution.reason}</span></td>
      <td>{row.security ? <><strong>{row.security.issuer}</strong><span>{row.security.identifiers.map(identifier => `${identifier.type} ${identifier.value}`).join(' · ')}</span></> : '—'}</td>
    </>
  }

  function renderDetails(row: InstitutionalMappingRow) {
    return <MappingDetails key={`${row.holding.id}-${row.override?.id ?? 'none'}`} row={row} locale={locale} c={c} onSaved={() => { setNotice(c.saved); setAttempt(value => value + 1) }} />
  }

  return <section className="admin-mappings-page" data-testid="admin-institutional-mappings">
    <header className="admin-mappings-header"><div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div><Link className="secondary" to="/admin/gurus">{c.back}</Link></header>
    <FailureNotice failure={failure} id="admin-mappings-load-error" messageOverride={failureMessage(failure, c, c.loadFailed)} />
    {failure?.code === 'AUTH_UNAUTHORIZED' && <Link to={signInPath('/admin/institutional/mappings')}>{c.unauthorized}</Link>}
    {notice && <p role="status" className="admin-mapping-success">{notice}</p>}
    {rows?.filing && <p className="admin-mapping-coverage" role="status"><strong>{c.filingCoverage}: {rows.filing.mappingCoverage ? formatPercent(rows.filing.mappingCoverage) : '—'}</strong><span>{c.period} {date(rows.filing.periodEnd, locale)} · {c.accession} <code>{rows.filing.accession}</code>{rows.filing.parsedRowCount !== null ? ` · ${c.parsed} ${rows.filing.parsedRowCount}` : ''}</span></p>}
    <section className="admin-mapping-queue" aria-labelledby="admin-mapping-queue-heading">
      <div className="admin-mapping-queue-heading"><div><h2 id="admin-mapping-queue-heading">{c.action}</h2><p className="admin-mapping-count" role="status">{rows ? `${total} ${countLabel}` : c.loading}</p></div>
        <form className="admin-mapping-filters" onSubmit={submitSearch}>
          <label>{c.search}<input type="search" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label>{c.filter}<select value={filter} onChange={event => changeFilter(event.target.value as Filter)}><option value="">{c.allOpen}</option><option value="UNRESOLVED">{c.unresolved}</option><option value="AMBIGUOUS">{c.ambiguous}</option><option value="MANUAL_OVERRIDE">{c.manual}</option></select></label>
          <button type="submit" className="secondary">{c.searchAction}</button>
        </form>
      </div>
      {rows === null && !failure && <LoadingBlock label={c.loading} lines={5} />}
      {failure && rows === null && <div className="admin-mapping-retry"><button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{c.retry}</button></div>}
      {rows && rows.data.length === 0 && <p className="admin-mapping-empty">{submittedSearch ? c.noSearch : c.noRows}</p>}
      {rows && rows.data.length > 0 && <>
        <div className="admin-mapping-table-wrap"><table className="admin-mapping-table">
          <caption>{c.title}</caption><thead><tr><th scope="col">{c.issuer}</th><th scope="col">{c.identifier}</th><th scope="col">{c.accession}</th><th scope="col">{c.state}</th><th scope="col">{c.security}</th><th scope="col"><span className="sr-only">{c.action}</span></th></tr></thead>
          <tbody>{rows.data.map(row => <Fragment key={row.holding.id}>
            <tr data-testid="admin-mapping-row">{rowCells(row)}<td><button type="button" className="secondary" aria-expanded={expandedId === row.holding.id} aria-controls={`mapping-detail-${row.holding.id}`} onClick={() => setExpandedId(current => current === row.holding.id ? null : row.holding.id)}>{expandedId === row.holding.id ? c.close : c.open}</button></td></tr>
            {expandedId === row.holding.id && !mobileView && <tr className="admin-mapping-detail-row"><td colSpan={6} id={`mapping-detail-${row.holding.id}`}>{renderDetails(row)}</td></tr>}
          </Fragment>)}</tbody>
        </table></div>
        <div className="admin-mapping-mobile-list">{rows.data.map(row => <article className="admin-mapping-mobile-row" key={row.holding.id} data-testid="admin-mapping-mobile-row">
          <header><div className="admin-mapping-main-cell"><strong>{row.holding.issuer || '—'}</strong><span>{row.holding.titleOfClass || '—'}</span></div><span className={`admin-mapping-status status-${row.resolution.status.toLowerCase().replace('_', '-')}`}>{stateLabel(row.resolution.status)}</span></header>
          <dl><div><dt>{c.identifier}</dt><dd>{row.holding.cusip ? <code>CUSIP {row.holding.cusip}</code> : '—'}{row.holding.figi ? <code>FIGI {row.holding.figi}</code> : null}</dd></div><div><dt>{c.accession}</dt><dd><code>{row.holding.accession}</code><span>{date(row.holding.periodEnd, locale)}</span>{secFilingUrl(row.holding.accession) && <a href={secFilingUrl(row.holding.accession)!} target="_blank" rel="noopener noreferrer">SEC filing</a>}</dd></div><div><dt>{c.security}</dt><dd>{row.security?.issuer ?? '—'}</dd></div><div><dt>{c.state}</dt><dd>{row.resolution.reason}</dd></div></dl>
          <button type="button" className="secondary" aria-expanded={expandedId === row.holding.id} aria-controls={`mapping-mobile-detail-${row.holding.id}`} onClick={() => setExpandedId(current => current === row.holding.id ? null : row.holding.id)}>{expandedId === row.holding.id ? c.close : c.open}</button>
          {expandedId === row.holding.id && mobileView && <div id={`mapping-mobile-detail-${row.holding.id}`}>{renderDetails(row)}</div>}
        </article>)}</div>
        {pageCount > 1 && <nav className="admin-mapping-pagination" aria-label={c.action}><button type="button" className="secondary" disabled={page <= 1} onClick={() => { setOffset(value => Math.max(0, value - limit)); setExpandedId(null) }}>{c.previous}</button><span>{c.page} {page} / {pageCount}</span><button type="button" className="secondary" disabled={page >= pageCount} onClick={() => { setOffset(value => value + limit); setExpandedId(null) }}>{c.next}</button></nav>}
      </>}
    </section>
  </section>
}
