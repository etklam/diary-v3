# Partner comparison as a timeline reading mode

Status: implemented and verified locally, 2026-09-12. Synthetic accounts and the disposable PostgreSQL database only.

## Reading model

Partner comparison is a reading mode of the Diary timeline, not an isolated feature reached only from partner administration. `/timeline` and `/partners/compare` share the `TimelineModeSwitch` (`[My timeline] [Partner comparison]`), the Diary navigation, the page frame and the same heading hierarchy. `/partners` remains relationship and sharing administration; the comparison links to it as a secondary action.

A reader with no partner still sees the mode entry, with an explicit "connect with a partner" state. Both switch entries are real links: keyboard focus, Back/Forward, new tabs and deep links (`/partners/compare?partnerId=…`, partnerId-only legacy links) keep their semantics. Returning to the personal mode restores the reader's most recent timeline filter query (session-scoped, from the existing `useTimeline` restoration context; the restoration mechanism itself is unchanged).

## Grouping and layout

The server pairs each reader with each partner diary by persisted civil `date` (`compareDays.dateKey`). One date is one group: left my diary, right the selected partner's diary, top-aligned. Dates with only one side present still render, with an explicit empty state on the missing side; ordering stays newest-first. Sides are never matched by array index and never become two independently scrolled columns. Under 768px both sides stack inside the same date group, so the pairing survives on phones.

Own entries keep Read and Edit entrances. Partner entries are read-only: no owner detail route, no edit affordance, and no ownership relaxation.

## Shared data boundary

The comparison reads only `GET /api/partners/compare` (`partnerCompareQuerySchema` / `partnerCompareResponseSchema`). `partnerDiarySchema` stays an explicit allowlist: `id, title, content, tags, createdVia, createdByLabel, date, createdAt, updatedAt`. No transactions, holdings, PnL, alerts/reminders, review summary/learning/adjustment, thesis/risk/execution, drafts or account emails are added client- or server-side.

Server authorization is required for every response: signed-in viewer, `partnerId` must be a linked partner, invitation accepted, and the partner's own `shareDiaries` flag on. One-directional sharing is sufficient to read. "Not shared" is never rendered as "no diary that day": the page distinguishes no partner, pending invitation, connected-but-not-sharing, connected-and-sharing with no entry that day, load failure, and removed connection / withdrawn sharing (`PARTNER_LINK_PENDING`, `PARTNER_LINK_NOT_FOUND`).

`limit` stays bounded by the API (20/40/60, default 20) and counts the most recent dates that have records, not calendar days. The `limit` value is URL state; `safeReturnPath` allowlists `partnerId`, `limit=20|40|60`, both orders, and keeps legacy partnerId-only links valid. No date filters, "load all" or client-side filtering pretend to be server queries. The personal timeline keeps its own filters and load-more.

## Selection, revalidation and races

Partner selection and limit live in the URL, so refresh and Back/Forward restore them. Switching partners aborts the in-flight request, clears rendered partner data (and any expanded entries), and only the newest response may render. Window focus re-runs the bounded query, so withdrawn sharing or a removed link drops already-rendered partner content. Explicit and cross-tab sign-out remount the private route, clearing rendered content; partner content is never written to localStorage, route caches or the service worker (`no-store` on the API).

There is no real-time revocation push: another browser that already received shared content is not remotely wiped, and this phase adds no WebSocket or polling service.

## Visual rules

Both sides use text labels (`My diary` / partner name) with neutral and blue accents from the Trade basic tokens; red/green are not used to distinguish people, and the comparison carries no ranking, scores, AI summaries or PnL comparison. Long shared entries render collapsed after 2000 characters with a keyboard-operable expand/collapse control; wide tables and code scroll inside their own container.

## Evidence

`tests/e2e/partner-timeline-parity.spec.ts` covers the mode switch, sidebar ownership, date pairing, mobile stacking, partner races, all distinct states, URL/login-return restoration, sharing withdrawal, unlinking, and sign-out clearing. `tests/integration/partner-http.test.ts` covers the authorization matrix and allowlist on the wire. Built-artifact acceptance adds `Timeline → Partner comparison → real shared data → permission revalidation`. Screenshots: `docs/design/evidence/partner-timeline-parity/`.
