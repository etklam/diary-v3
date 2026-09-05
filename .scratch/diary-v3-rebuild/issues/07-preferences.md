# [07] 儲存語言、時區與投資偏好

Status: done
Type: AFK
User stories covered: US-006, US-007, US-008

## Parent

[完整重構 PRD](../PRD.md)

## What to build

讓使用者在設定頁儲存三語、時區及現有投資偏好，重新登入後仍得到相同設定與日期／數字呈現。

## Acceptance criteria

- [x] 既有設定欄位經驗證、持久化及 API 往返，未知或非法值依契約處理。
- [x] 三語及設定保存流程可操作；Calendar Date 與真實時間的格式責任清楚，時區不被瀏覽器默默覆蓋。
- [x] 驗證 owner、重新登入、多時區／DST 及數值字串；後續消費設定的功能延伸相同共用規則。

適用共同要求：[切片共同規則](../ISSUE-BREAKDOWN.md#所有切片共同遵循)。

## Blocked by

- [04 web-session](04-web-session.md)

## Verification

- GET/PUT settings now persist account locale, explicit timezone, holiday exclusion and investment preferences. Migration 0001 adds locale/holiday fields; empty names clear and zero trades remains zero.
- 3 HTTP/PostgreSQL tests pass for relogin persistence, owner/CSRF/native access, exact decimal strings and rejected updates. Four domain tests cover normalization, numeric bounds and DST/calendar date boundaries.
- `tests/e2e/settings.spec.ts`: 4/4 real Chrome/PostgreSQL scenarios passed: relogin persistence, exact decimal/zero/blank name, explicit device timezone before save, rejected timezone with preserved form, delayed locale save after logout.
- Independent primary-agent visual review opened both final desktop/mobile captures in `docs/design/evidence/settings/`: accepted labels, hierarchy and narrow layout. Targeted ESLint/typecheck pass; root integration checkpoint has 89 passing tests.
- [Recorded corrections](../../../docs/adr/0005-account-security-and-preferences.md).
