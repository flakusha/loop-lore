<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Mood and relationship services mutate multi-row state without transactions

**Status:** Done
**Status Note:** fixed 2026-10-25 (commit f091e5683, branch fix/bug-sweep) — legs 2 (applyHappinessDelta) and 4 (get-mood/withWorldId) of the four-leg list; legs 1 (logEvent orphan row) and 3 (updateMood last_mood_change) landed earlier on this branch. applyHappinessDelta's standalone path is now a compare-and-set on the read values (row id + happiness) with a bounded 3-attempt retry; withWorldId no longer emits `world_id is null` for an undefined worldId, so world-agnostic lookups span global + world-scoped rows. Repro: two concurrent +10 deltas landed as 60 pre-fix, 70 post-fix; getMood(actor) returned undefined for a world-scoped row pre-fix. Pinned in src/characters/services/mood-service.test.ts.
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-aux-enrichment-pipeline

**Summary:**

Four legs, one root cause: read-modify-write and paired bidirectional writes with no db.transaction.

Mood

- src/characters/services/mood-service/log-event.ts:34-47 inserts the event row, then :51-56 calls applyHappinessDelta; a throw from the delta leaves an orphan event row.
- src/characters/services/mood-service/apply-happiness-delta.ts:39 reads the mood, :46 computes newHappiness, :51 writes; a failure between leaves intermediate state and concurrent callers both apply the delta.
- src/characters/services/mood-service/update-mood.ts:51 sets last_mood_change whenever happiness changes, independent of whether the mood category actually changed, so the column tracks 'last happiness update' rather than 'last mood change'.
- src/characters/services/mood-service/get-mood.ts:34-39 with an undefined worldId filters world_id IS NULL, so a world-scoped mood row is invisible to a global query.

Relationships

- src/characters/services/relationships-service/write.ts:49-63 forward insert, :67-83 reverse insert; a reverse-insert failure commits the forward row alone.
- src/characters/services/relationships-service/write.ts:150-167 two separate updateTable calls; :204-219 two separate deleteFrom calls; same partial-state exposure.

Source: .tmp/longcat/review-characters.md H1, H2, H3, H4, H5, M6.

**Context:**

Mood and relationship services mutated multi-row state with no transaction: read-modify-write and paired bidirectional writes could commit half of a change. This ticket tracks the four mood legs (event row, happiness delta, last_mood_change, world scoping); the relationship legs are tracked separately.

**Resolution:**

- src/characters/services/mood-service/apply-happiness-delta.ts — the standalone path is now a compare-and-set on the read values (row id + happiness) with a bounded 3-attempt retry, so concurrent deltas cannot clobber each other.
- src/characters/services/mood-service/get-mood.ts — withWorldId no longer emits `world_id is null` for an undefined worldId, so world-agnostic lookups span global + world-scoped rows.
- Legs 1 (logEvent orphan row) and 3 (updateMood last_mood_change) landed earlier on this branch.
- src/characters/services/mood-service.test.ts — pins the concurrent-delta outcome and the world-scoped lookup.
- Commit f091e5683 (branch fix/bug-sweep).

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue 07b0fee (registry tip: e0920aeca Konstantin Fedotov Close issue)
