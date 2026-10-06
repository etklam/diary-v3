# Guru follows, alerts, and decision-time journal context

This slice connects the prepared Guru domain to one member's private workflow. Nothing here changes how institutional data is computed; it only decides what reaches a member and what a diary entry keeps.

## Private follows and watches

A Guru follow (`guru_followers`, introduced with the directory) and a stock watch (`guru_stock_watches`) are private rows. An API response returns only the caller's own state plus aggregate follower counts; watcher identities and watcher counts are never exposed. A watch requires the ticker to resolve to exactly one tracked security — an ambiguous or unmapped ticker is refused rather than guessed.

## Alert settings

`/gurus/notifications` manages the seven event types: new filing, new position, exited position, strong add, strong reduction, new holder of a watched stock, and consensus direction change. Each one is independently enabled or disabled. Defaults enable everything except consensus direction change.

Two meaningful-change thresholds are available: a minimum portfolio weight and a minimum reported quantity-change percentage. Both are optional, and a move must clear every threshold that is set. Thresholds apply to position moves; a new filing is not a move and is controlled only by its toggle.

## Delivery and idempotency

Delivery is the last consumer of the same prepared data the research pages read, so a member is never told about a quarter before its analytics and consensus exist. Two consumers run inside the institutional worker loop:

- The **snapshot-change consumer** (`guru_notification_event_deliveries`) produces followed-Guru events from the prepared quarter analytics and holding changes.
- The **consensus consumer** (`guru_notification_consensus_deliveries`) produces watched-stock events from the prepared consensus snapshot, comparing it with the previous quarter's snapshot for a direction change.

Every notification carries a deterministic dedupe key (`filing:<id>`, `change:<analyticsId>:<positionKey>:<action>`, `stock-holders:<snapshotId>:<securityId>`, `consensus:<snapshotId>:<securityId>`) and is unique per member. A retried or re-run delivery job inserts the same key and the insert is discarded, so a retry never notifies twice. A failed pass records its attempt count and backs off; it does not partially re-deliver.

## Decision-time journal snapshots

A diary entry can attach the Guru context its author saw. `POST /api/diaries/:id/guru-snapshots` captures the prepared holder count, each tracked holder's action, weight, quantity and rank, the stock's consensus counts and classification, and the sector, industry, and mapped-theme direction for that quarter.

The row is insert-only. Re-attaching the same stock and quarter returns the existing snapshot instead of recomputing it, and a later rebuild of the quarter cannot change it — the integration test rebuilds the quarter and asserts the stored snapshot is byte-identical.

Snapshots and every other research consumer read the typed `guru-decision-context-v1` structure, whose `source` is `prepared-institutional-analytics`. Generated commentary is never part of it: [Guru AI analysis](guru-analysis.md) is a separate, separately versioned artifact and is never treated as primary data.

## Ownership

Every route in this slice resolves the caller first and scopes its reads and writes to that member. Another member's notifications, alert settings, watch list, and diary snapshots are not readable, and a diary that belongs to someone else returns the same not-found response as a diary that does not exist.
