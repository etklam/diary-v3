import type { ReactNode } from 'react';
import { authAsideCopy } from './auth-copy';
import { useUi } from './ui';

/**
 * The shared composition for every authentication surface: the form in its own
 * column with a statement of what the product is beside it, centred in the
 * viewport rather than stranded in its top half. One composition covers sign
 * in, registration and the two token pages, so a reader who moves between them
 * stays on the same page shape.
 *
 * `lede` is the one part that changes per page — a return journey and a first
 * contact are not making the same argument.
 */
export function AuthPage({ children, lede, className }: { children: ReactNode; lede: string; className?: string }) {
  const { locale } = useUi();
  const c = authAsideCopy[locale];
  return <div className="auth-page">
    <section className={className ? `form-page ${className}` : 'form-page'}>{children}</section>
    <aside className="auth-aside" aria-labelledby="auth-aside-title">
      <p className="auth-aside-lede">{lede}</p>
      <h2 id="auth-aside-title">{c.title}</h2>
      <ol className="auth-points">
        {c.points.map(([name, body]) => <li key={name}><h3>{name}</h3><p>{body}</p></li>)}
      </ol>
    </aside>
  </div>;
}
