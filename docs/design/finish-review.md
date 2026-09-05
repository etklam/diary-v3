# Ticket 03 independent finish review

**Final verdict: ship the ticket-03 representative design scope. All three material review findings are resolved; the remaining finish task is documenting the built system and linking this evidence.**

Method: fresh independent reviewer fallback. This harness does not expose the shipped Impeccable finish-reviewer role. This is the bounded finish handoff requested by the root agent, not a full `$impeccable critique` run. I read the skill and implementation brief, reviewed the current React/CSS sources, and opened all four supplied screenshots. I did not start another browser loop or alter product code. Root retains the final confirmation round and detector evidence.

## Final confirmation (round 2)

The root agent supplied the final bounded evidence and passing test results. I opened all 12 images in `docs/design/evidence/round-2/`, reread only the code related to the existing findings, and reviewed the relevant Playwright assertions. I did not run a browser, rerun tests, or start a new design/defect hunt. The two-round visual budget is now exhausted.

| Existing material finding | Final status | Evidence |
| --- | --- | --- |
| Current route and route-transition focus | **Resolved** | `root.tsx` now uses `NavLink`, focuses `main` on pathname changes, and CSS renders the selected state. The editor-error images show the active Diary entry. `design.spec.ts` asserts `aria-current=page` and main focus. |
| Actionable API errors and associated feedback | **Resolved** | `api-error.tsx` maps credential, validation, duplicate, missing and server-error codes to three-language messages; retains requestId; focuses the error summary. Auth/editor fields use `aria-invalid` and `aria-describedby`. The [desktop](evidence/round-2/editor-error-1440.png) and [mobile](evidence/round-2/editor-error-390.png) images show preserved inputs, marked content field, readable message and requestId. Diary reads no longer label every HTTP failure as not-found. Root reports the error fixture and recovery/preservation assertions passing. |
| Saved appearance before first paint | **Resolved** | `Layout` places a guarded stored-theme bootstrap in the head before rendered styles/content; the provider avoids its earlier initial write while not ready. The settled reload test asserts saved dark preference and `data-theme=dark`. The first-paint correction is established from script ordering/source, not a claimed screenshot timing measurement. |

The new samples fill the earlier representation gap:

- Company: [desktop](evidence/round-2/company-1440.png), [mobile](evidence/round-2/company-390.png). Current view and later evidence remain distinct; missing quote is explicit; the synthetic label remains visible.
- Review: [desktop](evidence/round-2/review-1440.png), [mobile](evidence/round-2/review-390.png). Original reasoning precedes later reflection in the narrow layout; dates and source context remain readable.
- Quick Diary: [desktop](evidence/round-2/quick-1440.png), [mobile](evidence/round-2/quick-390.png). Real form inside native dialog, focused content input, visible close/save actions. Root reports real create → read, Escape and trigger-focus return assertions passing. The mobile full-page screenshot includes document content below the 844px dialog viewport; that image extension is not a claim that the modal exposes interactive background content in the actual viewport.
- Real Diary: [desktop](evidence/round-2/diary-1440.png), [mobile](evidence/round-2/diary-390.png). Reading hierarchy remains intact after the corrections.
- Overview: [desktop](evidence/round-2/design-1440.png), [mobile](evidence/round-2/design-390.png). The attention-first composition remains intact and the representative wide table stays inside its named, keyboard-focusable horizontal scroll region.

Root reports `first-diary.spec.ts` desktop/mobile and `design.spec.ts` passing. The latter exercises three locales at 1440/390/320px, keyboard sample selection, current language, no document overflow, saved-theme reload and main route focus. This establishes the declared representative test scope. It is not a blanket WCAG certification, a separately measured native browser 200% zoom result, or proof of every future business state. The existing loading/error paths and preview empty-state toggle are present; any broader full-feature state validation remains with each feature's own acceptance tests.

The provided [detector result](detector.json) is `[]` from the root's single static TSX/CSS scan. It is accepted as static detector evidence only, not automatic runtime contrast or assistive-technology certification.

**Shipping scope:** the current real registration/login/first-Diary flow and API-connected Quick Diary representative dialog, the two-route responsive shell, theme/locale controls, translated error treatment, and explicitly synthetic Overview/Company/Review samples. This verdict does not mark complete Company research, Review queue/editing, global Quick Diary shortcuts/templates/append, Markdown editing/rendering, or the future expanded navigation.

**Documentation handoff only:** write the actual `DESIGN.md` from current CSS/components, record the compact two-route shell adaptation and the sample-versus-real scope, link both evidence rounds, the passing test scope, detector result and this final verdict. Preserve the implementation brief as design intent rather than relabeling every future interaction as shipped. The earlier emitted-comment protocol observation is a workflow documentation limitation, not an instruction to start a third product-polish round.

## Round-1 findings (historical; dispositions above supersede their open status)

## Evidence inspected

| Artifact | Observed state | Finding |
| --- | --- | --- |
| [diary desktop](evidence/round-1/diary-1440.png) | 1440px, English, light, saved real Diary | Readable 72ch content, clear date/title/body hierarchy, no visible clipping. |
| [diary mobile](evidence/round-1/diary-390.png) | 390px, English, dark, saved real Diary | Title wraps naturally; body remains readable; controls have usable size; no visible horizontal overflow. |
| [overview desktop](evidence/round-1/design-1440.png) | 1440px, English, light, Overview sample | Synthetic notice is prominent; agenda and research-context columns communicate the intended workflow. |
| [overview mobile](evidence/round-1/design-390.png) | 390px, English, dark, Overview sample | Logical single-column order; missing quote is explicit and never shown as zero. |

