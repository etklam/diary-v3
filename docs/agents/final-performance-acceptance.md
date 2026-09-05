# Ticket61 bounded performance acceptance

Astra direction, 2026-09-06. This closes the explicit outstanding performance requirement in ticket61. Do not repeat cosmetic checks or build a benchmarking framework.

Use only the frozen sanitized source in `/tmp/diary-v3-source-baseline` and disposable databases. Keep the user's diary-vue checkout read-only. Existing cold timings in legacy-runtime-evidence.json are not a percentile baseline. Existing parity runner documents how to run the actual frozen Nuxt/Nitro application against isolated MariaDB; use an independent fixture file and output artifacts so its original behavior evidence is not overwritten.

Measure equivalent authenticated HTTP reads on both runtimes, with controlled provider data and identical synthetic logical records:

- A saved Diary containing 50,000 characters, read by ID.
- Paginated Diary search over 1,000 diaries, returning a bounded page of 20 results for an indexed non-stopword term present in 100 rows. Record matched counts as well as timings; use the product's actual search semantics.
- Portfolio/ledger read over 1,000 historical transactions across 20 symbols with fixture prices; retain precise monetary values and verify the expected result.
- Market history over 250 daily snapshots for the source's core symbol universe, requesting the equivalent supported bounded history interval. Check count/order/content so a fast empty result cannot pass.

Record Node/database/application mode, fixture size, machine information without secrets, command, warmup count, sample count, median and p95. Use 5 warmups and 30 measured sequential requests per workload. Run the two applications sequentially on the same host; do not benchmark while another worker is building or running browser suites. Setup and login are outside the measured read latency.

First persist the legacy measurements. Before any optimization, freeze each regression gate to `max(legacy p95 * 2, 250 ms)` and record that decision with the observed baseline. Then measure the rebuilt application. Preserve failed observations; do not change gates after seeing rebuilt results. Investigate only a failing gate or incorrect result, and rerun only affected workloads after a meaningful fix. Report setup failures honestly rather than substituting direct SQL for an HTTP claim.

Worker ownership is limited to new `scripts/parity/performance-*`, `tests/parity/performance-*`, and `docs/parity/performance-*` artifacts until an actual application defect is identified and root assigns its fix. Do not modify the parent PRD, existing frozen evidence, generated contracts or shared runtime files opportunistically. Provide one reproducible runner and concise raw JSON measurements, not a new dependency/tooling subsystem.
