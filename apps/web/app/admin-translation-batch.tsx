import { useEffect, useRef, useState } from 'react';
import {
  ARTICLE_TRANSLATION_BATCH_LIMIT,
  articleLocaleSchema,
  articleTranslationBatchResponseSchema,
  articleTranslationStatesResponseSchema,
  type ArticleLocale,
} from '@diary/contracts';
import { csrfToken, sessionFetch } from './session';
import { useUi } from './ui';
import { apiFailure, FailureNotice, type Failure } from './api-error';
import './admin-article-translations.css';
import './authoring.css';

type States = ReturnType<typeof articleTranslationStatesResponseSchema.parse>;
type Results = ReturnType<typeof articleTranslationBatchResponseSchema.parse>;

const copy = {
  en: {
    heading: 'Translations for the selected articles',
    intro: 'Queue or re-queue machine translation for the selection. Results stay drafts for review; nothing here publishes or replaces a published translation.',
    loading: 'Reading translation state…',
    article: 'Article', source: 'Source', access: 'Access',
    provider: 'Provider', edge: 'Microsoft Edge Translate', ai: 'AI translation',
    targets: 'Target languages', dispatch: 'Request translation',
    confirmTitle: 'Queue translation jobs?',
    confirmBody: (jobs: number, provider: string) => `${jobs} job${jobs === 1 ? '' : 's'} will be sent to ${provider}. Article text leaves this service, and each result returns as a draft for review.`,
    confirm: 'Queue jobs', cancel: 'Cancel',
    resultsHeading: 'Dispatch results',
    outcome: { QUEUED: 'Queued', ALREADY_ACTIVE: 'Already in progress', SKIPPED_SOURCE_LOCALE: 'Skipped — source language', NOT_FOUND: 'Article not found', PRIVACY_RESTRICTED: 'Not allowed for this article', PROVIDER_DISABLED: 'Provider unavailable', FAILED: 'Failed' },
    status: { MISSING: 'None', QUEUED: 'Queued', TRANSLATING: 'Translating', NEEDS_REVIEW: 'Needs review', READY: 'Ready', PUBLISHED: 'Published', UNPUBLISHED: 'Unpublished', STALE: 'Stale', FAILED: 'Failed' },
    limit: (limit: number) => `Select at most ${limit} articles for one dispatch.`,
    noTargets: 'The selected articles share one source language with no available target.',
    failure: 'Unable to read translation state.',
  },
  'zh-TW': {
    heading: '所選文章的翻譯',
    intro: '為所選文章排入或重新排入機器翻譯。結果仍是待審草稿；這裡不會發布或取代已發布的翻譯。',
    loading: '正在讀取翻譯狀態…',
    article: '文章', source: '原文語言', access: '閱讀權限',
    provider: '翻譯服務', edge: 'Microsoft Edge Translate', ai: 'AI 翻譯',
    targets: '目標語言', dispatch: '發起翻譯',
    confirmTitle: '要排入翻譯工作嗎？',
    confirmBody: (jobs: number, provider: string) => `將有 ${jobs} 項工作送往 ${provider}。文章內容會離開本服務，每份結果都會以待審草稿返回。`,
    confirm: '排入工作', cancel: '取消',
    resultsHeading: '發起結果',
    outcome: { QUEUED: '已排入', ALREADY_ACTIVE: '已在進行中', SKIPPED_SOURCE_LOCALE: '已略過— 原文語言', NOT_FOUND: '找不到文章', PRIVACY_RESTRICTED: '此文章不允許', PROVIDER_DISABLED: '服務無法使用', FAILED: '失敗' },
    status: { MISSING: '未有', QUEUED: '已排入', TRANSLATING: '翻譯中', NEEDS_REVIEW: '待審閱', READY: '可發布', PUBLISHED: '已發布', UNPUBLISHED: '已下架', STALE: '需更新', FAILED: '失敗' },
    limit: (limit: number) => `一次最多選取 ${limit} 篇文章。`,
    noTargets: '所選文章的原文語言相同，沒有可用的目標語言。',
    failure: '暫時無法讀取翻譯狀態。',
  },
  'zh-CN': {
    heading: '所选文章的翻译',
    intro: '为所选文章排入或重新排入机器翻译。结果仍是待审草稿；这里不会发布或替换已发布的翻译。',
    loading: '正在读取翻译状态…',
    article: '文章', source: '原文语言', access: '阅读权限',
    provider: '翻译服务', edge: 'Microsoft Edge Translate', ai: 'AI 翻译',
    targets: '目标语言', dispatch: '发起翻译',
    confirmTitle: '要排入翻译工作吗？',
    confirmBody: (jobs: number, provider: string) => `将有 ${jobs} 项工作送往 ${provider}。文章内容会离开本服务，每份结果都会以待审草稿返回。`,
    confirm: '排入工作', cancel: '取消',
    resultsHeading: '发起结果',
    outcome: { QUEUED: '已排入', ALREADY_ACTIVE: '已在进行中', SKIPPED_SOURCE_LOCALE: '已跳过— 原文语言', NOT_FOUND: '找不到文章', PRIVACY_RESTRICTED: '此文章不允许', PROVIDER_DISABLED: '服务无法使用', FAILED: '失败' },
    status: { MISSING: '未有', QUEUED: '已排入', TRANSLATING: '翻译中', NEEDS_REVIEW: '待审阅', READY: '可发布', PUBLISHED: '已发布', UNPUBLISHED: '已下架', STALE: '需更新', FAILED: '失败' },
    limit: (limit: number) => `一次最多选取 ${limit} 篇文章。`,
    noTargets: '所选文章的原文语言相同，没有可用的目标语言。',
    failure: '暂时无法读取翻译状态。',
  },
} as const;

