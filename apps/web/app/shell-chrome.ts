/**
 * Which chrome surrounds the routed content at one address.
 *
 * The decision is a pure function of the address, the session and the confirmed
 * role so the shell can render both variants from a single element tree: when
 * the session confirms, only the chrome around `main` changes, and React
 * reconciles the routed content instead of unmounting it. A tree replacement
 * here would discard whatever the reader had typed, opened or scrolled to.
 */
export type ShellChrome = 'public' | 'private' | 'pending'

/** Pages that read the same for a guest and for a signed-in reader. */
export function isPublicContentPath(pathname: string) {
  return (
    pathname === '/about' ||
    pathname === '/articles' ||
    pathname.startsWith('/articles/') ||
    pathname === '/blog' ||
    pathname.startsWith('/blog/')
  )
}

/** Pages that wear the public chrome only while the reader is not signed in. */
export function isGuestPublicPath(pathname: string) {
  return (
    pathname === '/' ||
    // The guide is instructions *about* the private workspace. It was public
    // content, so a signed-in reader following it lost the sidebar they were
    // being taught to use — which is also why no workspace link pointed at it
    // (ticket 139). A guest still reads it in the public shell.
    pathname === '/guide' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/register/complete' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/tools' ||
    pathname.startsWith('/tools/')
  )
}

export function isAdminPath(pathname: string) {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

/**
 * `pending` withholds the routed content: sign-in on an already-authenticated
 * browser is about to redirect, and an administration path renders only for a
 * confirmed ADMIN. Both are transient states that precede any route render, so
 * nothing the reader owns is lost when they resolve.
 */
export function shellChrome(
  pathname: string,
  authenticated: boolean | null,
  role: 'USER' | 'ADMIN' | null,
): ShellChrome {
  if (pathname === '/login' && authenticated === true) return 'pending'
  if (isPublicContentPath(pathname) || (isGuestPublicPath(pathname) && authenticated !== true)) return 'public'
  if (isAdminPath(pathname) && role !== 'ADMIN') return 'pending'
  return 'private'
}
