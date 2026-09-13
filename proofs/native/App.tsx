import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import * as SecureStore from 'expo-secure-store'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native'
import { createApiClient, createNativeSession, NO_AUTOMATIC_SESSION_RETRY_HEADER } from '@diary/api-client'
import {
  apiErrorResponseSchema,
  authUserResponseSchema,
  calendarDateSchema,
  createDiaryRequestSchema,
  diaryResponseSchema,
  nativeTokenPairSchema,
  serializedIdSchema,
  type AuthUser,
  type DiaryResponse,
  type NativeSession,
} from '@diary/contracts'
import { companyHubResponseSchema, type CompanyHubResponse } from '@diary/contracts/company-hub'
import { diarySummaryListResponseSchema, type DiarySummary } from '@diary/contracts/diary-summary'
import { diaryReviewResponseSchema, structuredReviewInputSchema } from '@diary/contracts/review'
import { reviewGroupsResponseSchema, type ReviewGroups, type ReviewItem } from '@diary/contracts/review-queue'
import { calendarDateInTimezone, currentUtcDate, deriveQuickTitle } from '@diary/domain'
import type { z } from 'zod'

const SESSION_KEY = 'diary-native-session'
const API_ORIGIN = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? ''
const palette = {
  canvas: '#f6f7f8',
  surface: '#ffffff',
  mutedSurface: '#eef0f2',
  text: '#20242a',
  muted: '#59616c',
  border: '#d5d9df',
  borderStrong: '#b9c0c9',
  control: '#7b8491',
  action: '#2459b8',
  actionStrong: '#1d4a9c',
  onAction: '#ffffff',
  selected: '#e5e8ed',
  negative: '#b62e3c',
  infoSurface: 'rgba(79, 117, 194, 0.12)',
  infoText: '#2c4f92',
} as const

function acceptedApiOrigin(value: string) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || !url.host || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) return ''
    if (!__DEV__ && url.protocol !== 'https:') return ''
    return url.origin
  } catch {
    return ''
  }
}

const apiOrigin = acceptedApiOrigin(API_ORIGIN)

const nativeStorage = {
  async get(): Promise<NativeSession | null> {
    const stored = await SecureStore.getItemAsync(SESSION_KEY)
    if (!stored) return null
    try {
      return nativeTokenPairSchema.parse(JSON.parse(stored))
    } catch {
      await SecureStore.deleteItemAsync(SESSION_KEY)
      return null
    }
  },
  set(session: NativeSession) {
    return SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session))
  },
  clear() {
    return SecureStore.deleteItemAsync(SESSION_KEY)
  },
}

const nativeSession = apiOrigin ? createNativeSession({ baseUrl: apiOrigin, storage: nativeStorage }) : null
const api = apiOrigin && nativeSession
  ? createApiClient({ baseUrl: apiOrigin, fetch: nativeSession.fetch })
  : null

type Screen = 'restoring' | 'configuration' | 'login' | 'restore-error' | 'home' | 'quick' | 'timeline' | 'diary' | 'reviews' | 'review' | 'company'
type QuickDraft = { date: string; content: string; tags: string; symbol: string }
type ApiResult<T> = { data?: T; error?: unknown; response: Response }
type DiaryReview = z.infer<typeof diaryReviewResponseSchema>

class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

class UnconfirmedWriteError extends Error {
  constructor() {
    super('The API did not confirm this save. It may already be in your Timeline. Check Timeline before retrying. Your draft is still held in memory; retrying is not guaranteed to be duplicate-safe.')
    this.name = 'UnconfirmedWriteError'
  }
}

function requireResponse<T>(result: ApiResult<T>, label: string): T {
  if (!result.response.ok || result.data === undefined) {
    const parsed = apiErrorResponseSchema.safeParse(result.error)
    throw new ApiRequestError(
      parsed.success ? `${parsed.data.data.code}: ${parsed.data.statusMessage}` : `${label} failed (${result.response.status})`,
      result.response.status,
      parsed.success ? parsed.data.data.code : undefined,
    )
  }
  return result.data
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed.'
}

function emptyDraft(user: AuthUser | null): QuickDraft {
  return {
    date: user ? calendarDateInTimezone(new Date(), user.timezone) : currentUtcDate(),
    content: '', tags: '', symbol: '',
  }
}

function diaryIdFromUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'diary-v3:' || url.hostname !== 'diaries' || url.username || url.password
      || url.port || url.search || url.hash) return null
    const path = url.pathname.split('/').filter(Boolean)
    if (path.length !== 1) return null
    const result = serializedIdSchema.safeParse(decodeURIComponent(path[0]!))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function ActionButton({ title, onPress, disabled = false, quiet = false }: {
  title: string
  onPress: () => void
  disabled?: boolean
  quiet?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        quiet && styles.quietButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      <Text style={[styles.buttonText, quiet && styles.quietButtonText]}>{title}</Text>
    </Pressable>
  )
}

function Field({ label, multiline = false, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={palette.muted}
        style={[styles.input, multiline && styles.multilineInput, props.style]}
      />
    </View>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      {children}
    </View>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('restoring')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [draft, setDraft] = useState<QuickDraft>(() => emptyDraft(null))
  const [draftOwnerId, setDraftOwnerId] = useState<string | null>(null)
  const [privateStateOwnerId, setPrivateStateOwnerId] = useState<string | null>(null)
  const [pendingDiaryId, setPendingDiaryId] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<DiarySummary[]>([])
  const [selectedDiary, setSelectedDiary] = useState<DiaryResponse | null>(null)
  const [reviewGroups, setReviewGroups] = useState<ReviewGroups | null>(null)
  const [selectedReview, setSelectedReview] = useState<DiaryReview | null>(null)
  const [reviewOutcome, setReviewOutcome] = useState<'INTACT' | 'PARTIAL' | 'INVALIDATED' | 'UNCLEAR'>('INTACT')
  const [reviewSummary, setReviewSummary] = useState('')
  const [companySymbol, setCompanySymbol] = useState('NVDA')
  const [company, setCompany] = useState<CompanyHubResponse | null>(null)
  const busyRef = useRef(false)
  const startedRef = useRef(false)
  const userRef = useRef<AuthUser | null>(null)
  const pendingDiaryIdRef = useRef<string | null>(null)
  const openDiaryRef = useRef<(id: string) => Promise<boolean>>(async () => false)

  userRef.current = user
  pendingDiaryIdRef.current = pendingDiaryId

  const clearPrivateCollections = useCallback(() => {
    setTimeline([])
    setSelectedDiary(null)
    setReviewGroups(null)
    setSelectedReview(null)
    setReviewOutcome('INTACT')
    setReviewSummary('')
    setCompany(null)
  }, [])

  const clearPrivateState = useCallback((nextUser: AuthUser | null) => {
    setDraft(emptyDraft(nextUser))
    setDraftOwnerId(nextUser?.id ?? null)
    setPrivateStateOwnerId(nextUser?.id ?? null)
    clearPrivateCollections()
  }, [clearPrivateCollections])

  const bindPrivateStateOwner = useCallback((ownerId: string) => {
    if (privateStateOwnerId !== ownerId) {
      clearPrivateCollections()
      setPrivateStateOwnerId(ownerId)
    }
  }, [clearPrivateCollections, privateStateOwnerId])

  const bindUserContext = useCallback((nextUser: AuthUser) => {
    bindPrivateStateOwner(nextUser.id)
    if (draftOwnerId !== nextUser.id) {
      setDraft(emptyDraft(nextUser))
      setDraftOwnerId(nextUser.id)
    }
  }, [bindPrivateStateOwner, draftOwnerId])

  const perform = useCallback(async (operation: () => Promise<void>) => {
    if (!api || !nativeSession || busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await operation()
      return true
    } catch (cause) {
      if (cause instanceof UnconfirmedWriteError) {
        setError(cause.message)
      } else if (cause instanceof ApiRequestError && cause.status === 401) {
        try {
          await nativeSession.logout()
        } catch {
          // Native logout clears SecureStore before attempting server revocation.
        }
        setUser(null)
        setScreen('login')
        const hasOwnDraft = Boolean(userRef.current && draftOwnerId === userRef.current.id && draft.content.trim())
        setError(hasOwnDraft
          ? 'Session expired. Your Quick Diary draft is still in memory. Sign in again, check Timeline, then decide whether to save it again.'
          : 'Session expired. Sign in again to continue.')
      } else {
        if (cause instanceof ApiRequestError && cause.status === 404 && pendingDiaryIdRef.current) {
          pendingDiaryIdRef.current = null
          setPendingDiaryId(null)
        }
        setError(errorText(cause))
      }
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [draft.content, draftOwnerId])

  const readCurrentUser = useCallback(async () => {
    if (!api) throw new Error('API client is not configured.')
    const result = await api.GET('/api/auth/me')
    return authUserResponseSchema.parse(requireResponse(result, 'Session restore')).data
  }, [])

  const openDiary = useCallback(async (id: string) => {
    const succeeded = await perform(async () => {
      if (!api) throw new Error('API client is not configured.')
      const result = await api.GET('/api/diaries/{id}', { params: { path: { id } } })
      const diary = diaryResponseSchema.parse(requireResponse(result, 'Diary read'))
      setSelectedDiary(diary)
      setScreen('diary')
    })
    if (succeeded && pendingDiaryIdRef.current === id) {
      pendingDiaryIdRef.current = null
      setPendingDiaryId(null)
    }
    return succeeded
  }, [perform])

  openDiaryRef.current = openDiary

  const restoreSession = useCallback(async () => {
    if (!api || !nativeSession) {
      setScreen('configuration')
      return
    }
    setError('')
    setNotice('')
    let stored: NativeSession | null
    try {
      stored = await nativeStorage.get()
    } catch (cause) {
      setError(errorText(cause))
      setScreen('restore-error')
      return
    }
    if (!stored) {
      setUser(null)
      clearPrivateState(null)
      setScreen('login')
      return
    }
    bindPrivateStateOwner(stored.user.id)
    setUser(stored.user)
    setScreen('restore-error')
    const succeeded = await perform(async () => {
      const current = await readCurrentUser()
      bindUserContext(current)
      setUser(current)
      setScreen('home')
    })
    if (succeeded && pendingDiaryIdRef.current) void openDiary(pendingDiaryIdRef.current)
  }, [bindPrivateStateOwner, bindUserContext, clearPrivateState, openDiary, perform, readCurrentUser])

  const restoreSessionRef = useRef(restoreSession)
  restoreSessionRef.current = restoreSession

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void restoreSessionRef.current()
  }, [])

  useEffect(() => {
    const receive = (value: string) => {
      const id = diaryIdFromUrl(value)
      if (!id) return
      pendingDiaryIdRef.current = id
      setPendingDiaryId(id)
      if (userRef.current) void openDiaryRef.current(id)
      else setScreen(current => current === 'restoring' ? current : 'login')
    }
    const subscription = Linking.addEventListener('url', ({ url }) => receive(url))
    void Linking.getInitialURL().then(value => { if (value) receive(value) }).catch(() => {})
    return () => subscription.remove()
  }, [])

  const signIn = async () => {
    if (!nativeSession) return
    const succeeded = await perform(async () => {
      const pair = await nativeSession.login({ email: email.trim(), password })
      const changedAccount = Boolean(
        (draftOwnerId && draftOwnerId !== pair.user.id)
        || (privateStateOwnerId && privateStateOwnerId !== pair.user.id),
      )
      bindUserContext(pair.user)
      setUser(pair.user)
      setScreen('restore-error')
      const current = await readCurrentUser()
      bindUserContext(current)
      setUser(current)
      setPassword('')
      setScreen('home')
      setNotice(changedAccount
        ? 'Account changed. The previous account draft and private state were cleared.'
        : 'Signed in. Writes are sent only when you press Save.')
    })
    if (succeeded && pendingDiaryIdRef.current) void openDiary(pendingDiaryIdRef.current)
  }

  const switchAccount = async () => {
    if (!nativeSession || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await nativeSession.logout()
      setNotice('Signed out. Private app state and the current draft were cleared.')
    } catch (cause) {
      setError(`Local credentials were cleared, but server logout was not confirmed: ${errorText(cause)}`)
    } finally {
      setUser(null)
      clearPrivateState(null)
      setScreen('login')
      busyRef.current = false
      setBusy(false)
    }
  }

  const enterQuickDiary = () => {
    if (!user) return
    if (draftOwnerId !== user.id) {
      setDraft(emptyDraft(user))
      setDraftOwnerId(user.id)
    }
    setScreen('quick')
  }

  const loadTimeline = async () => {
    await perform(async () => {
      if (!api) throw new Error('API client is not configured.')
      const result = await api.GET('/api/diaries/summary', { params: { query: { page: 1, limit: 20 } } })
      const page = diarySummaryListResponseSchema.parse(requireResponse(result, 'Timeline'))
      setTimeline(page.data)
      setScreen('timeline')
    })
  }

  const loadReviewQueue = async () => {
    await perform(async () => {
      if (!api) throw new Error('API client is not configured.')
      const result = await api.GET('/api/reviews', { params: { query: { target: 'diary', page: 1, limit: 100 } } })
      setReviewGroups(reviewGroupsResponseSchema.parse(requireResponse(result, 'Review Queue')))
      setScreen('reviews')
    })
  }

  const openReview = async (item: ReviewItem) => {
    if (item.targetType !== 'diary') return
    await perform(async () => {
      if (!api) throw new Error('API client is not configured.')
      const result = await api.GET('/api/diaries/{id}/review', { params: { path: { id: item.id } } })
      const review = diaryReviewResponseSchema.parse(requireResponse(result, 'Diary Review'))
      setSelectedReview(review)
      setReviewOutcome(review.reviewOutcome ?? 'INTACT')
      setReviewSummary(review.reviewSummary ?? '')
      setScreen('review')
    })
  }

  const saveQuickDiary = async () => {
    await perform(async () => {
      if (!api || !user) throw new Error('Sign in before saving a Diary.')
      const date = calendarDateSchema.parse(draft.date)
      const request = createDiaryRequestSchema.parse({
        title: deriveQuickTitle(draft.content, `Quick Diary ${date}`),
        content: draft.content,
        date,
        tags: draft.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        stockSymbols: draft.symbol.trim() ? [draft.symbol.trim().toUpperCase()] : [],
      })
      const result = await api.POST('/api/diaries', {
        body: request,
        headers: { [NO_AUTOMATIC_SESSION_RETRY_HEADER]: '1' },
      }).catch(() => { throw new UnconfirmedWriteError() })
      const created = diaryResponseSchema.parse(requireResponse(result, 'Quick Diary save'))
      setDraft(emptyDraft(user))
      setSelectedDiary(created)
      setScreen('diary')
      const readBack = await api.GET('/api/diaries/{id}', { params: { path: { id: created.id } } })
      setSelectedDiary(diaryResponseSchema.parse(requireResponse(readBack, 'Saved Diary read')))
      setNotice('The API confirmed the save and the Diary was read back.')
    })
  }

  const saveDiaryReview = async () => {
    if (!selectedReview) return
    await perform(async () => {
      if (!api) throw new Error('API client is not configured.')
      const body = structuredReviewInputSchema.parse({
        reviewOutcome,
        reviewSummary: reviewSummary.trim() || null,
      })
      const result = await api.PATCH('/api/diaries/{id}/review', {
        params: { path: { id: selectedReview.id } },
        body,
        headers: { [NO_AUTOMATIC_SESSION_RETRY_HEADER]: '1' },
      })
      const saved = diaryReviewResponseSchema.parse(requireResponse(result, 'Diary Review save'))
      const readBack = await api.GET('/api/diaries/{id}/review', { params: { path: { id: saved.id } } })
      setSelectedReview(diaryReviewResponseSchema.parse(requireResponse(readBack, 'Diary Review read')))
      const queueResult = await api.GET('/api/reviews', { params: { query: { target: 'diary', page: 1, limit: 100 } } })
      setReviewGroups(reviewGroupsResponseSchema.parse(requireResponse(queueResult, 'Review Queue refresh')))
      setScreen('reviews')
      setNotice('The Review was saved, read back, and removed from the active queue.')
    })
  }

  const loadCompany = async (requestedSymbol = companySymbol) => {
    await perform(async () => {
      if (!api) throw new Error('API client is not configured.')
      const symbol = requestedSymbol.trim().toUpperCase()
      const result = await api.GET('/api/stocks/{symbol}/hub', { params: { path: { symbol } } })
      setCompany(companyHubResponseSchema.parse(requireResponse(result, 'Company context')))
      setScreen('company')
    })
  }

  const queueItems: ReviewItem[] = reviewGroups
    ? [...reviewGroups.overdue, ...reviewGroups.today, ...reviewGroups.upcoming, ...reviewGroups.unscheduled, ...reviewGroups.completed]
    : []
  const hasDraft = Boolean(draftOwnerId === user?.id && draft.content.trim())

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.canvas} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>EXPO MANAGED · REACT NATIVE</Text>
        <Text style={styles.appTitle}>Diary Native Proof</Text>
        {busy && <View style={styles.busyRow}><ActivityIndicator color={palette.action} /><Text style={styles.muted}>Connecting to the API…</Text></View>}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {screen === 'restoring' && <Text style={styles.muted}>Checking SecureStore…</Text>}

        {screen === 'configuration' && (
          <Panel title="Set the API origin">
            <Text style={styles.body}>Set EXPO_PUBLIC_API_BASE_URL to an absolute local or staging API origin, then restart Expo. Development may use HTTP for a local simulator; non-development builds require HTTPS.</Text>
          </Panel>
        )}

        {screen === 'login' && (
          <Panel title="Sign in">
            {hasDraft && <Text style={styles.notice}>Your Quick Diary draft remains in memory. Sign in to the same account, check Timeline, then decide whether to save it again. A retry may create a duplicate.</Text>}
            {pendingDiaryId && <Text style={styles.muted}>Diary {pendingDiaryId} is queued and will open after sign-in.</Text>}
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" textContentType="password" />
            <ActionButton title="Sign in and check session" disabled={busy || !email.trim() || !password} onPress={() => { void signIn() }} />
          </Panel>
        )}

        {screen === 'restore-error' && (
          <Panel title="Restore session">
            {user && <Text style={styles.body}>Stored native session for {user.email}</Text>}
            <ActionButton title="Retry authenticated session check" disabled={busy} onPress={() => { void restoreSession() }} />
            <ActionButton title="Sign in with another account" disabled={busy} quiet onPress={() => { void switchAccount() }} />
          </Panel>
        )}

        {screen === 'home' && user && (
          <Panel title={`Signed in as ${user.email}`}>
            <Text style={styles.body}>The session is restored through GET /api/auth/me. Calendar dates use the account timezone ({user.timezone}).</Text>
            <ActionButton title="Quick Diary" disabled={busy} onPress={enterQuickDiary} />
            <ActionButton title="Timeline" disabled={busy} onPress={() => { void loadTimeline() }} />
            <ActionButton title="Review Queue" disabled={busy} onPress={() => { void loadReviewQueue() }} />
            {selectedReview && <ActionButton title="Continue Diary Review" disabled={busy} onPress={() => setScreen('review')} />}
            <View style={styles.row}>
              <Field label="Company symbol" value={companySymbol} onChangeText={setCompanySymbol} autoCapitalize="characters" autoCorrect={false} />
              <ActionButton title="Open company" disabled={busy} onPress={() => { void loadCompany() }} />
            </View>
            {pendingDiaryId && <ActionButton title={`Open linked Diary ${pendingDiaryId}`} disabled={busy} quiet onPress={() => { void openDiary(pendingDiaryId) }} />}
            <ActionButton title="Log out / switch account" disabled={busy} quiet onPress={() => { void switchAccount() }} />
          </Panel>
        )}

        {screen === 'quick' && (
          <Panel title="Quick Diary">
            <Text style={styles.body}>Saves are explicit. A 401 keeps this draft for after sign-in. If the connection ends without a response, the API may already have saved it: check Timeline before retrying. This proof cannot guarantee retries are duplicate-safe.</Text>
            <Field label="Diary date (YYYY-MM-DD)" value={draft.date} onChangeText={date => setDraft(current => ({ ...current, date }))} autoCapitalize="none" />
            <Field label="Markdown content" value={draft.content} onChangeText={content => setDraft(current => ({ ...current, content }))} multiline textAlignVertical="top" placeholder="What changed? What evidence matters?" />
            <Field label="Tags (comma separated)" value={draft.tags} onChangeText={tags => setDraft(current => ({ ...current, tags }))} autoCapitalize="none" />
            <Field label="Company symbol (optional)" value={draft.symbol} onChangeText={symbol => setDraft(current => ({ ...current, symbol }))} autoCapitalize="characters" />
            <ActionButton title="Save Quick Diary" disabled={busy || !draft.content.trim()} onPress={() => { void saveQuickDiary() }} />
            <ActionButton title="Back to home" quiet disabled={busy} onPress={() => setScreen('home')} />
          </Panel>
        )}

        {screen === 'timeline' && (
          <Panel title="Timeline · latest 20">
            {timeline.length === 0 && <Text style={styles.muted}>No Diaries yet.</Text>}
            {timeline.map(item => (
              <Pressable key={item.id} accessibilityRole="button" onPress={() => { void openDiary(item.id) }} style={styles.listItem}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.muted}>{item.date} · {item.reviewStatus}</Text>
                <Text style={styles.body}>{item.excerpt}</Text>
              </Pressable>
            ))}
            <ActionButton title="Refresh Timeline" disabled={busy} onPress={() => { void loadTimeline() }} />
            <ActionButton title="Back to home" quiet disabled={busy} onPress={() => setScreen('home')} />
          </Panel>
        )}

        {screen === 'diary' && selectedDiary && (
          <Panel title={selectedDiary.title}>
            <Text style={styles.muted}>{selectedDiary.date} · {selectedDiary.tags.join(', ') || 'No tags'}</Text>
            <Text style={styles.label}>Markdown source</Text>
            <Text selectable style={styles.markdown}>{selectedDiary.content ?? ''}</Text>
            <Text style={styles.muted}>This is the raw Markdown string rendered as native text, not HTML.</Text>
            {selectedDiary.stockSymbols.map(symbol => (
              <ActionButton key={symbol} title={`Company context · ${symbol}`} disabled={busy} onPress={() => { setCompanySymbol(symbol); void loadCompany(symbol) }} />
            ))}
            <ActionButton title="Open Review Queue" disabled={busy} onPress={() => { void loadReviewQueue() }} />
            <Text selectable style={styles.muted}>Deep link: diary-v3://diaries/{selectedDiary.id}</Text>
            <ActionButton title="Back to Timeline" quiet disabled={busy} onPress={() => { setScreen('timeline') }} />
            <ActionButton title="Back to home" quiet disabled={busy} onPress={() => setScreen('home')} />
          </Panel>
        )}

        {screen === 'reviews' && (
          <Panel title="Review Queue · Diary items">
            {!queueItems.some(item => item.targetType === 'diary') && <Text style={styles.muted}>No Diary Reviews are waiting.</Text>}
            {queueItems.filter((item): item is Extract<ReviewItem, { targetType: 'diary' }> => item.targetType === 'diary').map(item => (
              <Pressable key={item.id} accessibilityRole="button" onPress={() => { void openReview(item) }} style={styles.listItem}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.muted}>{item.date} · {item.reviewStatus} · {item.reviewOutcome ?? 'not reviewed'}</Text>
                {item.stockSymbols.length > 0 && <Text style={styles.muted}>{item.stockSymbols.join(', ')}</Text>}
              </Pressable>
            ))}
            <ActionButton title="Refresh Review Queue" disabled={busy} onPress={() => { void loadReviewQueue() }} />
            <ActionButton title="Back to home" quiet disabled={busy} onPress={() => setScreen('home')} />
          </Panel>
        )}

        {screen === 'review' && selectedReview && (
          <Panel title={`Diary Review · ${selectedReview.title}`}>
            <Text style={styles.muted}>{selectedReview.date} · original decision</Text>
            <Text selectable style={styles.markdown}>{selectedReview.content ?? ''}</Text>
            <Text style={styles.label}>Outcome</Text>
            <View style={styles.choiceRow}>
              {(['INTACT', 'PARTIAL', 'INVALIDATED', 'UNCLEAR'] as const).map(value => (
                <Pressable key={value} accessibilityRole="button" onPress={() => setReviewOutcome(value)} style={[styles.choice, reviewOutcome === value && styles.choiceSelected]}>
                  <Text style={styles.choiceText}>{value}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Reflection" value={reviewSummary} onChangeText={setReviewSummary} multiline textAlignVertical="top" placeholder="What did the outcome teach you?" />
            <ActionButton title="Save Review" disabled={busy || !reviewSummary.trim()} onPress={() => { void saveDiaryReview() }} />
            <ActionButton title="Back to Review Queue" quiet disabled={busy} onPress={() => { void loadReviewQueue() }} />
          </Panel>
        )}

        {screen === 'company' && company && (
          <Panel title={`${company.company.symbol} · Company context`}>
            <Text style={styles.body}>{company.company.name ?? 'Name unavailable'} · {company.company.currency ?? 'Currency unavailable'}</Text>
            <Text style={styles.body}>Position: {company.position.state}</Text>
            <Text style={styles.body}>Quote: {company.position.price === null ? 'Unavailable' : `${company.position.price} ${company.company.currency ?? ''}`} · {company.position.quoteStatus}</Text>
            {company.company.watchStatus && <Text style={styles.body}>Watchlist: {company.company.watchStatus}</Text>}
            <Text style={styles.label}>Related private Diaries</Text>
            {company.relatedDiaries.length === 0 && <Text style={styles.muted}>No related Diaries for this account.</Text>}
            {company.relatedDiaries.map(item => <Text key={item.id} style={styles.body}>{item.date} · {item.title} · {item.relation}</Text>)}
            <Text style={styles.label}>Recent notes</Text>
            {company.notes.length === 0 && <Text style={styles.muted}>No notes available.</Text>}
            {company.notes.map(item => <Text key={item.id} style={styles.body}>{item.title}: {item.content}</Text>)}
            <Text style={styles.label}>Recent evidence</Text>
            {company.evidence.length === 0 && <Text style={styles.muted}>No evidence available.</Text>}
            {company.evidence.map(item => <Text key={item.id} style={styles.body}>{item.occurredAt} · {item.summary}</Text>)}
            <ActionButton title="Back to home" quiet disabled={busy} onPress={() => setScreen('home')} />
          </Panel>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  page: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 48, gap: 12 },
  eyebrow: { color: palette.action, fontSize: 12, fontWeight: '700' },
  appTitle: { color: palette.text, fontSize: 24, lineHeight: 32, fontWeight: '700', marginBottom: 8 },
  panel: { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderRadius: 10, padding: 16, gap: 12 },
  panelTitle: { color: palette.text, fontSize: 18, lineHeight: 25, fontWeight: '700' },
  body: { color: palette.text, fontSize: 16, lineHeight: 26 },
  muted: { color: palette.muted, fontSize: 14, lineHeight: 20 },
  label: { color: palette.text, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  field: { flex: 1, gap: 4 },
  input: { borderColor: palette.control, borderWidth: 1, borderRadius: 6, color: palette.text, backgroundColor: palette.surface, minHeight: 48, paddingHorizontal: 11, paddingVertical: 9 },
  multilineInput: { minHeight: 150, textAlignVertical: 'top' },
  markdown: { color: palette.text, fontSize: 16, lineHeight: 30 },
  button: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6, backgroundColor: palette.action },
  quietButton: { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
  disabledButton: { opacity: 0.5 },
  pressedButton: { opacity: 0.78 },
  buttonText: { color: palette.onAction, fontSize: 14, fontWeight: '700' },
  quietButtonText: { color: palette.text },
  error: { color: palette.negative, backgroundColor: palette.surface, borderColor: palette.negative, borderWidth: 1, borderRadius: 8, padding: 12, lineHeight: 20 },
  notice: { color: palette.infoText, backgroundColor: palette.infoSurface, borderRadius: 8, padding: 12, lineHeight: 22 },
  listItem: { borderTopColor: palette.border, borderTopWidth: 1, minHeight: 48, paddingVertical: 12, gap: 5 },
  itemTitle: { color: palette.text, fontSize: 16, fontWeight: '600' },
  row: { gap: 8 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 9, paddingVertical: 8, borderColor: palette.borderStrong, borderWidth: 1, borderRadius: 6 },
  choiceSelected: { borderColor: palette.action, backgroundColor: palette.selected },
  choiceText: { color: palette.text, fontSize: 12, fontWeight: '600' },
  busyRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
})
