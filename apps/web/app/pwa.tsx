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
  'zh-TW': { install: '安裝 Diary', update: '套用更新', updated: '更新已準備，重新載入時套用。', installHint: '可安裝至裝置主畫面。', later: '稍後' },
  'zh-CN': { install: '安装 Diary', update: '应用更新', updated: '更新已准备，重新加载时应用。', installHint: '可安装到设备主屏幕。', later: '稍后' },
  en: { install: 'Install Diary', update: 'Apply update', updated: 'Update ready; it will apply on the next reload.', installHint: 'Install this workspace on your device.', later: 'Later' },
} as const

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
      if (active) setState(current => ({ ...current, installPrompt: event as InstallPrompt }))
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

  function update() {
    const waiting = state.registration?.waiting
    if (!waiting) return
    updateRequested.current = true
    waiting.postMessage({ type: 'SKIP_WAITING' })
  }

  if (!state.installPrompt && !state.updateReady && !state.updated) return null
  return <aside className="pwa-status" aria-label="PWA status" role="status">
    {state.installPrompt && <><span>{text.installHint}</span><button type="button" className="secondary" data-testid="pwa-install" onClick={() => void install()}>{text.install}</button></>}
    {state.updateReady && <button type="button" className="secondary" data-testid="pwa-update" onClick={update}>{text.update}</button>}
    {state.updated && <><span>{text.updated}</span><button type="button" className="secondary" onClick={() => setState(current => ({ ...current, updated: false }))}>{text.later}</button></>}
  </aside>
}
