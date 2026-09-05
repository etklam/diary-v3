# [53] 發布公開首頁、About 與使用說明

Status: done
Type: AFK
User stories covered: US-090

## Parent

[完整重構 PRD](../PRD.md)

## What to build

依已確認設計語言建立三個公開入口，準確介紹產品用途並完成註冊及說明頁導覽；文章／工具入口隨對應功能交付接入。

## Acceptance criteria

- [x] 使用已確認產品事實及標示清楚的示例，不增加無依據宣稱。
- [x] SSR metadata、公開路由、三語、主題、keyboard 及桌面／手機驗收通過。
- [x] 本票的公開資訊、註冊及說明導覽可獨立示範；不展示尚未實作功能的死連結，文章／工具票交付時負責補上其對應入口。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [03 design-shell](03-design-shell.md)

## Implementation evidence (awaiting Astra/root acceptance)

- Added guest routes `/about` and `/guide`, and replaced the guest home with a semantic decision narrative: labelled synthetic thesis, dated observation, later review, three record/connect/review steps and registration actions.
- Added route metadata for all three public surfaces. The copy is present in `en`, `zh-TW` and `zh-CN`; public navigation keeps the existing locale/theme controls and does not expose the private sidebar to guests. Authenticated `/` still renders the existing Overview component.
- Guide links point to delivered diary, research, review, preferences, login and registration routes; no placeholder product capability is linked.
- `npm run typecheck` passed after the route and shell changes. Astra/root still owns the final desktop/mobile/keyboard visual acceptance; this record does not claim that review was run here.
- The controlled admin-users Chrome flow also captured the guest home before authentication at 1440px and 390px in `docs/design/evidence/public-pages/1440.png` and `390.png`; these are evidence for the pending parent/Astra review and do not change this ticket's status.

## Astra acceptance — 2026-09-06

Accepted source review of factual, explicitly synthetic three-locale public content, real Chrome guest /, /about and /guide responses from ticket58, and Astra inspection of the first desktop/mobile public-home captures under docs/design/evidence/public-pages. Signed-in routing retains Overview. Simple copy/layout details were not given an extra test cycle.
