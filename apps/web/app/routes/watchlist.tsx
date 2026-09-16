import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { stockWatchlistCreateRequestSchema, stockWatchlistResponseSchema, type StockWatchlistItem } from '@diary/contracts/watchlist';
import { api, useUi } from '../ui';
import { Icon } from '../icons';
import { apiFailure, FailureNotice, type Failure } from '../api-error';
import { signInPath } from '../session';
import '../trade-plan.css';
import '../watchlist.css';

const copy = {
  en: { title: 'Watchlist', hint: 'Keep companies close while you develop your investment view.', holdings: 'View holdings', tracked: 'Companies', researched: 'With research', unresearched: 'Not yet researched', addTitle: 'Quick add', placeholder: 'e.g. AAPL, MSFT, 2330', symbol: 'Stock symbol', add: 'Add company', listTitle: 'Watchlist', sortLabel: 'Sort by', sortOrder: 'Custom order', byResearch: 'Latest research', bySymbol: 'Symbol', order: 'Sort order', save: 'Save order', records: 'Research records', latest: 'Latest research', none: 'No research records yet.', more: 'More actions', viewResearch: 'View research', editOrder: 'Edit order', remove: 'Remove', empty: 'No companies yet. Add a symbol to start your research.', saved: 'Watchlist updated.', limit: 'Showing up to 100 companies, ordered by sort order. Add a removed symbol again to restore it.', invalid: 'Use 1–32 letters, numbers or dots.' },
  'zh-TW': { title: '關注清單', hint: '追蹤公司，逐步建立你的投資判斷。', holdings: '查看持倉', tracked: '關注公司', researched: '有研究記錄', unresearched: '尚未研究', addTitle: '快速加入關注標的', placeholder: '例如：AAPL、MSFT、2330', symbol: '股票代號', add: '加入公司', listTitle: '關注清單', sortLabel: '排序方式', sortOrder: '自訂排序', byResearch: '最近研究', bySymbol: '代號', order: '排序值', save: '儲存排序', records: '研究記錄', latest: '最近研究', none: '尚未有研究記錄。', more: '更多動作', viewResearch: '查看研究', editOrder: '編輯排序', remove: '移除', empty: '尚未關注公司。加入股票代號，開始研究。', saved: '已更新關注清單。', limit: '依排序值顯示最多 100 間公司。再次加入已移除的代號即可恢復。', invalid: '請輸入 1–32 個英文字母、數字或句點。' },
  'zh-CN': { title: '关注清单', hint: '追踪公司，逐步建立你的投资判断。', holdings: '查看持仓', tracked: '关注公司', researched: '有研究记录', unresearched: '尚未研究', addTitle: '快速加入关注标的', placeholder: '例如：AAPL、MSFT、2330', symbol: '股票代码', add: '加入公司', listTitle: '关注清单', sortLabel: '排序方式', sortOrder: '自定义排序', byResearch: '最近研究', bySymbol: '代码', order: '排序值', save: '保存排序', records: '研究记录', latest: '最近研究', none: '尚未有研究记录。', more: '更多操作', viewResearch: '查看研究', editOrder: '编辑排序', remove: '移除', empty: '尚未关注公司。加入股票代码，开始研究。', saved: '已更新关注清单。', limit: '按排序值显示最多 100 间公司。再次加入已移除的代号即可恢复。', invalid: '请输入 1–32 个英文字母、数字或句点。' },
};

type WatchlistCopy = (typeof copy)[keyof typeof copy];
type SortMode = 'order' | 'research' | 'symbol';

/** One compact row: identity, research state, latest note, order control, overflow menu. */
function WatchlistRow({ item, locale, c, busy, onSave, onRemove }: { item: StockWatchlistItem; locale: string; c: WatchlistCopy; busy: boolean; onSave: (value: number) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false), [dirty, setDirty] = useState(false);
  const menu = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), order = useRef<HTMLInputElement>(null);
  const company = `/stocks/${encodeURIComponent(item.stock.symbol)}`;
  // Plain disclosure region: Escape and outside presses close it, Escape returns focus.
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.type === 'keydown') {
        if ((event as KeyboardEvent).key !== 'Escape') return;
        trigger.current?.focus();
      } else if (menu.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', close); };
  }, [open]);
  const occurredAt = item.latestRecord?.occurredAt;
  const save = () => onSave(Number(order.current?.value));
  return <li className="watch-row" data-testid={`watch-${item.stock.symbol}`}>
    <div className="watch-identity">
      <h3><Link to={company}>{item.stock.symbol}</Link></h3>
      {item.stock.name && <p>{item.stock.name}</p>}
    </div>
    <p className="watch-meta">
      {item.recordCount > 0 ? <><span className="watch-count">{c.records}: {item.recordCount}</span>{occurredAt && <> · <time dateTime={occurredAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(occurredAt))}</time></>}</> : c.none}
    </p>
    {item.latestRecord && <p className="watch-summary"><span className="muted">{c.latest}: </span>{item.latestRecord.summary}</p>}
    <div className="watch-order">
      <input ref={order} className="watch-order-input" type="number" min={0} max={10000} step={1} aria-label={c.order} defaultValue={item.sortOrder} disabled={busy}
        onChange={event => setDirty(event.target.value !== String(item.sortOrder))}
        onKeyDown={event => { if (event.key === 'Enter' && dirty) { event.preventDefault(); save(); } }}/>
      {dirty && <button className="secondary button-compact" disabled={busy} onClick={save}>{c.save}</button>}
    </div>
    <div ref={menu} className="watch-menu">
      <button ref={trigger} type="button" className="watch-menu-trigger" aria-label={c.more} aria-expanded={open} aria-controls={`watch-menu-${item.id}`} onClick={() => setOpen(value => !value)}><Icon name="more" /></button>
      {open && <ul className="watch-menu-list" id={`watch-menu-${item.id}`}>
        <li><Link to={company} onClick={() => setOpen(false)}>{c.viewResearch}</Link></li>
        <li><button type="button" onClick={() => { setOpen(false); order.current?.focus(); order.current?.select(); }}>{c.editOrder}</button></li>
        <li><button type="button" disabled={busy} onClick={onRemove}>{c.remove}</button></li>
      </ul>}
    </div>
  </li>;
}

