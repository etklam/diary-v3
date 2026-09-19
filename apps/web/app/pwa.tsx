import { useEffect, useRef, useState } from 'react'
import { useUi } from './ui'

type InstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type RegistrationState = {
  registration: ServiceWorkerRegistration | null
  installPrompt: InstallPrompt | null
  updateReady: boolean
  updated: boolean
}

const copy = {
  'zh-TW': { install: '安裝 Diary', update: '套用更新', updated: '更新已準備，重新載入時套用。', later: '稍後' },
  'zh-CN': { install: '安装 Diary', update: '应用更新', updated: '更新已准备，重新加载时应用。', later: '稍后' },
  en: { install: 'Install Diary', update: 'Apply update', updated: 'Update ready; it will apply on the next reload.', later: 'Later' },
} as const

// A dismissed install prompt stays hidden for a week; the browser re-offers it after that.
const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000

function installDismissed() {
  try {
    const at = Number(localStorage.getItem('pwa-install-dismissed-at'))
    return Number.isFinite(at) && at > 0 && Date.now() - at < INSTALL_DISMISS_MS
  } catch {
    return false
  }
}

export function PwaStatus() {
  const { locale } = useUi()
  const text = copy[locale]
  const [state, setState] = useState<RegistrationState>({ registration: null, installPrompt: null, updateReady: false, updated: false })
  const updateRequested = useRef(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let active = true
    const onInstallPrompt = (event: Event) => {
      event.preventDefault()
      if (active && !installDismissed()) setState(current => ({ ...current, installPrompt: event as InstallPrompt }))
    }
    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    const onControllerChange = () => {
      if (active && updateRequested.current) setState(current => ({ ...current, updateReady: false, updated: true }))
    }
    let serviceWorker: ServiceWorkerContainer | null = null
    try {
      serviceWorker = navigator.serviceWorker
      serviceWorker.addEventListener('controllerchange', onControllerChange)
      void Promise.resolve().then(() => serviceWorker?.register('/sw.js', { updateViaCache: 'none' })).then(registration => {
        if (!active || !registration) return
        setState(current => ({ ...current, registration, updateReady: Boolean(registration.waiting) }))
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && serviceWorker?.controller && active) {
              setState(current => ({ ...current, updateReady: true }))
            }
          })
        })
      }).catch(() => undefined)
    } catch {
      serviceWorker = null
    }
    return () => {
      active = false
      window.removeEventListener('beforeinstallprompt', onInstallPrompt)
      serviceWorker?.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  async function install() {
    const prompt = state.installPrompt
    if (!prompt) return
    await prompt.prompt()
    setState(current => ({ ...current, installPrompt: null }))
  }

  function dismissInstall() {
    try {
      localStorage.setItem('pwa-install-dismissed-at', String(Date.now()))
    } catch {
      // Private mode: hiding for this visit only is fine.
    }
    setState(current => ({ ...current, installPrompt: null }))
  }

  function update() {
    const waiting = state.registration?.waiting
    if (!waiting) return
    updateRequested.current = true
    waiting.postMessage({ type: 'SKIP_WAITING' })
  }

  if (!state.installPrompt && !state.updateReady && !state.updated) return null
  return <aside className="pwa-status" aria-label="PWA status" role="status">
    {state.installPrompt && <><button type="button" className="secondary" data-testid="pwa-install" onClick={() => void install()}>{text.install}</button><button type="button" className="secondary" onClick={dismissInstall}>{text.later}</button></>}
    {state.updateReady && <button type="button" className="secondary" data-testid="pwa-update" onClick={update}>{text.update}</button>}
    {state.updated && <><span>{text.updated}</span><button type="button" className="secondary" onClick={() => setState(current => ({ ...current, updated: false }))}>{text.later}</button></>}
  </aside>
}
