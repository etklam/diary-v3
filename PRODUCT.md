# Product

<!-- impeccable:product-schema 1 -->

Current product record, reviewed against repository source on 2026-09-27. Use the [documentation index](docs/README.md) to distinguish current guides, accepted decisions, and dated acceptance evidence.

## Platform

web

## Stack

A TypeScript npm-workspace monorepo with React Router Web SSR, a Hono API, PostgreSQL, Drizzle, shared runtime contracts, and a standard-fetch client. Docker/K3s deployment and restore tooling are implemented. See the [architecture](docs/architecture.md) for runtime boundaries.

A separate Expo/React Native proof consumes the shared packages and demonstrates native authentication and API access. It is not a released mobile product; device delivery, push notifications, and offline writes remain outside the delivered Web scope.

## Users

Investment-diary users who capture decisions during trading hours, track investment theses, organize trades and holdings, and review outcomes after hours or periodically. The product rebuild preserves valid workflows from the frozen diary-vue baseline. Unverified tenure claims from older marketing documents are not carried forward.

## Product Purpose

Diaries, trades, investment theses, research evidence, reminders, and reviews form a reviewable record of investment decisions. Behavioral contracts and acceptance evidence define feature coverage; page counts alone do not.

The rebuild preserves valid feature intent while correcting documented legacy bugs and technical debt. [ADR-0001](docs/adr/0001-parity-baseline-and-contract-corrections.md) establishes that policy. Later approved capabilities have their own feature records and decisions; they do not silently alter the immutable parent PRD.

## Operating Context

- Desktop and mobile browsers share a responsive Web app with zh-TW, zh-CN, and English interface copy, light/dark/system themes, and user timezone settings.
- The private workspace includes Diary library, Quick Diary, Timeline, Calendar, Review queue, Trade Plans, Portfolio, Company Hub, Watchlists, reminders, Trading principles, partner sharing, personal achievements and goals, and scoped Agent API access.
- Public surfaces include the home page, guide, About, tools, and article discovery/reading. Public article content supports SSR and SEO; protected content is authorized by the API.
- Administration covers articles, users, ETF definitions, AI configuration, Research Studio, and optional account email.
- PWA support covers installation and updates. Private API responses and navigations are not an offline personal-data store.

## Capabilities and Constraints

- The original core rebuild has local feature-parity acceptance against the [frozen baseline](docs/parity/README.md). The [2026-09-25 acceptance](docs/features/all-tickets-acceptance-2026-09-25.md) and [2026-09-27 audit](docs/audits/project-cleanup-2026-09-27.md) document later scope and verification limits. Neither is blanket production readiness approval.
- No legacy user data migration is part of the rebuild. Versioned migrations initialize an empty PostgreSQL database; static system seed and disposable backup/restore drills are implemented.
- Ownership, partner-sharing allowlists, date semantics, decimal precision, and transaction integrity remain server responsibilities.
- App readiness covers shared contracts, reusable rules, native sessions, package consumption, and the isolated proof. A production React Native app, push delivery, and offline writes remain deferred.
- One active API process owns in-process scheduling and realtime. Optional Redis shares rate-limit counters; it does not make the scheduler safe for multiple API replicas.
- Production cutover requires its own operational execution and evidence. Hosted CI still contains advisory gates, as recorded in the [CI/CD notes](docs/operations/ci-cd-notes.md).

## Brand Commitments

The external product name is **Trade basic**, with that exact casing and spacing. `diary-v3` remains the repository and infrastructure name. The current visual system is recorded in [DESIGN.md](DESIGN.md); the original legacy UI is not a visual constraint.

## Evidence on Hand

