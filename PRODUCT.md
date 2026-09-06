# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

The user has specified React Web, PostgreSQL, and Drizzle, and confirmed keeping the Docker/K3s deployment.
A future app is expected to use React Native; no app is being built at this stage.
A TypeScript monorepo with a React Router web app, a Hono API, and shared contracts/client is underway.

## Users

The investment-diary users already served by the existing diary-vue product.
Based on the existing code and product docs, the main scenarios are quick capture during trading hours, tracking investment theses, organizing trades and holdings, and after-hours and periodic reviews.
User tenure and the external brand name have not been redefined; the mutually inconsistent tenure descriptions in the old docs are not carried over.

## Product Purpose

A complete rebuild of diary-vue that preserves every currently valid product feature and business behavior.
Diaries, trades, investment theses, research evidence, reminders, and reviews together form a reviewable record of investment decisions.
Feature scope is grounded in the source code, API contracts, and acceptance cases — not in page counts or historical planning docs.

## Operating Context

- The web app must support desktop and mobile browsers.
- Existing capabilities include diaries, Timeline, Calendar, Reviews, Trade Plans, Portfolio, Company Hub, Watchlists, research tools, partner sharing, Agent API, public articles, and an admin console.
- Keep the existing trilingual support (zh-TW/zh-CN/en), light and dark themes, timezone settings, PWA, and SEO for public content.
- These capabilities were inventoried from the diary-vue code and product docs; the complete item-by-item acceptance matrix is built in Phase 0 of the plan.

## Capabilities and Constraints

- Feature parity with diary-vue is complete; the UI/UX is redesigned by Impeccable.
- No user data is migrated from the old system; the new system initializes from an empty PostgreSQL database.
- The new system still needs versioned schema migrations, required system seed data, and backup restore.
- App readiness this phase covers the shared API, reusable business logic, and native sign-in and renewal.
- The user has confirmed: push notifications and offline writes are deferred to the React Native phase.
- The user has authorized parallel implementation against the local tickets and explicitly asked that old bugs and tech debt be fixed along the way; preserve feature intent, do not reproduce the defects.

## Brand Commitments

The user explicitly allows replacing the existing UI/UX and has not specified any colors, typography, or visual system to carry over.
diary-v3 is the current project name; the external product name is still TBD.

## Evidence on Hand

- Source: `/Users/klam/Desktop/project/diary-vue`.
- Product and domain docs: the source project's PRODUCT.md, CONTEXT.md, docs/WORKFLOWS.md.
- Implementation: pages, server/api, lib, prisma/schema.prisma, tests.
- App contract: docs/backend-readiness.md, lib/contracts, lib/api-client, openapi/openapi.json.
- Existing UI evidence: layouts/default.vue, pages/timeline/index.vue, assets/css/design-tokens.css.
- At the 2026-09-05 inventory the source worktree had uncommitted changes, so HEAD alone does not represent the feature baseline.

## Product Principles

1. Feature parity must be proven by behavior and tests.
2. Quick capture stays low-friction, while reading, management, and review each get a clear entry point.
3. Trade results, timezones, and sharing permissions stay consistent.
4. The API is the shared business entry point for web and the future app.
5. Reusable logic stays independent of Vue, React DOM, and native platforms.

## Tools access model

Tools are public product capabilities, not membership features. Guests can open the Tools index and the confirmed tool URLs, complete calculations, query and filter public research, view charts and filing details, copy results, export results, and download bounded SEC documents or ZIP packages without authentication. The same tool implementations are available to signed-in users from the workspace.

Authentication is required only for private additions: saving or appending a Diary, creating a Trade Plan, adding a Watchlist item, saving research evidence or notes, creating reminders, reading personal holdings or settings, and all administration. Guest attempts show an explicit sign-in prompt, preserve the current tool state, use a safe in-site return path, and require confirmation after sign-in before any private write.

## Accessibility & Inclusion

The existing product docs take WCAG AA, keyboard operation, screen readers, and reduced motion as the baseline.
The redesign plan keeps these capabilities and accepts trilingual content, long content, and mobile use.
