import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { guruStockWatchResponseSchema } from '@diary/contracts'
import { signInPath, useSessionState } from './session'
import { api, useUi } from './ui'
import { guruNotificationsCopy } from './guru-notifications-copy'

/** A private watch. It never reveals how many other members watch this stock. */
export function GuruStockWatchButton({ symbol }: { symbol: string }) {
  const { locale } = useUi()
  const copy = guruNotificationsCopy(locale)
  const session = useSessionState()
  const navigate = useNavigate()
  const [watching, setWatching] = useState<boolean | null>(null)
  const [available, setAvailable] = useState(true)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (session.authenticated !== true) { setWatching(null); return }
    const controller = new AbortController()
    void api.GET('/api/stocks/{symbol}/guru-watch', { params: { path: { symbol } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = guruStockWatchResponseSchema.safeParse(result.data)
      if (result.response.ok && parsed.success) { setWatching(parsed.data.data.watching); setAvailable(true) }
      else if (result.response.status === 404) setAvailable(false)
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [symbol, session.authenticated, session.revision])

  async function toggle() {
    if (session.authenticated !== true) { void navigate(signInPath(`/stocks/${encodeURIComponent(symbol)}/gurus`)); return }
    if (pending) return
    setPending(true)
    setFailed(false)
    try {
      const result = watching
        ? await api.DELETE('/api/stocks/{symbol}/guru-watch', { params: { path: { symbol } } })
        : await api.PUT('/api/stocks/{symbol}/guru-watch', { params: { path: { symbol } } })
      const parsed = guruStockWatchResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) { setFailed(true); return }
      setWatching(parsed.data.data.watching)
    } catch { setFailed(true) }
    finally { setPending(false) }
  }

  if (!available) return null
  return <div className="guru-stock-watch">
    <button type="button" className={watching ? 'secondary' : undefined} disabled={pending || session.authenticated === null} onClick={() => void toggle()}>
      {session.authenticated !== true ? copy.watchSignIn : watching ? copy.unwatch : copy.watch}
    </button>
    {failed && <span role="alert">{copy.watchFailed}</span>}
  </div>
}
