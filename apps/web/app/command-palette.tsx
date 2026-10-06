import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { diarySummaryListResponseSchema, type DiarySummary } from '@diary/contracts/diary-summary'
import { guruDirectoryQuerySchema, guruDirectoryResponseSchema, guruStocksQuerySchema, guruStocksResponseSchema } from '@diary/contracts'
import { api, useUi } from './ui'
import { useSessionState } from './session'
import { Icon, type IconName } from './icons'
import { destinationLabel, destinations, matchScore, symbolCandidate } from './destinations'
import './command-palette.css'

const copy = {
  'zh-TW': {
    open: '搜尋與前往', title: '搜尋', placeholder: '搜尋日記內容、大師、公司或頁面…',
    diaries: '日記', goTo: '前往', company: '公司', recent: '近期日記', gurus: '投資大師', stocks: '大師持倉股票',
    empty: '沒有符合的結果。', searching: '搜尋中…', hint: '↑↓ 選擇 · Enter 開啟 · Esc 關閉',
    openCompany: '開啟', failed: '日記搜尋暫時無法完成。',
  },
  'zh-CN': {
    open: '搜索与前往', title: '搜索', placeholder: '搜索日记内容、大师、公司或页面…',
    diaries: '日记', goTo: '前往', company: '公司', recent: '近期日记', gurus: '投资大师', stocks: '大师持仓股票',
    empty: '没有符合的结果。', searching: '搜索中…', hint: '↑↓ 选择 · Enter 打开 · Esc 关闭',
    openCompany: '打开', failed: '日记搜索暂时无法完成。',
  },
  en: {
    open: 'Search and go', title: 'Search', placeholder: 'Search diary text, investors, companies or pages…',
    diaries: 'Diaries', goTo: 'Go to', company: 'Company', recent: 'Recent diaries', gurus: 'Investors', stocks: 'Guru stocks',
    empty: 'No matches.', searching: 'Searching…', hint: '↑↓ select · Enter open · Esc close',
    openCompany: 'Open', failed: 'Diary search is unavailable right now.',
  },
} as const

/** Visible triggers open the palette through the same path the shortcut uses. */
const OPEN_EVENT = 'diary-open-palette'

/** A discoverable entry point; the shortcut alone would never be found. */
export function CommandPaletteTrigger({ compact = false }: { compact?: boolean }) {
  const { locale } = useUi()
  const c = copy[locale]
  return <button type="button" className={compact ? 'secondary palette-trigger palette-trigger-compact' : 'secondary palette-trigger'}
    data-testid={compact ? 'mobile-command-palette-trigger' : 'command-palette-trigger'}
    aria-label={compact ? c.open : undefined}
    onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
    <Icon name="compass" size={17} aria-hidden="true" />
    {!compact && <><span>{c.open}</span><kbd>⌘K</kbd></>}
  </button>
}

const DEBOUNCE_MS = 220
const MAX_DIARIES = 6
const MAX_DESTINATIONS = 6
const MIN_SEARCH_LENGTH = 2

type Result = { key: string; path: string; label: string; detail?: string; icon: IconName; section: string }
type GuruSearchItem = ReturnType<typeof guruDirectoryResponseSchema.parse>['data'][number]
type GuruStockSearchItem = ReturnType<typeof guruStocksResponseSchema.parse>['data']['items'][number]

/** The matched run inside a search snippet, marked without using innerHTML. */
function Snippet({ snippet }: { snippet: NonNullable<DiarySummary['searchSnippet']> }) {
  return <span className="palette-snippet">
    {snippet.text.slice(0, snippet.matchStart)}
    <mark>{snippet.text.slice(snippet.matchStart, snippet.matchEnd)}</mark>
    {snippet.text.slice(snippet.matchEnd)}
  </span>
}

/**
 * Diary-first search, reachable from anywhere with ⌘/Ctrl K.
 *
 * The diary library already carries full-text search with server-built
 * snippets; this gives that search a global entry point instead of requiring a
 * reader to be on /diaries first. Destinations and a bare ticker are matched in
 * the same list, which is also how routes with no sidebar slot stay reachable.
 */
