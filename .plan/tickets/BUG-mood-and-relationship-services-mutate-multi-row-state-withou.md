<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Mood and relationship services mutate multi-row state without transactions

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

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

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
