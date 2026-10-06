# Guru Portfolio implementation plan

The parent specification is [PRD.md](PRD.md). Keep execution status separate from triage status. No ticket is done until its acceptance criteria have runnable evidence.

| Ticket | Slice | Triage | Execution | Depends on |
| --- | --- | --- | --- | --- |
| [01](issues/01-guru-registry.md) | Guru and manager registry | ready-for-agent | done | — |
| [02](issues/02-13f-ingestion.md) | SEC 13F discovery, preservation, and parsing | ready-for-agent | done | 01 |
| [03](issues/03-securities-mapping.md) | Securities master, mapping, and corporate-action identity | ready-for-agent | done | 02 |
| [04](issues/04-effective-snapshots.md) | Amendment resolution and effective portfolios | ready-for-agent | done | 02, 03 |
| [05](issues/05-portfolio-analytics.md) | Deterministic changes and portfolio analytics | ready-for-agent | done | 04 |
| [06](issues/06-guru-discovery-overview.md) | Guru directory and overview | ready-for-agent | done | 01, 05 |
| [07](issues/07-portfolio-history-activity.md) | Portfolio, changes, history, activity, and export | ready-for-agent | done | 05, 06 |
| [08](issues/08-consensus-sectors-stocks.md) | Consensus, stock universe, sectors, and themes | ready-for-agent | done | 05 |
| [09](issues/09-compare-stock-integration.md) | Guru comparison and stock research integration | ready-for-agent | done | 08 |
| [10](issues/10-shared-prompt-management.md) | Shared prompt registry and admin lifecycle | ready-for-agent | done | — |
| [11](issues/11-guru-ai-analysis.md) | Structured Guru AI analysis | ready-for-agent | done | 05, 08, 10 |
| [12](issues/12-institutional-admin-operations.md) | Filing inspector and institutional operations | ready-for-agent | done | 02, 03, 04, 11 |
| [13](issues/13-follow-notify-journal.md) | Follows, notifications, journal snapshots, research context | ready-for-agent | done | 07, 08, 09 |

## Delivery order

Begin with ticket 01, then build the filing and identity foundation (02–04), deterministic analytics (05), and user-facing research slices (06–09). Prompt lifecycle (10) can proceed independently; AI analysis (11) consumes only prepared structured data. Admin operations (12) and user workflow integrations (13) complete the module.

Tickets marked needs-triage require the listed dependencies and the open decisions in the PRD to be resolved before execution. Ticket 06 owns the follower table and follow/unfollow/count foundation so directory sorting has no dependency cycle with notification delivery in ticket 13. Treat every slice as DB + API + UI where it adds a product capability, and keep parsers/calculations independently deterministic and fixture-driven.

## Outstanding

All tickets have runnable acceptance evidence. Tickets 12 and 13 include browser specs and captured screenshots; see their implementation evidence for commands and paths.
