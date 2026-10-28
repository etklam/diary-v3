import { useSearchParams } from 'react-router'
import { QuickComposer, QuickSavedState, type SavedDiary } from '../quick-composer'
import { useState } from 'react'
import { useUi } from '../ui'
import { parseCaptureContext } from '../capture-context'
export default function QuickDiaryPage() {
  const { t } = useUi()
  const [params] = useSearchParams()
  const parsed = parseCaptureContext(params)
  const [saved, setSaved] = useState<{ diary: SavedDiary; captureContext: typeof parsed.context } | null>(null),
    [reset, setReset] = useState(0)
  return (
    <section className="editor authoring-two-column quick-page">
      <h1>{t('quick')}</h1>
      {saved ? (
        <QuickSavedState
          id={saved.diary.id}
          revision={saved.diary.revision}
          timezone={saved.diary.timezone}
          captureContext={saved.captureContext}
          onNew={() => {
            setSaved(null)
            setReset(value => value + 1)
          }}
        />
      ) : (
        <QuickComposer
          key={reset}
          initialDate={parsed.date}
          captureContext={parsed.context}
          captureIssue={parsed.issue}
          share={parsed.share}
          onSaved={(diary, captureContext) => setSaved({ diary, captureContext: captureContext ?? null })}
        />
      )}
    </section>
  )
}
