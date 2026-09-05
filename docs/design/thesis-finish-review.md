# Investment Thesis finish review

## Historical author inspection — 2026-09-05

The dedicated Company Thesis route preserves the current thesis separately from review snapshots using the existing flat forms and ordered history. The original detector found no issues. The first browser pass exposed missing explicit option values and locator assumptions; those were corrected before the passing run. The snapshot date label was also corrected to omit `UTC` while retaining the explicit account timezone in its value; capture input remains explicitly UTC.

The original lifecycle browser run was 2/2 (7.7 seconds): draft → active → review/portfolio decision → revise current thesis → original snapshot remains → archive → reload → three locales → logout clearing. The original captures preceded the date-label correction and were stored in the review directory. The mobile editor image also showed the shared skip-link overlay; ticket 21 corrected that shell behavior so the link is clipped until focused.

## Existing domain and API evidence

The existing source-rule tests in `tests/investment-thesis.test.ts` are 2/2, covering full replacement/activation requirements, first activation timestamp retention, health precedence and the strict overdue boundary. The existing PostgreSQL suite in `tests/integration/investment-thesis.test.ts` is 5/5: replacement/normalization/owner isolation; review snapshots and invalidated health; concurrent creation and archive/review serialization; invalid activation/reflection/query/credential boundaries; and review owner-FK plus transaction rollback after snapshot insertion.

## Independent finish validation — 2026-09-06

The focused Chrome suite `tests/e2e/thesis.spec.ts` passed 3/3 in 18.2 seconds: 1440px lifecycle in 7.6s, 390px lifecycle in 4.5s, and failed-save recovery in 2.4s. The lifecycle covers activation, account-timezone history, review snapshot immutability, archive/reload, three locales and logout. Recovery covers failed PUT preservation, unsaved reflection and navigation guard, unchanged `.123Z` due time, subsequent review and dirty-state clearing.

The refreshed captures are [`editor-1440.png`](evidence/thesis/editor-1440.png) (1040×1226), [`editor-390.png`](evidence/thesis/editor-390.png) (358×1333), [`review-1440.png`](evidence/thesis/review-1440.png) (1040×1138) and [`review-390.png`](evidence/thesis/review-390.png) (358×1164). The current mobile editor capture no longer shows the historical skip-link overlap; it retains the Status and due-date fields followed by the thesis text hierarchy. The review captures preserve the outcome, reflection and expanded snapshot order. Browser assertions confirmed no document-width overflow. I found no actual Thesis UI defect requiring a production or CSS change and made no aesthetic changes.

## Final acceptance — 2026-09-06

Root reviewed the current editor/history captures, the existing domain/API/rollback evidence and the 3/3 focused browser result. The lifecycle, review outcomes/decisions, owner boundaries, snapshot immutability, archive transitions, precise due time and recovery behavior were accepted. The historical mobile skip-link overlap is resolved by the ticket21 shell fix. Ticket 26 is complete with no production Thesis or CSS changes.

## Ticket 27 review acceptance — 2026-09-06

The focused PostgreSQL suite `tests/integration/investment-thesis.test.ts` passed 6/6 after adding the narrow review-boundary fixture: invalid outcome and portfolio-decision enums return 400 without state changes, while two sequential valid reviews on one ACTIVE Thesis create distinct ACTIVE snapshots in history. Root accepted this alongside the existing 3/3 Thesis browser evidence and snapshot/owner/rollback coverage. Ticket 27 is complete with no UI or production changes.
