# BUG: use multiple -l flags instead - potential DX improvement

**Status:** ⬜ Not Started (validated 2026-08-25 — premise CONFIRMED)
**Priority:** low
**Effort:** Medium

## Summary

DX improvement: where a single label flag is accepted, support repeated -l flags (e.g. -l a -l b) instead of comma-separated or single-value parsing. Aligns with common CLI conventions and improves usability.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Verification (2026-08-25)

Runtime probe confirms the DX gap: `ticket TASK t b -l bug -l tooling` yields issue labels ending as a SINGLE label (last -l wins; probe 48655ee shows Labels: bug, with an Update-labels entry overwriting). Source collects flags into labels[] (L115-120) but applies them as sequential `git issue edit -l <one>` calls (L98-99), each replacing the label set.

Fix direction: apply once with all labels in a single edit invocation if git-issue supports repeated -l there; otherwise concat to the supported form. Probe artifact cleaned up.
