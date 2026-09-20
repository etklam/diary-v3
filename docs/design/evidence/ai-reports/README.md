# Manual AI reports UI evidence

All screenshots use disposable PostgreSQL, synthetic accounts and the controlled AI transport in `scripts/e2e-server.ts`. No diary data or generation request is sent to an external provider during these tests.

The UI was implemented through the requested Claude Code Sonnet alias, configured as `glm-5.3-flash[1M]`, using the approved existing-product design brief. That development-tool boundary is separate from product report generation.

## Reproduce

```sh
npx playwright test tests/e2e/ai-reports-worker.spec.ts
```

- `desktop-en.png`: weekly report, consent, deterministic coverage, report history, immutable metadata, analysis and source navigation at 1440 px.
- `mobile-zh-tw-dark.png`: the same report at 390 px in the Traditional Chinese dark interface; stored analysis retains its generation language.
- `admin-desktop-en.png`: provider configuration, write-only key actions, prompt revisions, user access and monetary usage at 1440 px.
- `admin-mobile-zh-tw-dark.png`: management forms at 390 px with horizontally contained data tables.

The browser suite also checks Simplified Chinese, no automatic generation, ambiguous-response idempotency, locale/preview races, monthly generation, consent withdrawal, owner deletion, active-job cleanup, new-recipient consent, delayed audit pagination and session cleanup. Synthetic responses establish behavior and layout, not live model quality.