export default function Watchlist() {
  const { locale, t } = useUi(), c = copy[locale];
  const [items, setItems] = useState<StockWatchlistItem[] | null>(null), [attempt, retry] = useState(0);
  const [symbol, setSymbol] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<Failure | null>(null), [saved, setSaved] = useState(false);
  const [sort, setSort] = useState<SortMode>('order');
  const translate = useRef(t); translate.current = t;
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController(); setItems(null); setError(null);
    api.GET('/api/stocks/watchlist', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const parsed = stockWatchlistResponseSchema.safeParse(result.data);
      if (parsed.success) setItems(parsed.data.items); else setError(apiFailure(result.error, translate.current('failed')));
    }).catch(() => { if (!controller.signal.aborted) setError(apiFailure(null, translate.current('connection'))); });
    return () => controller.abort();
  }, [attempt]);
  async function change(action: (signal: AbortSignal) => Promise<{ error?: unknown; response: Response }>, clearSymbol = false) {
    if (mutation.current) return;
    const controller = new AbortController(); mutation.current = controller; setBusy(true); setError(null); setSaved(false);
    try {
      const result = await action(controller.signal);
      if (controller.signal.aborted) return;
      if (!result.response.ok) { setError(apiFailure(result.error, t('failed'))); return; }
      if (clearSymbol) setSymbol(''); setSaved(true); retry(value => value + 1);
    } catch { if (!controller.signal.aborted) setError(apiFailure(null, t('connection'))); }
    finally { if (!controller.signal.aborted) { mutation.current = null; setBusy(false); } }
  }
  const saveOrder = (item: StockWatchlistItem, value: number) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > 10000) return;
    void change(signal => api.PATCH('/api/stocks/watchlist/{id}', { params: { path: { id: item.id } }, body: { sortOrder: value }, signal }));
  };
  const removeItem = (item: StockWatchlistItem) => void change(signal => api.DELETE('/api/stocks/watchlist/{id}', { params: { path: { id: item.id } }, signal }));
  // 'Custom order' is the server order; the other views re-sort the same items client-side.
  const ordered = useMemo(() => {
    if (!items || sort === 'order') return items;
    const list = [...items];
    if (sort === 'symbol') return list.sort((a, b) => a.stock.symbol.localeCompare(b.stock.symbol));
    return list.sort((a, b) => (b.latestRecord?.occurredAt ?? '').localeCompare(a.latestRecord?.occurredAt ?? '') || a.sortOrder - b.sortOrder);
  }, [items, sort]);
  const researched = items?.filter(item => item.recordCount > 0).length ?? 0;
  return <section className="plan-page watch-page">
    <header className="plan-header watch-header"><div><h1>{c.title}</h1><p className="lede">{c.hint}</p></div><Link className="button secondary" to="/stocks">{c.holdings}</Link></header>
    {items && <div className="card watch-stats">
      <div className="stat"><span className="stat-label">{c.tracked}</span><p className="stat-value">{items.length}</p></div>
      <div className="stat"><span className="stat-label">{c.researched}</span><p className="stat-value">{researched}</p></div>
      <div className="stat"><span className="stat-label">{c.unresearched}</span><p className="stat-value">{items.length - researched}</p></div>
    </div>}
    <form className="watch-add card" onSubmit={event => {
      event.preventDefault(); const parsed = stockWatchlistCreateRequestSchema.safeParse({ symbol });
      if (!parsed.success) { setError({ message: c.invalid, code: 'SYS_VALIDATION_ERROR', fields: [] }); return; }
      void change(signal => api.POST('/api/stocks/watchlist', { body: parsed.data, signal }), true);
    }}><h2>{c.addTitle}</h2><div className="watch-add-row"><label>{c.symbol}<input value={symbol} onChange={event => setSymbol(event.target.value)} maxLength={32} required autoCapitalize="characters" spellCheck={false} placeholder={c.placeholder}/></label><button disabled={busy}>{busy ? t('pending') : c.add}</button></div></form>
    {saved && <p role="status">{c.saved}</p>}
    {error && <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath('/stocks/watchlist')}>{t('login')}</Link>}<button type="button" onClick={() => retry(value => value + 1)} disabled={busy}>{t('retry')}</button></>}
    {!items ? !error && <p role="status">{t('loading')}</p> : <>
      <div className="section-head watch-list-head">
        <h2>{c.listTitle} ({items.length})</h2>
        <label className="watch-sort">{c.sortLabel}<select value={sort} onChange={event => setSort(event.target.value as SortMode)}><option value="order">{c.sortOrder}</option><option value="research">{c.byResearch}</option><option value="symbol">{c.bySymbol}</option></select></label>
      </div>
      <p className="watch-limit muted">{c.limit}</p>
      {!items.length ? <div className="empty-state"><p>{c.empty}</p></div>
        : <div className="watch-list card"><ul className="plan-list">{ordered!.map(item => <WatchlistRow key={item.id} item={item} locale={locale} c={c} busy={busy} onSave={value => saveOrder(item, value)} onRemove={() => removeItem(item)}/>)}</ul></div>}
    </>}
  </section>;
}