Reviewed sources: `apps/web/app/root.tsx`, `ui.tsx`, `styles.css`, `auth-form.tsx`, `routes/new.tsx`, `routes/diary.tsx`, `routes/preview.tsx`, and `tests/e2e/first-diary.spec.ts`.

The cool green surfaces, restrained typography, flat separators and attention-first Overview translate the “decision agenda” direction coherently. The reading surface is appropriately quieter than the workspace. There is no reason to restart palette, typography or composition. The minimal current navigation correctly avoids promising unimplemented modules. The sample notice prevents fictional research from being confused with account data.

## One correction batch

### 1. Mark the current route and establish route-transition focus

`root.tsx` renders both primary navigation entries as plain `Link`s without `aria-current`; the CSS has hover styling but no selected-route state. The brief explicitly requires current-page semantics. Use `NavLink`/equivalent matching and a restrained selected state for the real routes that currently exist. Diary detail can identify the Diary navigation family once that family exists; do not invent dead navigation now.

No source establishes focus after a client-side route change. In particular, saving removes the focused submit button and renders a reading page, while `<main tabIndex={-1}>` is only a passive skip-link target. Give route transitions a predictable main/heading focus target and preserve visible keyboard focus. Test keyboard-only login → editor → save → read, plus the skip link, rather than relying on mouse-based Playwright steps.

### 2. Preserve actionable API error distinctions and associate validation feedback

`AuthForm.submit` and `NewDiary.submit` discard the structured API error and show the same generic sentence for invalid credentials, duplicate email/date, validation and server failure. `DiaryPage.load` labels every non-200 HTTP response as unavailable/not-found, including a transient 500. `ErrorMessage` is an alert but has no stable ID or field association.

Map the existing error codes to concise translated messages; preserve unknown/server errors as retryable, and distinguish authentication from 404. Associate returned validation errors with relevant fields through `aria-invalid`/`aria-describedby`; focus a concise error summary or first invalid field. Retain form values (the current uncontrolled fields already do this). For a duplicate date, tell the user that a Diary already exists for that date; the later append/open flow belongs to ticket 09. Include the returned requestId in an accessible error detail that can be copied without exposing raw server text.

A minimal meaningful check should force one duplicate-date response and one temporary read failure, verify different messages, verify the input remains present, and verify keyboard focus reaches the recovery control. This is an existing-state correction, not a request for new product features.

### 3. Apply stored appearance before the first paint

`UiProvider` initializes to `system` and reads localStorage only in a post-mount effect; `Layout` emits no early preference initialization. A saved dark preference on a light operating system initially renders the light palette before the effect changes it (and conversely for saved light on dark). The brief explicitly calls for avoiding initial theme flash. Read the stored theme before first paint through a small safe bootstrap or an SSR-readable preference, while retaining system fallback and disabled-storage handling. Do not hide the whole product behind an indefinite loading screen.

The locale similarly begins as zh-TW before local preferences load; verify reload behavior and ensure `html.lang` and the visible content agree after preference resolution. The current screenshots only prove settled English output, not initialization.

## Required ticket-03 evidence still missing

These are completion conditions, not claims that the unseen states are broken. Capture/check them together in the remaining confirmation round after the correction batch:

- **Quick Diary representative interaction:** the ticket explicitly asks for an Overview, Quick Diary and Company/Review sample. Current `/diaries/new` is a full-page form; `preview.tsx` offers only Overview, Company and Review. Add a clearly labeled representative Quick Diary dialog/sheet with focus entry, Escape, focus containment and focus return. It may remain a synthetic interaction preview; complete templates/append behavior belongs to ticket 09. The already-real full editor can continue satisfying the ticket's API-connected sample requirement.
- **Company and Review states:** source contains separate current view/evidence and original reasoning/later reflection, but supplied screenshots only show Overview. Inspect those existing modes on desktop and mobile, keeping synthetic status visible. Do not claim the underlying research or review features are complete.
- **Three languages and reflow:** current E2E selects English only. Check zh-TW, zh-CN and English, 320px and effective 200% reflow, long title/content and a wide-table sample. Check both themes where the changed controls appear. One matrix of targeted states is sufficient; no repeated aesthetic scans.
- **Empty/loading/error states:** existing code has loading and auth-error branches, but screenshots only show successful populated content. Exercise a real empty/new entry, delayed request, failed request with recovery, and missing-quote sample. For the preview, a concise explicit empty state is enough; do not build future business APIs solely for screenshot coverage.
- **Finish protocol:** preserve the detector command/result and its false-positive decisions, the final confirmation results and the actual built design record. `DESIGN.md` should be documented from the corrected implementation by the separate documenter handoff. The written brief remains intent until these are linked. I did not find the brief's seed/first-viewport contract in the emitted-layout source; verify the Impeccable build-surviving contract requirement as part of that protocol rather than treating the brief alone as rendered evidence.

## Scope decisions to record rather than redesign

The implementation currently keeps a compact top header on mobile and a 180px sidebar at intermediate widths; the brief proposed a mobile bottom navigation and collapsed tablet menu. For the two real routes available today, the simpler shell is usable in the inspected images and need not gain a mostly empty navigation system. Record this deliberate current-scope adaptation in the built design record. Revisit the navigation layout when additional real modules ship, rather than presenting the brief's full navigation as already implemented.

The Review sample currently illustrates original-versus-later reasoning, not the full queue and editing workflow. That is acceptable as a sample if the record states the limitation. Likewise, plain Diary text rendering is this first slice's behavior; rich Markdown functionality remains its owning later ticket and must not be claimed from the current screenshot.

## Round-1 handoff (completed)

The correction batch and final bounded confirmation are complete. Use the final verdict and documentation-only handoff above; do not start another visual loop from these historical findings.