/**
 * Batch translation management for the Admin article list. Selecting articles
 * never calls a provider: the state read is one authenticated query, and
 * dispatch is an explicit, confirmed action that reports an outcome per article
 * and locale.
 */
export function TranslationBatch({ selected }: { selected: string[] }) {
  const { locale } = useUi(), c = copy[locale];
  const [states, setStates] = useState<States | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [provider, setProvider] = useState<'edge' | 'ai'>('edge');
  const [targets, setTargets] = useState<ArticleLocale[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [pending, setPending] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const ids = selected.slice(0, ARTICLE_TRANSLATION_BATCH_LIMIT).join(',');

  useEffect(() => {
    if (!ids) { setStates(null); return; }
    let active = true;
    setResults(null);
    void sessionFetch(`/api/admin/article-translations/states?ids=${encodeURIComponent(ids)}`).then(async response => {
      const body: unknown = await response.json().catch(() => null);
      if (!active) return;
      const parsed = articleTranslationStatesResponseSchema.safeParse(body);
      if (response.ok && parsed.success) { setStates(parsed.data); setFailure(null); }
      else setFailure(apiFailure(body, c.failure));
    }).catch(() => { if (active) setFailure({ message: c.failure, fields: [] }); });
    return () => { active = false; };
  }, [ids, c.failure]);

  if (!selected.length) return null;
  const available = articleLocaleSchema.options.filter(item => states?.articles.some(article => article.sourceLocale !== item));
  const chosen = targets.filter(item => available.includes(item));
  const jobs = (states?.articles ?? []).reduce((total, article) => total + chosen.filter(item => item !== article.sourceLocale).length, 0);

  async function dispatch() {
    setPending(true);
    setResults(null);
    try {
      if (!csrfToken()) await sessionFetch('/api/auth/me');
      const response = await sessionFetch('/api/admin/article-translations/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() ?? '' },
        body: JSON.stringify({ articleIds: selected.slice(0, ARTICLE_TRANSLATION_BATCH_LIMIT), targetLocales: chosen, provider }),
      });
      const body: unknown = await response.json().catch(() => null);
      const parsed = articleTranslationBatchResponseSchema.safeParse(body);
      if (response.ok && parsed.success) { setResults(parsed.data); setFailure(null); }
      else setFailure(apiFailure(body, c.failure));
    } finally {
      setPending(false);
    }
  }

  const title = (articleId: string) => states?.articles.find(article => article.articleId === articleId)?.title ?? articleId;
  return <section className="panel admin-translation-batch" aria-labelledby="admin-translation-batch-title">
    <header><h2 id="admin-translation-batch-title">{c.heading}</h2></header>
    <p className="muted">{c.intro}</p>
    {selected.length > ARTICLE_TRANSLATION_BATCH_LIMIT && <p className="muted">{c.limit(ARTICLE_TRANSLATION_BATCH_LIMIT)}</p>}
    <FailureNotice failure={failure} />
    {states === null && !failure ? <p role="status">{c.loading}</p> : states && <>
      <div className="table-scroll"><table>
        <caption>{c.heading}</caption>
        <thead><tr><th scope="col">{c.article}</th><th scope="col">{c.source}</th><th scope="col">{c.access}</th>{articleLocaleSchema.options.map(item => <th key={item} scope="col">{item}</th>)}</tr></thead>
        <tbody>{states.articles.map(article => <tr key={article.articleId}>
          <th scope="row">{article.title}</th>
          <td>{article.sourceLocale}</td>
          <td>{article.access}</td>
          {articleLocaleSchema.options.map(item => {
            const row = article.locales.find(value => value.locale === item);
            return <td key={item}>{row ? c.status[row.status] : '—'}</td>;
          })}
        </tr>)}</tbody>
      </table></div>
      <div className="admin-translation-controls">
        <div className="authoring-field"><label htmlFor="translation-batch-provider">{c.provider}</label><select id="translation-batch-provider" value={provider} onChange={event => setProvider(event.target.value === 'ai' ? 'ai' : 'edge')}><option value="edge">{c.edge}</option><option value="ai">{c.ai}</option></select></div>
        <fieldset className="admin-translation-targets"><legend>{c.targets}</legend>
          {available.length === 0 ? <p className="muted">{c.noTargets}</p> : available.map(item => <label key={item}>
            <input type="checkbox" checked={chosen.includes(item)} onChange={event => setTargets(current => event.target.checked ? [...current, item] : current.filter(value => value !== item))} />
            {item}
          </label>)}
        </fieldset>
        <button type="button" disabled={pending || !chosen.length || jobs === 0} onClick={() => dialog.current?.showModal()}>{c.dispatch}</button>
      </div>
    </>}
    {results && <div className="admin-translation-results" role="status">
      <h3>{c.resultsHeading}</h3>
      <ul>{results.results.map(result => <li key={`${result.articleId}-${result.locale}`}>
        {title(result.articleId)} · {result.locale} · <strong>{c.outcome[result.outcome]}</strong>{result.message ? ` — ${result.message}` : ''}
      </li>)}</ul>
    </div>}
    <dialog ref={dialog} className="delete-dialog" aria-labelledby="admin-translation-confirm-title">
      <h2 id="admin-translation-confirm-title">{c.confirmTitle}</h2>
      <p>{c.confirmBody(jobs, provider === 'ai' ? c.ai : c.edge)}</p>
      <div className="actions">
        <button type="button" className="secondary" autoFocus onClick={() => dialog.current?.close()}>{c.cancel}</button>
        <button type="button" disabled={pending} onClick={() => { dialog.current?.close(); void dispatch(); }}>{c.confirm}</button>
      </div>
    </dialog>
  </section>;
}
