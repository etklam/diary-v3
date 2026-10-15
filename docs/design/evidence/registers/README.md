# Register evidence

Captures for the density ruling recorded in [DESIGN.md](../../../../DESIGN.md#registers) and
[ticket 120](../../../../.scratch/diary-v3-rebuild/issues/120-system-density-ruling.md): one
vocabulary, three rhythms — capture, ledger, reading.

Screenshots are untracked (`*.png` is gitignored repo-wide) and are produced by the spec
itself, so they cannot go stale against the code they document.

## Reproduce

```sh
npx playwright test tests/e2e/registers.spec.ts
```

- `capture-1440.png`: `/diaries/quick` at 1440×900. The writing area is the subject of the
  page and takes the canvas; before the ruling it was a 690×280 field in a 1,225px content
  region with roughly 550px of dead space below it. The field still ends at the 72ch
  writing measure — the column carries the measure, not the textarea.
- `reading-1440.png`, `reading-768.png`, `reading-390.png`: `/diaries/:id` at the three
  widths. The record and its original reasoning are the page; companies, the review
  summary, later evidence and guru context are grouped under one "Attached to this entry"
  heading and set one step down. Before the ruling every section heading sat at one rank on
  a page 2,984px long at 390px, so nothing receded.

The ledger register is deliberately uncaptured here: it is the texture 56 of 88 routes
already had, and the existing per-feature evidence directories document it.
