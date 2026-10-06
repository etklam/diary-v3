# [01] Create and manage Guru profiles

Status: ready-for-agent
Execution: done
Type: AFK

## Parent

[Guru Portfolio PRD](../PRD.md)

## What to build

Create the first vertical slice for manager identity: PostgreSQL/Drizzle records, server-side Admin operations, and the Admin Guru list/detail forms for creating and maintaining a Guru profile and its institutional manager/CIK identity.

## Acceptance criteria

- [x] Guru slug and manager CIK have explicit uniqueness and validation rules; IDs and timestamps follow repository contracts.
- [x] Editorial fields (description, philosophy, style tags, manager type, website, country, image, featured, active) are stored separately from SEC-derived identity and filing data.
- [x] Admin can create, edit, feature, activate/deactivate, and inspect a Guru; server authorization protects every mutation.
- [x] API contracts distinguish user-visible profile fields from SEC manager identity and return stable validation errors.
- [x] The admin list supports search and active/featured filters; forms cover loading, empty, validation, and failure states in desktop and mobile layouts.
- [x] Disposable PostgreSQL and browser evidence cover create/edit, uniqueness conflicts, validation, and authorization.

## Notes

Do not add public directory behavior or SEC ingestion in this slice. Keep public query design compatible with ticket 06.

## Design intent

Operate mode. Use a searchable list that opens a dedicated Guru detail route; create from the list in an accessible form dialog. Keep editorial fields and SEC manager identity in separate labeled sections. Inherit existing Admin spacing, tables, fields, and calm research-desk typography from DESIGN.md; no new color or component system. The route has no prior visual state, so acceptance records the new desktop/mobile captures without inventing a before capture.

## Acceptance evidence

Verified 2026-10-06 using synthetic records and a disposable PostgreSQL database.

- `tests/integration/admin-gurus-http.test.ts`: 4/4 passed, covering create/update, canonical CIK, search and filters, validation, ADMIN authorization, CSRF, fresh role checks, slug/CIK uniqueness, concurrent duplicate requests, transaction rollback, and database constraints.
- `tests/e2e/admin-gurus.spec.ts`: 2/2 passed, covering client validation, create/edit, active/featured filtering, desktop/mobile layouts, and ordinary-user denial. Browser records are synthetic.
- Navigation and return-path unit coverage: 61/61 passed across `tests/unit/navigation.test.ts`, `tests/unit/activity-timeline.test.ts`, and `tests/unit/return-paths.test.ts`.
- `npm run typecheck`, `npm run contracts:check`, scoped ESLint, and `git diff --check` passed.
- Impeccable design detector returned no findings for the new list, detail, form, and CSS files.
- New-screen captures: `docs/design/evidence/admin-gurus/1440.png`, `390.png`, `390-result.png`, `detail-1440.png`, `detail-390.png`, `create-1440.png`, and `create-390.png`.

The list follows the existing Admin table and field language. Create preserves list context in a focus-managed dialog; edits use a dedicated detail route. Editorial profile fields and the SEC CIK live in separate labeled form sections. There is no before image because this route did not exist.

The initial registry maps one Guru profile to each unique manager CIK. This slice allows CIK correction before filings are linked; an ingestion slice must define the correction workflow once filing history references the identity.