export function CommandPalette({ role }: { role: 'USER' | 'ADMIN' | null }) {
  const { locale, t } = useUi()
  const c = copy[locale]
  const session = useSessionState()
  const navigate = useNavigate()
  const location = useLocation()
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [diaries, setDiaries] = useState<DiarySummary[]>([])
  const [guruResults, setGuruResults] = useState<GuruSearchItem[]>([])
  const [stockResults, setStockResults] = useState<GuruStockSearchItem[]>([])
  const [researchSearching, setResearchSearching] = useState(false)
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState(0)

  const close = useCallback(() => {
    setOpen(false)
    if (dialog.current?.open) dialog.current.close()
    requestAnimationFrame(() => trigger.current?.focus())
  }, [])

  const show = useCallback(() => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setQuery(''); setDebounced(''); setDiaries([]); setGuruResults([]); setStockResults([]); setFailed(false); setActive(0)
    setOpen(true)
  }, [])

  useEffect(() => {
    if (session.authenticated !== true) return
    function key(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey) return
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      if (open) close(); else show()
    }
    window.addEventListener('keydown', key)
    window.addEventListener(OPEN_EVENT, show)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener(OPEN_EVENT, show) }
  }, [session.authenticated, open, close, show])

  useEffect(() => { if (open) dialog.current?.showModal() }, [open])
  useEffect(() => { if (session.authenticated === false) close() }, [session.authenticated, close])
  // A navigation means the reader has arrived; the palette must not survive it.
  useEffect(() => { close() }, [location.key, close])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!open) return
    // An empty or one-character query shows recent diaries instead of searching:
    // a single character matches almost everything and tells the reader nothing.
    const search = debounced.length >= MIN_SEARCH_LENGTH ? debounced : undefined
    const controller = new AbortController()
    setSearching(true); setFailed(false)
    api.GET('/api/diaries/summary', {
      params: { query: { page: 1, limit: MAX_DIARIES, sortBy: 'date-desc', ...(search ? { search } : {}) } },
      ...(search ? { headers: { 'x-diary-search-snippet': '1' } } : {}),
      signal: controller.signal,
    }).then(result => {
      if (controller.signal.aborted) return
      if (!result.response.ok || !result.data) { setFailed(true); setDiaries([]); return }
      setDiaries(diarySummaryListResponseSchema.parse(result.data).data)
    }).catch(() => { if (!controller.signal.aborted) { setFailed(true); setDiaries([]) } })
      .finally(() => { if (!controller.signal.aborted) setSearching(false) })
    return () => controller.abort()
  }, [open, debounced, session.revision])

  useEffect(() => {
    if (!open || debounced.length < MIN_SEARCH_LENGTH) {
      setGuruResults([]); setStockResults([]); setResearchSearching(false)
      return
    }
    const controller = new AbortController()
    setResearchSearching(true)
    const guruQuery = guruDirectoryQuerySchema.parse({ search: debounced, page: 1, limit: MAX_DIARIES, sort: 'az' })
    const stockQuery = guruStocksQuerySchema.parse({ search: debounced, page: 1, limit: MAX_DIARIES, ranking: 'most-held' })
    void Promise.allSettled([
      api.GET('/api/gurus', { params: { query: guruQuery }, signal: controller.signal }),
      api.GET('/api/gurus/stocks', { params: { query: stockQuery }, signal: controller.signal }),
    ]).then(([guruResult, stockResult]) => {
      if (controller.signal.aborted) return
      if (guruResult.status === 'fulfilled' && guruResult.value.response.ok) {
        const parsed = guruDirectoryResponseSchema.safeParse(guruResult.value.data)
        setGuruResults(parsed.success ? parsed.data.data : [])
      } else setGuruResults([])
      if (stockResult.status === 'fulfilled' && stockResult.value.response.ok) {
        const parsed = guruStocksResponseSchema.safeParse(stockResult.value.data)
        setStockResults(parsed.success ? parsed.data.data.items : [])
      } else setStockResults([])
    }).finally(() => { if (!controller.signal.aborted) setResearchSearching(false) })
    return () => controller.abort()
  }, [open, debounced, session.revision])

  const results = useMemo<Result[]>(() => {
    const text = debounced
    const symbol = symbolCandidate(text)
    const matched = destinations(locale)
      .filter(destination => role === 'ADMIN' || !destination.admin)
      .map(destination => {
        const label = destinationLabel(destination, locale)
        const score = matchScore(label, text)
        return score === null ? null : { destination, label, score }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
      .slice(0, MAX_DESTINATIONS)
    return [
      ...(symbol ? [{
        key: `symbol:${symbol}`, path: `/stocks/${symbol}`, label: symbol,
        detail: c.openCompany, icon: 'chart' as IconName, section: c.company,
      }] : []),
      ...diaries.map(diary => ({
        key: `diary:${diary.id}`, path: `/diaries/${diary.id}`, label: diary.title,
        detail: diary.date, icon: 'book' as IconName,
        section: text.length >= MIN_SEARCH_LENGTH ? c.diaries : c.recent,
      })),
      ...guruResults.map(guru => ({
        key: `guru:${guru.profile.slug}`, path: `/gurus/${guru.profile.slug}`, label: guru.profile.name,
        detail: guru.profile.managerName, icon: 'compass' as IconName, section: c.gurus,
      })),
      ...stockResults.map(stock => ({
        key: `stock-guru:${stock.securityId}`, path: stock.ticker ? `/stocks/${encodeURIComponent(stock.ticker)}/gurus` : '/gurus/stocks',
        label: stock.company, detail: stock.ticker ?? undefined, icon: 'chart' as IconName, section: c.stocks,
      })),
      ...matched.map(entry => ({
        key: `go:${entry.destination.path}`, path: entry.destination.path, label: entry.label,
        icon: entry.destination.icon, section: c.goTo,
      })),
    ]
  }, [debounced, diaries, guruResults, stockResults, locale, role, c])

  const snippets = useMemo(() => new Map(diaries.map(diary => [`diary:${diary.id}`, diary.searchSnippet])), [diaries])

  useEffect(() => { setActive(0) }, [debounced, diaries.length, guruResults.length, stockResults.length])

  function keys(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (results.length === 0) return
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActive(current => (current + delta + results.length) % results.length)
      return
    }
    if (event.key === 'Enter') {
      const result = results[active]
      if (!result) return
      event.preventDefault()
      close()
      navigate(result.path)
    }
  }

  if (session.authenticated !== true) return null

  let section = ''
  return <dialog ref={dialog} className="palette-dialog" aria-label={c.title}
    onCancel={event => { event.preventDefault(); close() }}
    onClick={event => { if (event.target === event.currentTarget) close() }}>
    <div className="palette-panel">
      <div className="palette-search">
        <Icon name="compass" size={18} aria-hidden="true" />
        <input ref={input} type="search" autoFocus value={query} role="combobox"
          aria-expanded aria-controls="palette-results" aria-label={c.title}
          aria-activedescendant={results[active] ? `palette-${results[active].key}` : undefined}
          placeholder={c.placeholder} onChange={event => setQuery(event.target.value)} onKeyDown={keys} />
        <button type="button" className="secondary" onClick={close}>{t('close')}</button>
      </div>
      {failed && <p className="palette-note" role="alert">{c.failed}</p>}
      {(searching || researchSearching) && results.length === 0 && <p className="palette-note" role="status">{c.searching}</p>}
      {!searching && !researchSearching && results.length === 0 && !failed && <p className="palette-note" role="status">{c.empty}</p>}
      <ul className="palette-results" id="palette-results" role="listbox" aria-label={c.title}>
        {results.map((result, index) => {
          const heading = result.section !== section ? result.section : null
          section = result.section
          const snippet = snippets.get(result.key)
          return <li key={result.key}>
            {heading && <p className="palette-section" aria-hidden="true">{heading}</p>}
            {/* A real option row, activated by click or by Enter on the input;
                the mouse never steals the keyboard's active position. */}
            <button type="button" role="option" id={`palette-${result.key}`}
              aria-selected={index === active} className={index === active ? 'palette-option is-active' : 'palette-option'}
              onMouseEnter={() => setActive(index)}
              onClick={() => { close(); navigate(result.path) }}>
              <Icon name={result.icon} size={17} aria-hidden="true" />
              <span className="palette-label">
                <span className="palette-title">{result.label}</span>
                {snippet && <Snippet snippet={snippet} />}
              </span>
              {result.detail && <span className="palette-detail">{result.detail}</span>}
            </button>
          </li>
        })}
      </ul>
      <p className="palette-hint">{c.hint}</p>
    </div>
  </dialog>
}
