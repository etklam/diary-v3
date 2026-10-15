import { useEffect, useState } from 'react'
import { useNavigation } from 'react-router'

/**
 * Feedback for a client-side route change.
 *
 * Every other async surface in this app says something while it works — a
 * skeleton for a list, a status line for a refresh, a failure notice with a
 * retry. A route change said nothing: between the click on a destination and
 * the first paint of the next route the browser keeps the *old* page on screen,
 * and the loaders behind it call the API. That was the one async operation in
 * the product with no feedback at all, and the one the reader performs most
 * often (ticket 118).
 *
 * The indicator is `position: fixed` and painted over the chrome, so it carries
 * no layout and the content region cannot move when it appears or leaves. It
 * waits out `--dur-1` before showing: a load that resolves inside 120ms would
 * otherwise flash a bar that tells the reader nothing they did not already see.
 *
 * It is `aria-hidden` on purpose. Assistive technology is served by the route
 * announcement in `root.tsx`, which names the destination once it has actually
 * arrived; a progressbar appearing here as well would talk over it.
 */
export function NavigationProgress() {
  const navigation = useNavigation()
  const active = navigation.state !== 'idle'
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }
    const timer = setTimeout(() => setVisible(true), 120)
    return () => clearTimeout(timer)
  }, [active])
  if (!visible) return null
  return <div className="route-progress" data-testid="route-progress" aria-hidden="true" />
}

/**
 * The pathname a navigation is currently heading for, or null when the router
 * is idle. Navigation lists use it to take the selection treatment on the
 * clicked destination within one frame, while `aria-current` stays on the route
 * that has actually resolved.
 */
export function usePendingPathname(): string | null {
  const navigation = useNavigation()
  return navigation.location?.pathname ?? null
}
