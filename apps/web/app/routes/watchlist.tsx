import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { stockWatchlistCreateRequestSchema, stockWatchlistResponseSchema, type StockWatchlistItem } from '@diary/contracts/watchlist';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, type Failure } from '../api-error';
import { signInPath } from '../session';
import '../trade-plan.css';

const copy = {
  en: { title: 'Watchlist', hint: 'Keep companies close while you develop your investment view.', symbol: 'Stock symbol', add: 'Add company', empty: 'No companies yet. Add a symbol to start your research.', archive: 'Remove', order: 'Sort order', save: 'Save order', watching: 'Watching', records: 'Research records', none: 'No research records yet.', saved: 'Watchlist updated.', limit: 'Showing up to 100 companies, ordered by sort order. Add a removed symbol again to restore it.', invalid: 'Use 1–32 letters, numbers or dots.', holdings: 'View holdings' },
  'zh-TW': { title: '關注清單', hint: '追蹤公司，逐步建立你的投資判斷。', symbol: '股票代號', add: '加入公司', empty: '尚未關注公司。加入股票代號，開始研究。', archive: '移除', order: '排序值', save: '儲存排序', watching: '追蹤中', records: '研究記錄', none: '尚未有研究記錄。', saved: '已更新關注清單。', limit: '依排序值顯示最多 100 間公司。再次加入已移除的代號即可恢復。', invalid: '請輸入 1–32 個英文字母、數字或句點。', holdings: '查看持倉' },
  'zh-CN': { title: '关注清单', hint: '追踪公司，逐步建立你的投资判断。', symbol: '股票代号', add: '加入公司', empty: '尚未关注公司。加入股票代号，开始研究。', archive: '移除', order: '排序值', save: '保存排序', watching: '追踪中', records: '研究记录', none: '尚未有研究记录。', saved: '已更新关注清单。', limit: '依排序值显示最多 100 间公司。再次加入已移除的代号即可恢复。', invalid: '请输入 1–32 个英文字母、数字或句点。', holdings: '查看持仓' },
};
export default function Watchlist() {
  const { locale, t } = useUi(), c = copy[locale];
  const [items, setItems] = useState<StockWatchlistItem[] | null>(null), [attempt, retry] = useState(0);
  const [symbol, setSymbol] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<Failure | null>(null), [saved, setSaved] = useState(false);
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
  return <section className="plan-page"><header className="plan-header"><div><h1>{c.title}</h1><p className="lede">{c.hint}</p></div><Link to="/stocks">{c.holdings}</Link></header>
    <form className="plan-filters" onSubmit={event => {
      event.preventDefault(); const parsed = stockWatchlistCreateRequestSchema.safeParse({ symbol });
      if (!parsed.success) { setError({ message: c.invalid, code: 'SYS_VALIDATION_ERROR', fields: [] }); return; }
      void change(signal => api.POST('/api/stocks/watchlist', { body: parsed.data, signal }), true);
    }}><label>{c.symbol}<input value={symbol} onChange={event => setSymbol(event.target.value)} maxLength={32} required autoCapitalize="characters" spellCheck={false}/></label><button disabled={busy}>{busy ? t('pending') : c.add}</button></form>
    {saved && <p role="status">{c.saved}</p>}
    {error && <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath('/stocks/watchlist')}>{t('login')}</Link>}<button type="button" onClick={() => retry(value => value + 1)} disabled={busy}>{t('retry')}</button></>}
    {!items ? !error && <p role="status">{t('loading')}</p> : <><p>{c.limit}</p>{!items.length ? <p>{c.empty}</p> : <ul className="plan-list">{items.map(item => <li key={item.id} data-testid={`watch-${item.stock.symbol}`}><header className="plan-header"><h2><Link to={`/stocks/${encodeURIComponent(item.stock.symbol)}`}>{item.stock.symbol}{item.stock.name ? ` · ${item.stock.name}` : ''}</Link></h2><span>{c.watching}</span></header><p>{c.records}: {item.recordCount}</p><p>{item.latestRecord?.summary ?? c.none}</p><form className="plan-filters" key={`${item.id}-${item.sortOrder}`} onSubmit={event => { event.preventDefault(); const sortOrder = Number(new FormData(event.currentTarget).get('sortOrder')); void change(signal => api.PATCH('/api/stocks/watchlist/{id}', { params: { path: { id: item.id } }, body: { sortOrder }, signal })); }}><label>{c.order}<input name="sortOrder" type="number" min={0} max={10000} step={1} required defaultValue={item.sortOrder}/></label><button disabled={busy}>{c.save}</button><button className="secondary" type="button" disabled={busy} onClick={() => void change(signal => api.DELETE('/api/stocks/watchlist/{id}', { params: { path: { id: item.id } }, signal }))}>{c.archive}</button></form></li>)}</ul>}</>}
  </section>;
}
