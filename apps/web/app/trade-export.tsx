import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { sessionFetch, signInPath } from './session';
import { useUi } from './ui';
import { apiFailure, FailureNotice, type Failure } from './api-error';

const copy = {
  en: { title: 'Export closed trades', hint: 'All completed sales, including partial sales. Leave symbol empty to export every symbol.', symbol: 'Symbol (optional)', action: 'Download CSV', ready: 'CSV download prepared.' },
  'zh-TW': { title: '匯出已賣出交易', hint: '包括部分賣出的所有已完成賣出。股票代號留空會匯出全部代號。', symbol: '股票代號（選填）', action: '下載 CSV', ready: 'CSV 已準備下載。' },
  'zh-CN': { title: '导出已卖出交易', hint: '包括部分卖出的所有已完成卖出。股票代码留空会导出全部代码。', symbol: '股票代码（选填）', action: '下载 CSV', ready: 'CSV 已准备下载。' },
};

export function TradeExport() {
  const { locale, t } = useUi(), c = copy[locale];
  const [pending, setPending] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState<Failure | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const symbol = String(new FormData(event.currentTarget).get('symbol') ?? '').trim();
    setPending(true); setReady(false); setError(null);
    try {
      const response = await sessionFetch(`/api/stats/export-trades${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''}`, { signal: controller.signal });
      if (!response.ok) { const body = await response.json().catch(() => null); if (!controller.signal.aborted) setError(apiFailure(body, t('failed'))); return; }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'trades.csv';
      anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setReady(true);
    } catch { if (!controller.signal.aborted) setError(apiFailure(null, t('connection'))); }
    finally { if (!controller.signal.aborted) setPending(false); }
  }
  return <section aria-labelledby="trade-export-title"><h2 id="trade-export-title">{c.title}</h2><p className="muted">{c.hint}</p>
    <form onSubmit={download} className="actions"><label>{c.symbol}<input name="symbol" maxLength={20} autoCapitalize="characters" disabled={pending}/></label><button className="secondary" disabled={pending}>{pending ? t('pending') : c.action}</button></form>
    {ready && <p role="status">{c.ready}</p>}{error && <><FailureNotice failure={error}/>{error.code?.startsWith('AUTH_') && <Link to={signInPath('/stocks')}>{t('login')}</Link>}</>}
  </section>;
}
