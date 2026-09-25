# Public article translation search

Date: 2026-09-26
Status: Accepted for implementation

## Decision

Public article search considers the source article title and its safe excerpt, plus each translation's published title and safe excerpt. A translation is eligible only when it has a published snapshot, a publication timestamp, a status other than draft, stale, or unpublished, and source revision and hash values equal to the current source article. Draft fields, translated body content, unpublished snapshots, and stale snapshots never participate in public list search or list projections.

The excerpt policy is applied to every language. A PUBLIC article may search its derived excerpt. A MEMBER article may search an excerpt only when the excerpt was explicitly authored as a public teaser. Source and translation titles remain searchable for published MEMBER articles, while protected body-derived text remains excluded.

The existing boolean search groups remain unchanged: required terms are ANDed, optional terms are ORed, excluded terms are negated, quoted terms retain phrase matching, and `*` retains prefix matching. Stopwords and one-character terms are ignored. Latin terms use lexical token boundaries and accept terms of at least two characters, so `AI` matches a token named `AI` but not an arbitrary substring such as the `ai` inside `rail`. Han terms of at least two characters additionally use bounded substring matching so `科技` can match a longer Chinese title or teaser.

Search eligibility is expressed as a source predicate or an `EXISTS` predicate over current translation snapshots. The list query therefore has one row per Post before count, ordering, and pagination; a Post matching multiple languages is counted once. Public results default to `publishedAt DESC, id DESC` and to nine items per page.

Public list rows carry additive `matchedTranslationLocale`, which is the locale of a current published translation that matched the search, or `null` when no translation matched. When more than one translation matches, the requested locale is preferred and the remaining locales are selected deterministically. The result's title and article link continue to use the requested locale; this metadata is only a quiet indication of the language that supplied the match.

List queries select only the fields needed for the wire projection. Translation summaries omit drafts and published body content. Detail and metadata routes continue to load the full current translation snapshot only when their existing response requires it.

## Consequences

Translated article discovery is consistent with detail-page freshness and access rules without exposing private article body text. A source edit automatically removes the old translation from public search until a matching translation snapshot is published. The `EXISTS` predicate avoids duplicate rows and makes total counts and page boundaries stable across multiple matching translations. Search still uses PostgreSQL expression evaluation rather than a separate translation index; an indexed search projection can be introduced later if measured public article volume requires it.