- [Frozen source manifest, archive, and inventory](docs/parity/README.md): the sanitized source at the recorded freeze, including legacy product/domain docs, implementation, migrations, contracts, and tests.
- [Core release checkpoint](docs/parity/final-release-report.md): dated original rebuild acceptance.
- [All-ticket acceptance](docs/features/all-tickets-acceptance-2026-09-25.md): subsequent local ticket execution and external release blockers.
- [Cleanup, performance, and security audit](docs/audits/project-cleanup-2026-09-27.md): later source and verification checkpoint with measured limits.
- [Design evidence](docs/design/): dated briefs, reviews, and captures; the current built rules live in DESIGN.md.

Ordinary parity work uses the recorded archive, not a mutable checkout of diary-vue. The original dirty planning scan and the later clean frozen commit are distinguished in the baseline record.

## Product Principles

1. Prove feature coverage through behavior and tests.
2. Keep capture low-friction and give reading, management, and review clear entries.
3. Preserve consistent financial results, timezone handling, and sharing permissions.
4. Keep the API authoritative for Web and native consumers.
5. Keep reusable rules independent of browser, server, and native frameworks.

## Personal Achievements and Goals

Users manually record private milestones with a calendar date and text, then browse, edit, or delete them. Multiple achievements can share a date; the list runs newest first. Reaching a chosen account value is a user-written milestone, not an automatically detected balance event.

Goals are the forward-looking half of the same page: free text such as "reach 15% YTD this year" or "reach USD 1,000,000", with an optional target date — a goal may be open-ended. A goal is either in progress or achieved; overdue is derived from the target date at read time rather than stored, so a goal ages into it without any scheduled job. Goals carry no progress figure: portfolio valuation covers only priced holdings and reports no YTD return, so any computed progress would misstate the account. Marking a goal achieved records the achievement date and prefills the achievement form with the goal's wording; the user confirms and saves it, so nothing is written to the achievement record automatically.

Achievements and goals belong exclusively to the signed-in user and are not exposed through partner sharing.

## Tools Access Model

Tools are public capabilities. Guests can calculate, query and filter public research, view charts and filing details, copy/export results, and download bounded SEC documents or ZIP packages. Signed-in users use the same tool implementations in the workspace.

Private additions require authentication: saving or appending a Diary, creating a Trade Plan, adding a Watchlist item, saving evidence or notes, creating reminders, and reading personal holdings or settings. Guest flows preserve tool state, validate in-site return destinations, and require confirmation after sign-in before a private write. See the [access matrix](docs/tools-access-matrix.md).

## Article Access Model

Published articles have two reading levels: Public and Members only. A member is an existing valid authenticated user; there is no paid membership entity. Public discovery may expose an explicitly authored public teaser and metadata, while Member bodies require server authorization. Unpublished content is restricted to Admin editor previews. New articles default to Draft and Members only.

[Article translations](docs/article-translations.md) are optional translated derivatives with their own status, cost, and access rules. Payment, billing, subscriptions, and paid entitlements remain outside scope.

## AI and Research

[AI Reports V1](docs/features/ai-reports-v1.md) supports manually requested reports with access grants, quotas, reviewable snapshots, and independent worker execution. Local implementation does not satisfy its live-provider, quality, disclosure, and operational beta gates.

[Research Studio](docs/features/research-studio.md) is an Admin research workflow based on a versioned method and deterministic calculator. Offline evidence and calculator acceptance are recorded; source-use rights, live retrieval, budgeted provider acceptance, and full-report publication remain separately gated. Synthetic evidence is not live-source approval.

## Account Operations

Optional [account email](docs/runbooks/account-email.md) supports the documented verification/recovery flows through an encrypted, allowlisted SMTP configuration and a separate worker. Optional [Redis rate limiting](docs/runbooks/rate-limiting.md) shares abuse counters. Both require explicit environment configuration; neither is required for the basic local Web/API setup.

## Accessibility & Inclusion

WCAG AA, keyboard access, screen-reader semantics, reduced motion, long content, and mobile use are design and verification targets. Dated browser and visual reviews identify their tested scope; they are not comprehensive assistive-technology certification.
