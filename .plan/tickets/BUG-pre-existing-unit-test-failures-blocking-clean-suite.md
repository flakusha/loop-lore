<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: pre-existing unit test failures blocking clean suite

**Status:** ⬜ Not Started
**Status:** ✅ Done — all listed failures resolved on dev prior to this batch.
**Effort:** Medium

## Summary

Canonical bun test src/ (isolate) has 17 failures, ALL verified pre-existing on dev baseline (dev: 6767 pass/215 fail; worktree: 7925 pass/17 fail). Files: src/generation/step-pipeline.test.ts (FK constraint), src/logger/logger.test.ts (getLogger identity), src/logger/full.test.ts (top-level await parse errors), src/transport/compression-more.test.ts + negotiation-parsers-extra.test.ts + src/rpg/loot/table.test.ts (unresolvable imports), src/personas delete-cascade (personas-page), src/profanity/filter-coverage.test.ts, 3x worldImportRoutes 5s timeouts, src/characters/world-setup/service.test.ts (seed idempotency), src/chat/service/split.test.ts:204 (merge count), src/rpg/seduction/service/attempt.test.ts (fake db without selectFrom), src/story/quality/scorers/quest-relevance.test.ts:22 (expects >50, scorer returns exactly 50), src/story/quests/calculators/social.test.ts (non-target actor returns 25, expects 0). None touched by unit-test-coverage-2 (one stray 1-line edit there was reverted). Fix or delete per case.

## Acceptance Criteria
## Resolution

Closed in response-headers-hardening investigation (2026-09-08):
`bun test --isolate src/` on dev post `2e38790d` returns 0 fail / 8080 pass.
All listed test files are green. The fixes landed via:
- `531f7f08` (admin-templates gate + B-suffix param-size + personas cascade FK)
- `97217eaf` (strict skip mode for provider-health suites)
- `d41a5191` (shared describePristine helper + isolation gates)
- `3e7b7b88` (templates + admin-models test updates)

Remaining 31 fail in `bun run test:coverage` (with `--coverage` flag) are
coverage-instrumentation-only artefacts — they reproduce with `--coverage`
but not in plain `bun test --isolate src/`. Tracked separately under the
coverage-waivers ticket; they do NOT block the canonical gate
`bun run test:unit` (which uses `--isolate`).

## Acceptance Criteria

- [x] Implementation complete (already landed on dev)
- [x] Tests passing (canonical gate: 0 fail in 8080 tests)
- [x] Documentation updated (this ticket)
</input>

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
