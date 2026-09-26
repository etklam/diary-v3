# Project cleanup, performance and security audit — 2026-09-27

Status: local audit and corrections complete. Final verification and remaining operational boundaries are recorded below.

## Scope and evidence

The audit starts from `6735e2ba0a94eb803281a0af0e9528a7666fd44d` with a clean working tree. It covers the API and workers, Web SSR and browser flows, shared contracts/client/domain, PostgreSQL queries and integrity tests, both npm dependency trees, and local deployment/restore tooling. All runtime checks use synthetic fixtures and disposable local databases. No production host, provider, credentials, or user data is used.

The parent rebuild PRD and frozen parity/performance evidence remain unchanged. This is a local engineering audit, not production acceptance or a penetration-test guarantee.

## Findings and corrections

| Finding | Priority and impact | Resolution / evidence |
| --- | --- | --- |
| SEC document/package buffering | High availability risk: a 500 MiB package retained document buffers while allocating a second full ZIP, exceeding the API pod's 768 MiB limit. | Stage documents and ZIPs on disk, calculate CRC incrementally, stream with explicit byte-based backpressure, and admit two heavy responses at a time. Preserve guest access, names, manifests and existing byte limits. Tests cover ZIP correctness, actual byte limits, cancellation and disk-write failures. |
| Unbounded API request bodies | Medium availability risk: public and authenticated JSON routes read the full body before schema validation. | Apply an 8 MiB serialized request budget with canonical 413 errors. Read lazily so authentication and route rate limits still run before parsing. This intentionally bounds formerly unlimited metadata and malformed input. |
| Research-source DNS deadline | Low availability risk: source DNS resolution preceded timeout construction. | Include DNS and cancellation in the transport deadline, retaining IP pinning. Tests cover unresolved DNS, pre-abort and cancellation during resolution. |
| Missing Web framing headers | Low browser hardening gap: SSR pages had no frame restriction. | Add same-origin framing, MIME sniffing protection and a default referrer policy to GET/HEAD SSR responses; preserve stricter route policies. This is framing protection, not a complete script-source CSP. |
| OpenAPI development dependency | `js-yaml` 4.3.1 under a pinned Redocly dependency produced two high audit findings from one underlying advisory. | Override to 4.3.2; dependency re-audit reports zero findings and generated contracts pass. [Upstream advisory](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh). |
| Independent Native proof dependency | The Expo/xcode tree produced ten moderate audit findings from one underlying UUID advisory. The root workspace audit does not cover this lockfile. | Scoped xcode UUID override to 11.1.1; dependency re-audit reports zero findings. CommonJS/pbxproj compatibility, Native typecheck and both platform bundle exports pass. The observed xcode v4 call is not one of the affected buffer APIs. [Upstream advisory](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq). |
| Production-secret provisioning script exits early | `read -d ''` reaches EOF with a nonzero status under `set -e`, so provisioning never reaches SSH. Embedded secret interpolation would also become unsafe if only the early exit were bypassed. | Repair the script and transfer secrets as data with synthetic quoting/retention regressions. The interpolation issue was unreachable in the original script and is not classified as a currently exploitable remote injection. |
| Restore smoke can delete a pre-existing container | Its EXIT trap was installed before the collision guard and unconditionally removed the configured container name, including on a guard failure. | Clean up only a container successfully created by this invocation. A mocked collision regression and a real disposable PostgreSQL restore check pass. |
| Local K3s exposure and kubeconfig permissions | The local-only helper published ports on all interfaces and inherited ambient file permissions for kubeconfig. | Bind ports to loopback and protect both existing and new kubeconfig files with mode 0600 before writing credentials. Mocked creation/reuse regressions pass. |
| SMTP dispatch concurrency test hangs | A fixed worker clock preceded a fixture's database-default `next_attempt_at`, so the worker correctly returned idle while the test awaited a send forever. | Seed the due time explicitly and fail immediately if the worker finishes before dispatch begins. Production dispatch semantics remain unchanged. |
| Diary review concurrency test expects the wrong outcome | Its helper fetched and injected a revision into a compatibility update; a concurrent review legitimately invalidated that revision and returned 409. | Explicitly exercise the unversioned compatibility path in this test, retaining versioned conflict coverage elsewhere. Production optimistic locking remains unchanged. |
| Browser fixtures no longer match session and navigation behavior | Mocked session expiry retained valid cookies; admin and navigation assertions predated the current redirect and Mail settings behavior. A Quick fixture also recreated its cleared draft while still mounted. | Model actual cookie expiry, assert protected-route redirection and API 403, retain exact navigation ordering, and reset the Quick fixture after leaving the editor. Preserve draft recovery and uncertain-write safety assertions. |

Independent review also tightened the new SEC lifecycle: awaited file writes avoid unhandled disk errors; cleanup failures cannot permanently consume a resource slot; queue waiting, retry delays and response reads respect cancellation; one cancelled metadata consumer does not cancel another consumer's shared fill. Shared metadata fills retain their own bounded transport deadline.

Mechanical cleanup removes redundant generated-client/Drizzle casts, an impossible post fallback, an unused formatting argument, and unsafe Markdown/runtime-guard type assertions. These changes preserve output and business rules.

## Initial verification

| Check | Initial result |
| --- | --- |
| `npm run test:unit` | 104 files / 952 tests passed. |
| `npm run test:integration` | 89 files passed, 2 failed, 1 optional Redis suite skipped; 383 passed, 2 failed, 2 skipped tests. Failures are the two fixture defects above. |
| Lint, TypeScript, generated contract drift | Passed. |
| Production Web/API build | Passed. |
| Deployment manifests | 12 manifests passed. |
| Root npm audit | 2 high dependency-tree findings; one underlying development-tool advisory. |
| Native proof npm audit | 10 moderate dependency-tree findings; one underlying advisory. |
| Full Chromium suite | 256 passed / 8 failed in 20.7 minutes. Seven failures were diagnosed as the fixture issues above. One PWA controller failure did not reproduce in three separate browser probes or the focused rerun. |
| Tracked private-key/AWS-key pattern scan | No matches in the scanned tracked source paths. This is a bounded pattern scan, not proof that no secret has ever existed. |

