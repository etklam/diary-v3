import { useState } from 'react'
import { useNavigate } from 'react-router'
import { guruFollowResponseSchema } from '@diary/contracts'
import { apiFailure, FailureNotice } from './api-error'
import { signInPath, useSessionState } from './session'
import { api, useUi } from './ui'
import { guruCopy, type GuruCopy } from './routes/gurus-copy'

export function GuruFollowButton({ slug, followerCount, followed, onChange }: {
  slug: string
  followerCount: number
  followed: boolean
  onChange: (following: boolean, nextFollowerCount: number) => void
}) {
  const { locale } = useUi()
  const c: GuruCopy = guruCopy[locale]
  const session = useSessionState()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  async function toggle() {
    if (session.authenticated !== true) {
      navigate(signInPath(`/gurus/${slug}`))
      return
    }
    if (pending) return
    setPending(true)
    setError(false)
    try {
      const result = followed
        ? await api.DELETE('/api/gurus/{slug}/follow', { params: { path: { slug } } })
        : await api.PUT('/api/gurus/{slug}/follow', { params: { path: { slug } } })
      const parsed = guruFollowResponseSchema.safeParse(result.data)
      if (!result.response.ok || !parsed.success) {
        setError(true)
        return
      }
      onChange(parsed.data.data.following, parsed.data.data.followerCount)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  return <div className="guru-follow-control">
    <button type="button" className={followed ? 'secondary' : undefined} disabled={pending || session.authenticated === null} onClick={() => void toggle()}>
      {pending ? '…' : session.authenticated === true && followed ? c.unfollow : session.authenticated === true ? c.follow : c.signIn}
    </button>
    <span className="guru-follow-count">{c.followerCount(followerCount)}</span>
    {error && <FailureNotice failure={apiFailure(undefined, c.failed)} id={`guru-follow-error-${slug}`} messageOverride={c.failed} />}
  </div>
}
