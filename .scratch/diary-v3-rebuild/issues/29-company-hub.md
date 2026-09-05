# [29] 在 Company Hub 串連持倉、觀點與記憶

Status: done
Type: AFK
User stories covered: US-026, US-047, US-054

## Parent

[完整重構 PRD](../PRD.md)

## What to build

將 Company 的行情、本人持倉、Stock Note、Thesis、Evidence、Timeline 與 Review 組成有界的閱讀入口。

## Acceptance criteria

- [x] 同一 Company 的所有入口指向正確目標，按目前觀點／原始記憶／事後複盤區分。
- [x] 聚合有界、各來源可部分失敗，owner 及 private fields 採白名單。
- [x] 由持倉進入公司、查看證據、開啟複盤的完整桌面／手機流程可示範。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [19 portfolio-valuation](19-portfolio-valuation.md)
- [24 stock-notes](24-stock-notes.md)
- [25 evidence-timeline](25-evidence-timeline.md)
- [27 thesis-review](27-thesis-review.md)

## Source and implementation checkpoint

Frozen `server/utils/company-hub-query.ts`, `lib/contracts/company-hub/index.ts` and the hub handler were audited. Added matching `/api/stocks/:symbol/hub` wire contract and generated client: held/closed/research_only/untracked, cost-basis concentration, missing quote fallback, current Thesis, latest/recent reviews, ten Notes/Evidence/related Diaries. Related Diary projection selects only ID/title/civil date/transaction count/relation, with explicit context taking precedence. All owner DB reads use one repeatable-read snapshot; quote failures only remove valuation. Numeric display projections retain the source contract while authoritative ledger reads keep exact decimals.

Owner API scenarios initially passed 3/3 (1.92s): lifecycle, holdings math, bounded research, owner isolation, missing/zero quotes, credentials. React Company Context is integrated independently from quote/history/Notes/Evidence readers, with current view/original decisions/later reviews. The earlier source checkpoint recorded Partner Notes as pending; ticket 38 has since been accepted with authorized partner Notes projection and owner/private-field isolation evidence, so that historical statement is superseded.

Ticket remains in progress while root/Astra performs the final acceptance review below.

## Browser checkpoint

Historical browser checkpoint: `tests/e2e/company-hub.spec.ts` had 2 passed (8.6s), then the DB relation-precedence scenario passed with the suite, 3/3 (2.64s). The first browser attempt used a wrong table label; the test was corrected to the existing Cost holdings label. Typecheck and lint passed.

## Current acceptance evidence (2026-09-06)

`PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/e2e/company-hub.spec.ts` passed 3/3 (14.3s) before the final capture-only fixture refinement: desktop and mobile holdings → Company → Diary/Thesis flows navigate the later-review row to its real `#review-*` anchor, and the desktop reader fixture independently fails and retries Notes and Evidence while quote, Company Hub and the other reader remain readable. The existing three-locale and logout assertions remain in the desktop/mobile cases. The latest capture-only rerun, `--grep "Company Hub connects"`, passed 2/2 (15.7s) after waiting for all sections and constraining the synthetic market history response to five rows.

The desktop/mobile cases now persist full-route captures at `docs/design/evidence/company-hub/1440.png` (1440×3906) and `390.png` (390×5313), covering quote/history, Company Hub, Notes and Evidence. No production defect was reproduced and no production files changed. Root/Astra inspected this evidence and approved the ticket.

## Final acceptance (2026-09-06)

Root/Astra inspected the original-detail desktop/mobile pair and accepted the current-view/original-decision/review hierarchy, complete quote/Notes/Evidence route, and mobile wrapping without page overflow. Combined evidence: the full focused suite passed 3/3 (14.3s), the final capture rerun passed 2/2 (15.7s), the existing 3 API scenarios passed, and ticket 38 partner Notes evidence remains accepted. Ticket 29 is complete.

Production build passed (TypeScript, Web client/SSR, API bundle), before the final explanatory-copy-only clarification. No deployment performed.
