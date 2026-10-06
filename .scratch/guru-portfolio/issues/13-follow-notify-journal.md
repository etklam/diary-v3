# [13] Integrate Guru follows, alerts, journal, and research context

Status: ready-for-agent
Execution: in-progress
Type: AFK

## Parent

[Guru Portfolio PRD](../PRD.md)

## What to build

Connect the prepared Guru domain to personal follows, stock activity watches, notification controls, decision-time journal snapshots, and read-only research context consumers.

## Acceptance criteria

- [x] Members can watch stock Guru activity; notification delivery uses the Guru follow state introduced in ticket 06 and never exposes follower identities.
- [x] Notification preferences toggle each defined event type and configure meaningful-change thresholds for weight and/or quantity change.
- [x] Filing, position, stock-holder, and consensus notifications are idempotent across job retries and avoid duplicate delivery.
- [x] Journal can attach a decision-time snapshot of holder count and Guru actions/weights; it remains immutable when later quarters or analytics are rebuilt.
- [x] Research consumers use typed structured position, consensus, and sector context; Guru AI prose is not treated as primary data.
- [x] Ownership checks prevent one user's follow preferences and journal context from leaking to another.
- [x] Disposable PostgreSQL tests cover ownership and notification idempotency; browser evidence covers preferences and journal attachment.

## Blocked by

- [07 portfolio history and activity](07-portfolio-history-activity.md)
- [08 consensus and sector intelligence](08-consensus-sectors-stocks.md)
- [09 compare and stock integration](09-compare-stock-integration.md)

## Resolved workflow decisions

- Follows and watches are private rows. Responses carry only the caller's own state plus aggregate follower counts; watcher identities and watcher counts are never returned. A watch requires a ticker that resolves to exactly one tracked security.
- Seven event types are independently toggled. Two optional thresholds — minimum portfolio weight and minimum reported quantity-change percentage — apply to position moves, and a move must clear every threshold that is set. A new filing is not a move and is governed only by its toggle.
- Delivery runs as the last consumer of the same prepared data the research pages read, so a member never hears about a quarter before its analytics and consensus exist.
- Idempotency is a per-member dedupe key, not a job flag: `filing:<id>`, `change:<analyticsId>:<positionKey>:<action>`, `stock-holders:<snapshotId>:<securityId>`, and `consensus:<snapshotId>:<securityId>`. A re-run pass inserts the same keys and the inserts are discarded.
- A decision-time journal snapshot is insert-only. Re-attaching the same stock and quarter returns the stored row, and a quarter rebuild cannot change it.
- Research consumers and snapshots share the typed `guru-decision-context-v1` structure whose `source` is `prepared-institutional-analytics`. Generated prose is never part of it.
- `/gurus/notifications` is a reserved path: the literal routes are registered before the Guru slug route, and the slug check constraint now rejects `notifications` as well.

## Implementation evidence

- Rules are documented in [docs/guru-follow-notifications.md](../../../docs/guru-follow-notifications.md).
- `npm run typecheck` — passed.
- `npm run contracts:generate` and `npm run contracts:check` — passed.
- `npm run build --workspace=@diary/web` — passed.
- `npx eslint` on the changed API, web, and test files — no findings.
- `npx vitest run --exclude 'tests/integration/**' --exclude 'tests/e2e/**'` — 1123 passed, including the route-classification test that now covers the Guru research and institutional admin destinations.
- `npx vitest run tests/integration/guru-notifications.test.ts` — 3 passed, using a disposable PostgreSQL database: threshold-aware follower delivery with a re-run pass delivering nothing new, watched-stock delivery with the same retry proof and cross-member isolation, and an immutable decision snapshot that survives a quarter rebuild and excludes generated prose.
- `REMOTE_TEST_DB=1 ./node_modules/.bin/playwright test tests/e2e/guru-follow-notifications.spec.ts --workers=1 --reporter=line` — 2 passed at 1440px and 390px. It covers saved preferences, stock watch/unwatch, and a decision-time snapshot attached to a diary.
- Browser screenshots: [alerts desktop/mobile](../../../docs/design/evidence/guru-follow-notify/alerts-1440.png), [alerts mobile](../../../docs/design/evidence/guru-follow-notify/alerts-390.png), [stock watch desktop/mobile](../../../docs/design/evidence/guru-follow-notify/stock-watch-1440.png), [stock watch mobile](../../../docs/design/evidence/guru-follow-notify/stock-watch-390.png), [journal snapshot desktop/mobile](../../../docs/design/evidence/guru-follow-notify/diary-snapshot-1440.png), and [journal snapshot mobile](../../../docs/design/evidence/guru-follow-notify/diary-snapshot-390.png).
