# TASK: Two tier custom instructions

**Status:** ✅ Complete (2026-09-01 — dev cdd0b6c7)
**Priority:** low
**Effort:** low
**Epic:** epic-assistant-generation-extensions

## Summary

Source: second emergent sweep, DreamRunner.ai custom instructions (candidate #31).

Free-text user steering injected into prompt assembly in two stacking layers: per-story and per-account (global rules apply everywhere, story layer stacks on top). Applied to all generation paths including impersonation; travels inside story exports/shares.

## Acceptance

- [x] Per-story + per-account fields (validated length limit, e.g. 5k chars each)
- [x] PromptAssembler section wiring with global-then-story stacking, budget-safe
- [x] Applied on impersonation paths too
- [x] Included in story export/share payload
- [x] Tests: stacking order + trimming precedence

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
