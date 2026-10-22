<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: mood last_mood_change fix is a no-op for all production callers

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

mood-last-change-fix deletes updateData.last_mood_change from the happiness branch (update-mood.ts:51) to only bump on category change, but the currentMood branch (:54-57) still sets it and every production caller passes currentMood: applyHappinessDelta always does (apply-happiness-delta.ts:57), as do the importer (importers/character-systems/mood.ts:35-38) and routes (routes/character-mood/state.ts:124-127). Only tests pass happiness alone, so last_mood_change still bumps on every delta including unchanged-category rewrites.

Evidence: minimal-b; bun test mood-service.test.ts 12 pass; grep updateMood(/applyHappinessDelta( callers; no test references last_mood_change at all.

Affected: branch mood-last-change-fix; file src/characters/services/mood-service/update-mood.ts:51-57.

Fix direction: gate on actual change: if (opts.currentMood !== undefined && opts.currentMood !== existing.current_mood) { updateData.current_mood = opts.currentMood; updateData.last_mood_change = now; } and same for happiness-driven category transitions via happinessToMood. Write the test first and watch it fail against the current branch.

Acceptance Criteria:

- [ ] updateMood happiness-only same-category leaves last_mood_change unchanged
- [ ] category flip bumps last_mood_change
- [ ] mood-service suite green

Report: .tmp/glm-review/2026-10-21/minimal-b.md (mood-last-change-fix).

Caveats: data-semantics change to a timestamp column; no auth impact; no partial failure; rollback n/a; observability unchanged.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-22 registry-driven close: git issue 1d65877 (registry tip: a0b8f00e1 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-MOOD-LAST-MOOD-CHANGE-FIX-IS)
