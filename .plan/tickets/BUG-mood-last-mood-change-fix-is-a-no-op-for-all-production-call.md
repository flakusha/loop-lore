<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: mood last_mood_change fix is a no-op for all production callers

**Status:** Done
**Status Note:** fixed on this branch — update-mood.ts bumps last_mood_change only on a real category change (a happiness band flip, or a currentMood label that actually differs); regression test in src/characters/services/mood-service.test.ts
**Priority:** medium
**Effort:** Medium
**Caveats:** stale state — last_mood_change no longer advances on an intra-band happiness nudge or a same-label rewrite, so a consumer that treats the timestamp as a mood-change signal now sees fewer updates; observability — the timestamp still moves on every real category flip, so the change signal itself is unchanged in kind

**Summary:**

mood-last-change-fix deletes updateData.last_mood_change from the happiness branch (update-mood.ts:51) to only bump on category change, but the currentMood branch (:54-57) still sets it and every production caller passes currentMood: applyHappinessDelta always does (apply-happiness-delta.ts:57), as do the importer (importers/character-systems/mood.ts:35-38) and routes (routes/character-mood/state.ts:124-127). Only tests pass happiness alone, so last_mood_change still bumps on every delta including unchanged-category rewrites.

Evidence: minimal-b; bun test mood-service.test.ts 12 pass; grep updateMood(/applyHappinessDelta( callers; no test references last_mood_change at all.

Affected: branch mood-last-change-fix; file src/characters/services/mood-service/update-mood.ts:51-57.

Fix direction: gate on actual change: if (opts.currentMood !== undefined && opts.currentMood !== existing.current_mood) { updateData.current_mood = opts.currentMood; updateData.last_mood_change = now; } and same for happiness-driven category transitions via happinessToMood. Write the test first and watch it fail against the current branch.

Acceptance Criteria:

- [x] updateMood happiness-only same-category leaves last_mood_change unchanged
- [x] category flip bumps last_mood_change
- [x] mood-service suite green

Report: .tmp/glm-review/2026-10-21/minimal-b.md (mood-last-change-fix).

Caveats: data-semantics change to a timestamp column; no auth impact; no partial failure; rollback n/a; observability unchanged.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
