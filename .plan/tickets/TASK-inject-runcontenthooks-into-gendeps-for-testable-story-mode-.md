# TASK: Inject runContentHooks into GenDeps for testable story-mode hook contracts

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Story-mode.ts currently imports runContentHooks via static import from ./content-hooks (line 20), making the fail-closed try/catch (lines 174-198) untestable without expensive GameMasterService operational mocking.

Refactor: add runContentHooks to GenDeps interface (src/generation/auto-gen/deps.ts) with the existing function signature. createDefaultDeps() wires the real implementation. triggerStoryModeGeneration calls deps.runContentHooks instead of the static import.

Cost: ~10 lines (interface entry + createDefaultDeps wiring + call-site change). No behavior change.

Value: enables regression tests for future story-mode content-hook contracts (NSFW gate, moderation, emotion) without GameMasterService/TurnManager/executeTurn operational mocks. Future security fixes in story-mode can land with test coverage.

Use as template: src/generation/auto-gen/content-hooks-nsfw-gate.test.ts covers the unit-level gate; a new test file at src/generation/auto-gen/story-mode-fail-closed.test.ts would verify triggerStoryModeGeneration re-throws when deps.runContentHooks throws, via a mock deps object with executeTurn stubbed on GameMasterService (which still needs separate testability work — but the hook contract itself becomes unit-testable).

Blocks: any future story-mode security fix that needs regression test coverage. Filed from strict-review of BUG-f0683a8 + BUG-5232abe fix chain (commits 0e682a38, a7a444c0, 3137b1d2).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
