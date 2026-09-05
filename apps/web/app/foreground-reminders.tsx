import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { io } from 'socket.io-client';
import { priceAlertListResponseSchema } from '@diary/contracts/price-alerts';
import { alertListResponseSchema } from '@diary/contracts/alerts';
import { api, useUi } from './ui';
import { useSessionState } from './session';

/** Socket events are hints; only REST establishes the displayed reminder state. */
export function ForegroundReminders() {
  const session = useSessionState(), { locale } = useUi();
  const [count, setCount] = useState(0);
  const [priceCount, setPriceCount] = useState(0);
  useEffect(() => {
    setCount(0); setPriceCount(0);
    if (!session.authenticated) return;
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    const socket = io({ autoConnect: false, withCredentials: true, reconnectionDelay: 1000, reconnectionDelayMax: 10_000 });
    async function restore() {
      if (!active || document.visibilityState === 'hidden') return;
      request?.abort(); const current = new AbortController(); request = current;
      if (timer) clearTimeout(timer);
      let delay = 60_000;
      try {
        const [diaryResult, priceResult] = await Promise.allSettled([
          api.GET('/api/alerts', { signal: current.signal }),
          api.GET('/api/stocks/alerts', { signal: current.signal }),
        ]);
        if (!active || current.signal.aborted) return;
        const priceResponse = priceResult.status === 'fulfilled' ? priceResult.value : undefined;
        const prices = priceAlertListResponseSchema.safeParse(priceResponse?.data);
        if (priceResponse?.response.ok && prices.success) setPriceCount(new Set(prices.data.filter(row => row.isTriggered).map(row => row.id)).size);
        const response = diaryResult.status === 'fulfilled' ? diaryResult.value : undefined;
        const parsed = alertListResponseSchema.safeParse(response?.data);
        if (response?.response.ok && parsed.success) {
          const now = Date.now(), unique = [...new Map(parsed.data.map(row => [row.id, row])).values()];
          setCount(unique.filter(row => Date.parse(row.triggerAt) <= now).length);
          const next = unique.find(row => Date.parse(row.triggerAt) > now);
          if (next) delay = Math.max(250, Math.min(delay, Date.parse(next.triggerAt) - now));
          // A server disconnect requires explicit reconnection after REST refreshes cookies.
          if (!socket.connected && !socket.active) socket.connect();
        }
      } catch { /* REST retry remains scheduled; a transport hint is not delivery proof. */ }
      finally { if (active && !current.signal.aborted) timer = setTimeout(() => void restore(), delay); }
    }
    const refresh = () => { void restore(); };
    const disconnected = (reason: string) => { if (reason === 'io server disconnect') refresh(); };
    const visibility = () => {
      if (document.visibilityState === 'hidden') { socket.disconnect(); request?.abort(); if (timer) clearTimeout(timer); }
      else { socket.connect(); refresh(); }
    };
    socket.on('connect', refresh);
    socket.on('alert:triggered', refresh);
    socket.on('alert:dismissed', refresh);
    socket.on('price-alert:triggered', refresh);
    socket.on('disconnect', disconnected);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('diary-reminders-changed', refresh);
    window.addEventListener('diary-price-alerts-changed', refresh);
    if (document.visibilityState !== 'hidden') { socket.connect(); refresh(); }
    return () => {
      active = false; request?.abort(); if (timer) clearTimeout(timer);
      socket.removeAllListeners(); socket.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('diary-reminders-changed', refresh);
      window.removeEventListener('diary-price-alerts-changed', refresh);
    };
  }, [session.authenticated, session.revision]);
  if (!session.authenticated || (!count && !priceCount)) return null;
  const label = locale === 'en' ? 'Due reminders' : locale === 'zh-CN' ? '已到期提醒' : '已到期提醒';
  const open = locale === 'en' ? 'View reminders' : locale === 'zh-CN' ? '查看提醒' : '查看提醒';
  const priceLabel = locale === 'en' ? 'Triggered price alerts' : locale === 'zh-CN' ? '已触发价格提醒' : '已觸發價格提醒';
  const priceOpen = locale === 'en' ? 'View price alerts' : locale === 'zh-CN' ? '查看价格提醒' : '查看價格提醒';
  return <>{count > 0 && <aside className="foreground-reminders" aria-label={label}><span role="status">{label}: {count}</span> <Link to="/alerts">{open}</Link></aside>}{priceCount > 0 && <aside className="foreground-reminders" aria-label={priceLabel}><span role="status">{priceLabel}: {priceCount}</span> <Link to="/stocks/alerts">{priceOpen}</Link></aside>}</>;
}
