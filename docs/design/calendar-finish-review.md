# Calendar independent finish review

Root inspected the final [desktop](evidence/calendar/1440.png) and [mobile](evidence/calendar/390.png) captures. Month cells, holiday hatching, activity markers and the recent end of the heatmap are readable without page overflow. Keyboard/browser assertions verify actual date destinations and exactly one current navigation link; the mobile Timeline background in the capture is hover styling. Disposition: ship Calendar scope.

Evidence: `tests/e2e/calendar.spec.ts` passed 2/2 (worker final run, 17.5 seconds): real PostgreSQL diaries/transactions, account timezone civil today, month navigation, DST date, empty range, keyboard movement, correct diary and Quick date target, holiday failure/retry, exclusion preference, three locales and mobile dark theme. Backend activity tests cover inclusive bounded civil ranges, owner privacy and transaction counts; holiday/domain tests cover provider validation and civil-date calculations. Integrated root checkpoint: 27 files / 197 tests and production build passed.

One detector run prompted replacing a thick border; the detector was not rerun. Shared sidebar overflow found during independent review is corrected with vertical scrolling. Persisted alert counts are explicitly extended by ticket 31 when alerts become writable; this review does not claim that later feature.
