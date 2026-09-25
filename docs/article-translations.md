# Article translations

Articles keep one source locale and a revision fingerprint. Each target locale has a separate translation row with an editable draft snapshot and an independent published snapshot. Publishing a new draft never overwrites the currently published snapshot. Machine translations always enter review as drafts.

## Locale and reader behavior

The supported locale codes are `zh-TW`, `zh-CN`, and `en`. Source articles default to `zh-TW` for existing API clients. Reader resolution uses the `lang` query parameter first, then the signed-in user's UI locale or the guest `diary-locale` cookie, then the source locale. A missing or stale translation resolves to the source and sets `isFallback`, `fallbackReason`, and the actual `resolvedLocale` in the response.

Article list titles and excerpts use the same current published translation resolver as detail pages. Search still queries the source article fields; translated search indexing is a follow-up. Marketing article metadata emits canonical and `hreflang` links only for the source and translation snapshots currently available to readers. Member-only article routes and metadata preserve the existing access checks and no-store behavior.

## Admin workflow

In the Admin article editor, choose a source locale, target locales, and a provider. Translation requests create PostgreSQL jobs. A worker translates each locale independently and stores a draft bound to the source revision and hash. Admins can preview, edit, review, publish, and unpublish each locale. Readers never trigger a translation provider call.

The optional automatic setting enqueues draft jobs after publishing the source article. It never approves or publishes translations. Edge jobs on MEMBER articles fail before an outbound request. AI jobs on MEMBER articles are denied unless the isolated translation AI policy explicitly allows them.

AI settings live at `/admin/article-translations` and use separate database configuration, key encryption, timeout, endpoint allowlist, model, prompt version, and per-job token/call limits. Endpoint hosts must be present in `AI_ALLOWED_BASE_URLS`. The configured base URL uses the existing outbound AI transport's HTTPS validation and DNS-pinned request. AI settings for weekly reports, monthly reports, and Research Studio are not reused or changed.

## Providers and data handling

### Microsoft Edge Translate (Experimental)

The adapter uses the currently observed `POST https://edge.microsoft.com/translate/translatetext` request format, with `from`, `to`, and `isEnterpriseClient=false` query parameters, a JSON array of strings, and a response array containing `translations[].text`. The locale mapping is `zh-TW` to `zh-Hant`, `zh-CN` to `zh-Hans`, and `en` to `en`.

This endpoint is undocumented and is not represented as a stable Microsoft third-party API. The adapter has bounded request sizes and batches, an eight-second default timeout, finite retries with exponential backoff, `Retry-After` handling for 429 responses, no retry for 401/403/404, one global worker lease, and a persistent circuit breaker. It has no proxy rotation, IP spoofing, or automatic AI fallback. Repeated failures are shown on the Admin article and require a manual retry or explicit AI selection.

Edge requests contain the source article text and are restricted to `PUBLIC` articles. The editor warns Admins that article text is sent to a third-party translation service. Edge Translate is separate from Azure Translator; no Azure quota, SLA, unlimited use, or permanent free-use claim applies.

The request format was last checked on 2026-09-25 against [an observation of the current Edge endpoint](https://www.ankio.net/research/technology/microsoft-edge-translate-api). The current [plainheart/bing-translate-api implementation](https://github.com/plainheart/bing-translate-api/blob/master/src/met/index.js) was reviewed but not copied because it uses the legacy `/translate/auth` token flow. The endpoint has not been live-tested by this implementation.

### AI Translate

AI requests use the existing outbound HTTPS client and SSRF controls, but a translation-only configuration and encrypted secret reference. A fixed system prompt treats article blocks as data, requires faithful translation, and prohibits summarization, analysis changes, advice, data updates, or changes to numbers, tickers, dates, percentages, citations, and uncertainty. Responses must pass structured schema and Markdown validation. An HTTP 200 response alone is not a successful translation.

AI requests are not retried after dispatch because a provider outcome could be unknown and could incur another charge. Worker recovery marks such outcomes as failed and does not dispatch the same AI job again. An Admin can explicitly create a new job after reviewing the state.

## Markdown and source freshness

The pipeline parses Markdown with mdast and translates semantic blocks in one pipeline invocation per job. An adapter may make a bounded number of provider requests or batches. Source offsets are retained for reconstruction. The pipeline protects links, image paths, code, formulas, citations, tickers, prices, percentages, basis points, dates, timestamps, and Markdown structure. Reconstructed Markdown is reparsed and compared against the original structure before it can be saved.

Changes to source locale, title, excerpt, or content increment `sourceRevision`, update `sourceHash`, and mark existing translation rows stale. A worker verifies the source before and after a provider call. Results for an outdated source are kept on the completed job as history and cannot replace a current draft or become publishable. Research article translation publication reuses the existing source publication approval and freshness guard.

## Worker operations

Migration `0034_article_translations.sql` creates the translation tables and source-fingerprint triggers. Apply the normal database migration before starting workers.

Local worker command:

```sh
npm run article-translations:worker
```

Run one durable job:

```sh
npm run article-translations:worker -- --once
```

The worker claims one global PostgreSQL lease, so concurrent replicas do not exceed the configured translation concurrency. It heartbeats the job lease, recovers queued work after restart, retries expired Edge work only within its finite retry limit, and does not automatically redispatch a previously dispatched AI job. There is no Redis, Kafka, broker, or scheduled translation call.

`ops/k8s/production/10-article-translation-worker.yaml` is an optional, zero-replica deployment definition with restricted egress. This task does not apply or scale it in a cluster. If an operator enables it, review the provider domains and NetworkPolicy first; the AI endpoint must also be allowed by `AI_ALLOWED_BASE_URLS`.

## Verification

The automated provider tests inject mock HTTP transports and do not call Edge or AI services:

```sh
npm run test:unit -- tests/unit/article-translations-providers.test.ts
```

The PostgreSQL integration tests provision isolated disposable local databases and use only synthetic articles and mock providers:

```sh
npm run test:integration -- tests/integration/article-translations.test.ts
```

No live Edge request or AI API key is required for either command.
