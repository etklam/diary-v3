import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { QuickComposer, QuickSavedState, type SavedDiary } from './quick-composer'
import { useSessionState } from './session'
import { useUi } from './ui'
import { Icon } from './icons'
import type { CaptureContext } from './capture-context'

type Locale = 'zh-TW' | 'zh-CN' | 'en'
const captureCopy: Record<Locale, { write: string }> = {
  'zh-TW': { write: '寫完整日記' },
  'zh-CN': { write: '写完整日记' },
  en: { write: 'Write a full diary' },
}

/**
 * The two capture paths, both named.
 *
 * The full editor — thesis, risk, execution, transactions, reminders, review
 * scheduling — used to sit behind an empty disclosure summary: a 44px chevron with an
 * `aria-label` and no visible text, holding exactly one link. Screen readers
 * were served and sighted readers saw a triangle, so the more complete of the
 * two paths was the one nobody could name (ticket 139).
 *
 * A disclosure holding one item saves nothing. Quick capture stays the one
 * filled action because it is the right default; the editor is simply a quiet
 * link under it, which also retires the popover and its dismiss handling.
 */
export function CaptureChoices({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const { locale, t } = useUi()
  const c = captureCopy[locale]
  return (
    <>
      <Link
        className="button quick-capture-primary"
        data-testid={mobile ? 'mobile-quick-entry' : 'quick-entry'}
        to="/diaries/quick"
        onClick={onNavigate}
      >
        {t('quick')}
      </Link>
      {!mobile && (
        <Link
          className="quick-capture-secondary"
          data-testid="capture-full-editor"
          to="/diaries/new"
          onClick={onNavigate}
        >
          <Icon name="pen" size={16} />
          {c.write}
        </Link>
      )}
    </>
  )
}

export function QuickEntry() {
  const { t } = useUi(),
    session = useSessionState(),
    location = useLocation()
  const [open, setOpen] = useState(false),
    [saved, setSaved] = useState<{ diary: SavedDiary; captureContext: CaptureContext | null } | null>(null),
    [focusContent, setFocusContent] = useState(false),
    [reset, setReset] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLElement | null>(null)
  function launch(keyboard = false) {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSaved(null)
    setFocusContent(keyboard)
    setReset(value => value + 1)
    setOpen(true)
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.shiftKey ||
        !session.authenticated ||
        location.pathname === '/diaries/quick'
      )
        return
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]'))
      )
        return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        launch(true)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [session.authenticated, location.pathname])
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else {
      dialog.current?.close()
      trigger.current?.focus()
    }
  }, [open])
  useEffect(() => {
    if (session.authenticated === false) {
      setOpen(false)
      setSaved(null)
    }
  }, [session.authenticated])
  return (
    <>
      {session.authenticated && location.pathname !== '/diaries/quick' && (
        <div className="quick-entry-controls">
          <CaptureChoices />
          <span className="quick-entry-shortcut">
            <kbd>⌘ / Ctrl J</kbd>
          </span>
        </div>
      )}
      <dialog
        ref={dialog}
        className="capture-dialog"
        aria-labelledby="global-quick-title"
        onCancel={event => {
          event.preventDefault()
          setOpen(false)
        }}
      >
        <header className="capture-dialog-header">
          <h2 id="global-quick-title">{t('quick')}</h2>
          <button type="button" className="secondary" autoFocus onClick={() => setOpen(false)}>
            {t('close')}
          </button>
        </header>
        {open && !saved && (
          <QuickComposer
            key={reset}
            autoFocusContent={focusContent}
            onNavigate={() => setOpen(false)}
            onSaved={(diary, captureContext) => {
              setSaved({ diary, captureContext: captureContext ?? null })
              setFocusContent(false)
            }}
          />
        )}
        {open && saved && (
          <QuickSavedState
            id={saved.diary.id}
            revision={saved.diary.revision}
            timezone={saved.diary.timezone}
            captureContext={saved.captureContext}
            onNavigate={() => setOpen(false)}
            onNew={() => {
              setSaved(null)
              setFocusContent(false)
              setReset(value => value + 1)
            }}
          />
        )}
      </dialog>
    </>
  )
}
