import type { ReactNode } from 'react'

type Locale = 'zh-TW' | 'zh-CN' | 'en'

/**
 * The one wording for the one constraint.
 *
 * `PRODUCT.md` is explicit that portfolio valuation covers only priced holdings
 * and that missing quotes must never become zero, so this sentence is required
 * wherever those figures appear. It used to be *written* wherever they appear —
 * three times, in three wordings, across two surfaces — which implied a
 * difference between them that does not exist (ticket 121). The constraint is a
 * property of the figures, so it is stated once and marked on each figure it
 * qualifies.
 */
const copy: Record<Locale, string> = {
  'zh-TW': '市值及損益只涵蓋已有報價的持倉，未估值成本獨立列出。',
  'zh-CN': '市值及损益只涵盖已有报价的持仓，未估值成本独立列出。',
  en: 'Values cover priced positions only. Unpriced cost remains separate.',
}

/** The single reader of the single wording; `/` types its locale as a string. */
export function figureCaveat(locale: string): string {
  return copy[locale as Locale] ?? copy.en
}

/**
 * The mark a qualified figure carries.
 *
 * It sits on the row's **label**, not on its value. A footnote marker inside a
 * figure column interrupts the one thing that column exists to do — line digits
 * up — and it would also land inside the figure's own text, where the Figure
 * Rule says only the number belongs. The label is prose, and prose is where a
 * footnote marker has always gone.
 *
 * It is `aria-hidden`, and the *value* carries `aria-describedby` to the note:
 * a reader hears the sentence, not the symbol. The note is permanently visible
 * below the figures, so the affordance needs neither hover nor a `title`
 * attribute and works on touch.
 */
export function CaveatMark({ mark = '*' }: { mark?: string }) {
  return (
    <sup className="figure-caveat-mark" aria-hidden="true">
      {mark}
    </sup>
  )
}

/** One note at the foot of the region, below the rule that closes it. */
export function CaveatNote({
  id,
  mark = '*',
  testId,
  children,
}: {
  id: string
  mark?: string
  testId?: string
  children: ReactNode
}) {
  return (
    <p className="figure-caveat" id={id} data-testid={testId}>
      <span className="figure-caveat-mark" aria-hidden="true">
        {mark}
      </span>
      <span>{children}</span>
    </p>
  )
}

/** The notes block itself: the rule that closes the figures, then the prose. */
export function CaveatNotes({ children }: { children: ReactNode }) {
  return <div className="figure-caveats">{children}</div>
}
