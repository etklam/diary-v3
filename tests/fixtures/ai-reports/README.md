# Synthetic semantic evaluation cases

`quality-cases.json` contains twelve synthetic reviewer scenarios. It is an evaluation rubric, not evidence that a live model passed. The executable context tests supply full storage fixtures separately. Over-limit text is covered by deterministic boundary tests; it must be rejected before a model call rather than summarized silently.

For each chosen model/config/prompt revision, an authorized operator runs synthetic cases and records:

- Schema/reference validity and the exact permitted source aliases.
- Whether each expected fact is supported, contradicted or omitted.
- Whether any forbidden inference appears.
- Whether required limitations are acknowledged in the report language.
- Readability, length and practical review focus (no trade instructions).

Score support, limitations and readability from 0 (fails) to 2 (meets). Any cross-owner disclosure, external call, leaked secret, fabricated metric, violation inferred solely from missing records or resurrection of deleted content fails the release gate regardless of scores. Repeat selected cases to assess variability; automated validation and a second model alone cannot certify semantics.

Live evaluation is pending. Do not replace this status with a claim derived from mock provider output.
