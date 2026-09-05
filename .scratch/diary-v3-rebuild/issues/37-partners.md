# [37] 建立 Partner 關係並管理雙方分享設定

Status: done
Type: AFK
User stories covered: US-066, US-067, US-074

## Parent

[完整重構 PRD](../PRD.md)

## What to build

完成邀請、接受、解除 Partner，以及雙方獨立的 Diary／Stock Note 分享旗標設定。

## Acceptance criteria

- [x] pending／accepted 關係、重複邀請、雙方 owner 與解除規則符合基準。
- [x] 任一方只可變更自己的分享設定，重新登入仍保存。
- [x] 真人與普通 Agent User 使用相同路徑；真 UI／API／DB 覆蓋雙帳戶操作。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [04 web-session](04-web-session.md)


## Source policy and schema foundation

Audited frozen partner policy, queries, service and response/invite/sharing handlers. Canonical sorted A/B user IDs exclude self; duplicate invitations conflict even in reverse direction. Only pending recipient may accept. Either participant may remove. Sharing updates require connected status and write only the viewer's own Diary/Stock Note flags. Reads project partner id/email/name plus viewer-relative status and sharing flags; partner content visibility additionally requires acceptance and the other side's flag. Accepted links sort ahead of pending; PostgreSQL null ordering must be explicit in the implementation.

Added partner contracts and migration 0014 with sorted unique pair, participant initiator, cascade foreign keys and a pending-private check. Every sharing flag defaults false. Invite email normalizes case/whitespace; update input accepts only self flag names and requires at least one boolean.

Two contract/PostgreSQL cases passed (1.68s): normalization/strict fields, self/reversed/foreign-initiator rejection, concurrent opposite-direction initiation with one unique winner, private defaults, pending-sharing rejection, millisecond acceptance time and participant-deletion cascade. API lifecycle, dual-account UI, shared-content integration and independent security review remain unimplemented/pending. No ticket completion claimed.


## Partner lifecycle HTTP checkpoint

Implemented list/invite/accept/sharing/remove routes. List returns viewer-relative DTOs in repeatable-read consistency, explicitly acceptedAt DESC NULLS LAST then updatedAt/id descending. Invitation uses canonical pair and conflict-safe insertion. Accept/share/remove lock the current link and recheck participant/state inside the transaction; sharing updates only explicitly supplied fields on the viewer's side. Defaults remain private.

Real HTTP/PostgreSQL tests passed 2/2 (1.81s): normalized email, self-invite rejection, incoming/outgoing status, sender/outsider accept denial, pending sharing denial, acceptance, simultaneous opposite-side sharing updates without clobbering, unknown field rejection, guest/CSRF, third-party remove denial, recipient removal, post-removal 404, concurrent reverse invitation single winner and concurrent accept single winner. Typecheck/lint passed before final test additions; final check follows.

Outstanding: verify exact legacy status-code factory mapping, OpenAPI/generated client, remove/read races and account deletion mapping, avoid per-link participant reads for large lists, React dual-account flow, actual shared-data integrations and independent security review. No ticket completion claimed.


## Contract and list-query integration

Verified frozen lib/errors/factory.ts mappings: not-found 404, access-denied 403, duplicate 409 and pending 409 match implementation. Added all five Partner operations and response wrappers to OpenAPI/generated standard-fetch client, plus signed-out private guarding and safe `/partners` login return.

List now joins the other participant in one query instead of a query per link. Real HTTP/PostgreSQL suite passed 3/3 (2.29s), including accepted-before-newer-pending ordering and both viewer projections, with prior lifecycle/concurrency cases retained. Typecheck/lint and contracts drift check passed. React UI and remaining privacy/race/independent acceptance remain pending.


## React dual-account workflow

Added /partners navigation/page with invite email, incoming/outgoing/connected status, recipient-only acceptance, explicit self sharing toggles and read-only partner sharing, confirmation before removal, refresh, failure notices, empty state and three locales. Requests abort on unmount and failed invitation preserves input. The page explains sharing defaults off after acceptance.

Real two-browser-context case passed (7.7s): sender invites, recipient accepts, each enables a different resource, opposite-side status updates after refresh, persistence after reload, removal visible to both and logout clearance. Desktop light/mobile dark screenshots author-inspected with long email wrap and no horizontal overflow. See docs/design/partners-finish-review.md; independent review is still pending. Full locale/keyboard/error recovery, uncertain mutation recovery and actual partner-content integration remain required.

## Bounded finish evidence (2026-09-06)

The approved evidence gap is covered without production changes. `tests/integration/partner-http.test.ts` now submits the same normalized invite twice in sequence and asserts the second request is 409, then removes the accepted relationship from the initiating account and verifies the relationship list is empty and subsequent sharing mutation is 404. The same focused PostgreSQL/HTTP suite passed 7/7 in 5.47s; its existing reverse-invite, concurrent-accept, ownership, sharing and cascade cases remain included.

The existing two-account browser case now signs the sender out through the UI, signs in again with the same credentials, and verifies the persisted partner sharing projection plus both own controls before continuing through the existing Partner and Pair View flow. `tests/e2e/partners.spec.ts` passed 2/2 in 10.4s. Root reviewed the Partner API additions and the refreshed 390px settings / 1440px comparison captures and approved the behavioral and visual acceptance on 2026-09-06. Worker 44's unrelated market-state persistence gate is now green; root verified the final global typecheck, lint and contracts checks.

## Final acceptance evidence

Root accepted all three criteria on 2026-09-06. Evidence combines the focused HTTP/PostgreSQL suite (7/7, including duplicate-invite 409, owner-scoped sharing/removal, reverse/concurrent lifecycle and cascade invariants), the dual-account Chrome flow (2/2, including true logout/login persistence), and root's independent review of the Partner API and refreshed settings/comparison captures. Ticket 37 is complete.
