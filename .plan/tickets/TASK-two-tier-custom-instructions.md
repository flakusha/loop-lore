# TASK: Two tier custom instructions

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** low
**Epic:** epic-assistant-generation-extensions

## Summary

Source: second emergent sweep, DreamRunner.ai custom instructions (candidate #31).

Free-text user steering injected into prompt assembly in two stacking layers: per-story and per-account (global rules apply everywhere, story layer stacks on top). Applied to all generation paths including impersonation; travels inside story exports/shares.

## Acceptance

- [ ] Per-story + per-account fields (validated length limit, e.g. 5k chars each)
- [ ] PromptAssembler section wiring with global-then-story stacking, budget-safe
- [ ] Applied on impersonation paths too
- [ ] Included in story export/share payload
- [ ] Tests: stacking order + trimming precedence

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
