# Complete workspace navigation — Astra direction

2026-09-06. Mode: Operate. Implement alongside the installed/mobile shell in ticket 58, before final cross-device acceptance. This extends the initial shell direction as the real module count grows; it does not change authorization or remove routes.

The current mobile shell wraps twenty navigation links and account preferences above the page title, using more than a screen of vertical space. The completed workspace must reveal the current task promptly while keeping every implemented destination reachable.

Below 760px, keep a compact header with brand, the existing Quick Diary action and a clearly labelled Menu control. Place the complete navigation and account preferences in a native modal dialog opened by Menu. Group existing links under Daily work, Portfolio and research, Tools, and Account; administrators additionally see their permitted management links. Preserve route URLs, active-page semantics and logout behavior. The dialog uses the existing full-height mobile dialog treatment, scrolls inside itself, and has a visible Close action. Opening moves focus to its heading or close control; Escape/backdrop behavior follows the existing dialog convention, closing restores Menu focus, and navigation closes the dialog before the route's normal main focus transition.

Desktop keeps the established 216px sidebar, adding the same concise group labels and consistent 8px gaps between links/24px between groups. Keep preferences and logout reachable in its scroll area. Do not add duplicate active tabs or introduce a second navigation system for individual tools. At intermediate widths preserve the existing readable sidebar until the mobile breakpoint unless evidence requires the already-planned collapse earlier.

Use current semantic colors, system type, 44px targets and visible focus; no new icons, animations or palette. Long translations wrap within the dialog. Page content remains accessible with 200% zoom and safe-area padding. Quick Diary remains an action, not a selected navigation tab. Guest/public-page links and role-based administration must follow actual session state; the menu is not an authorization boundary.

The only installed-app visual additions are the existing PWA ticket's install/update prompts in a quiet status area, with explicit later/update actions and preserved unsaved work. Do not place private account data into offline caches or add background sync.

Update browser navigation helpers to open Menu at mobile widths only when needed; do not weaken route, accessibility or localization assertions merely because links are now inside a dialog. Demonstrate keyboard open/close/focus return, navigation to a lower group, language/theme changes, sign-out and a long translated menu on mobile; retain desktop navigation evidence. Astra reviews both device classes as one final shell batch. Existing feature-local visual acceptance remains valid; this is the shared navigation completion pass.
