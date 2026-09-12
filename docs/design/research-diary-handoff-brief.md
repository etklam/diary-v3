# Research to Diary context handoff

Status: implementation direction approved by Astra, 2026-09-12.
Mode: Operate. Product: Trade basic.
Verified local and remote baseline: `2293369a7bf30795c6e94f81ef5219c199a830cd`.

## Ownership and scope

The user assigns behavior, persistence, validation and tests to Luna. UI presentation is implemented through Claude Code using the configured `sonnet` alias, which maps to `glm-5.3-flash[1M]`. Astra owns scope, integration, visual direction and final acceptance; Sol reviews targeted integrity and security risks.

Add a company-to-existing-editor handoff. Preserve Company research, Quick Diary, Full Diary, public market access, and existing create/append semantics. No sidebar, Overview, public navigation, database schema, market-provider or editor replacement changes.

## Interaction direction

- Put Record a thought near the company heading, before the market lookup. It links directly to contextual Quick Diary. A quiet Write a full diary link sits alongside. These remain available despite a failed/stale quote. Unsupported Diary symbols show a short explanation without rewriting the symbol or manufacturing a destination.
- The editor shows one low-emphasis context line below its heading and above the form. It names the research source, while the existing editable symbols field remains authoritative. Context does not create content, a trade, a recommendation, or any persisted record.
- Keep the existing Restore / Discard prompt. Restore preserves all draft values and source context, and states when the incoming company seed was ignored. Discard starts the current incoming context. No modal mode picker, multi-draft browser, automatic replacement, or Quick/Full content transfer.
- After confirmed save, open the existing Diary detail. Add a secondary Return to SYMBOL research link built from the validated source context. Show it only when source context exists. It describes origin, not the final saved symbol associations.
- Failed or uncertain writes keep the editor and draft. Authentication returns to a canonical contextual editor and never writes automatically. Same-route query changes preserve unsaved work through the existing navigation guard or explicit replacement behavior.

## Visual direction

Use DESIGN.md's current system type, neutral canvas and surface tokens, blue action tokens, existing control radii and focus treatment. Preserve financial colors and light/dark/system modes. Do not change the surrounding company information hierarchy.

Actions use existing button/link primitives. Keep at least 44px primary touch targets, 12px gaps inside action groups, and 16–24px separation from surrounding content. On narrow screens actions wrap without horizontal overflow. Context copy uses secondary body text, with no card, icon badge, colored rail, banner background, animation, or oversized heading. Existing writing controls remain the main visual focus. All new copy supports en, zh-TW and zh-CN.

## Data and lifecycle contract

One typed parser/builder accepts only the explicit company source, a Diary-valid normalized company symbol, and the existing allowed calendar-date query. Company symbols first use the existing Market canonicalization and then the existing Diary association schema. Thus `BTC-USD` and `BRK.B` remain supported, while `SPX` canonicalizes to unsupported `^GSPC` and receives an explanation instead of a substituted target. Ordinary manually entered Diary associations retain their current validation. Duplicate keys, excessive lengths, malformed encoding, unknown source and unsafe return destinations have explicit rejection behavior. Auth handling checks the raw allowed pathname before URL normalization. The return company path is built from validated source, never an arbitrary URL. Draft-authored state wins over incoming defaults; old valid drafts remain readable when optional context is invalid.

The account timezone sets the default date; valid Quick date query retains its precedence. Automatic session expiry preserves a bounded account-specific Quick draft. Explicit or cross-tab sign-out clears private drafts and prevents later writeback. The final saved Diary is verified through server reads. Append retains the original ID, title, body, symbols, transactions, reminders and review, adding new content once and enforcing the existing symbol limit.

## Evidence

Run fresh affected baseline tests before changing behavior, then unit, integration, browser and built-artifact acceptance. Cover guest login/registration, account boundaries, draft precedence, URL safety, initialization and explicit save safety. Use synthetic accounts, disposable PostgreSQL and fixture market data only.

Capture Company actions, contextual Quick Diary, draft conflict, and saved return link at 1440px plus a representative 390px/dark set. Inspect the desktop/mobile batch once, correct material defects together, and confirm at most once. No production deployment or Forgejo-runner result is implied by local acceptance.