The initial browser run overlapped the audit's implementation work; it is not represented as an immutable baseline run. Failures were preserved for diagnosis and followed by focused checks.

## Performance review boundaries

The existing four HTTP workloads use five warmups and thirty sequential samples, with frozen 250 ms p95 gates. The [fresh HTTP evidence](project-cleanup-2026-09-27-performance.json) is separate from the historical baseline. Browser/build jobs were stopped and workers paused test commands during measurement.

| Synthetic HTTP workload | p95 | Frozen gate |
| --- | ---: | ---: |
| Read a 50,000-character diary | 5.02 ms | 250 ms |
| Search 1,000 diaries | 10.68 ms | 250 ms |
| Holdings from 1,000 transactions / 20 symbols | 5.24 ms | 250 ms |
| Rotation history with 250 dates / 23 symbols | 11.50 ms | 250 ms |

Two separate-process comparisons of four generated 32 MiB SEC documents reduced peak RSS from 670–693 MiB to 156–158 MiB, approximately 77%. Both implementations returned a 134,219,017-byte ZIP. Local execution fell from 3.46–3.50 seconds to 0.205–0.223 seconds; this includes replacing the JavaScript CRC loop with Node's incremental CRC32. These are local synthetic measurements, not network throughput or container capacity guarantees. Process RSS excludes cgroup/filesystem-cache accounting. See [resource and dependency evidence](project-cleanup-2026-09-27-resources.json) and the reproducible runner `scripts/parity/performance-sec-resources.mjs`.

Ledger reads replay the owner's historical transactions; the Stocks page composes several such readers. Diary contains-search and review-bucket counts also do work proportional to owner data. These are capacity considerations, not measured regressions at the accepted fixture sizes. Do not replace multilingual substring-search semantics with a tokenizer, introduce a persisted portfolio projection, or change pagination solely from static inspection. The existing diary-search plan test already exercises 40,000 synthetic diaries; public posts also have GIN expression indexes, so an absence-of-index claim requires checking the exact query expression and plan.

## Final verification

| Check | Result |
| --- | --- |
| Full unit suite | 109 files / 987 tests passed on the final source. Includes body-limit cloning, cancellation, disk-failure and cleanup regressions. |
| Full integration suite | 92 files / 387 tests passed, including both Redis tests against an audit-owned disposable Redis instance. No skipped tests. |
| Lint / TypeScript / contract drift | Passed. The final body-wrapper compatibility change also passed scoped type and lint checks. |
| Web / API production builds | Passed; the API bundle was rebuilt after the final body-wrapper correction. |
| Deployment manifests | All 12 passed. No manifest was applied to a cluster. |
| Chromium regressions | All eight initial failing cases passed in the focused run. That run passed 31 of 32 cases; the remaining desktop navigation test exhausted its combined 30-second budget. Its existing 12-route matrix was split into a separate case without relaxing assertions, retries or timeouts, and all four navigation cases then passed. |
| SEC browser flow | 1 test passed against synthetic provider fixtures after the resource changes. |
| WebKit critical flows | 10 tests passed. |
| Built-artifact browser flows | All 10 passed on the final production bundles, including GET/HEAD security headers. |
| Native proof | Clean dependency installation, typecheck, iOS/Android bundle export and xcode UUID/pbxproj compatibility checks passed. No native binary or device run is claimed. |
| npm audits | Fresh root and Native installations resolve the patched dependencies; both audits report zero findings at every severity. |
| PostgreSQL restore | Two consecutive real disposable-container checks passed: N=39 to N+1=40, full N+1 restore, fixture/seed preservation, and invalid-archive rejection without partially restored public tables. |
| Performance | All four frozen HTTP gates passed; the separate SEC synthetic resource comparison is recorded above. |

An initial restore attempt reported a missing SQL file in its temporary migration directory. The staged-file reader check and two complete reruns passed without a restore-code change beyond the owned-container cleanup fix. This audit records the transient rather than claiming a diagnosed cause. The initial PWA controller failure likewise did not recur in three isolated probes and the focused browser suite; no PWA product change was made.

The full integration run preceded only the final, isolated `Request.clone()` compatibility correction; that correction was then checked by the full unit suite and the rebuilt-artifact browser run. Independent review found no remaining confirmed material security defect in the fixes. This is not a claim that every possible vulnerability was excluded.

## Remaining operational boundaries

- The recorded CI policy keeps integration, full Chromium, WebKit and release-artifact checks advisory (`continue-on-error: true`). A failed tier can still be deployed. This policy is explicit in `docs/operations/ci-cd-notes.md` and its regression test; the audit records the risk without silently changing that operational decision.
- The default in-memory rate limiter and in-process schedulers assume the documented single API process. This audit does not establish multi-replica capacity.
- SEC metadata caches limit entry counts (250 submissions, 500 historical segments and 500 filing indexes), not retained bytes. With a 5 MiB response ceiling and indexes retaining both JSON and HTML, the theoretical cache budget exceeds the 768 MiB pod limit. No representative-corpus or cgroup test established a practical out-of-memory failure here. A follow-up should measure retained size and add a shared byte budget with eviction and synthetic capacity evidence.
- No production rollout, hosted CI run, real ingress test, container-image CVE scan or physical mobile-device run is claimed.
- Historical acceptance documents describe their recorded checkpoints; local checks here do not resolve historical production incidents.
