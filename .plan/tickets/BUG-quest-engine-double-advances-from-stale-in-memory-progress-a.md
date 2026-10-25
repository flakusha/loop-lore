<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Quest engine double-advances from stale in-memory progress and completes via a non-transactional multi-write sequence

**Status:** Done
**Status Note:** resolved 2026-10-25 (`fix/bug-sweep`) — stale-progress claim FIXED — applyProgress (src/story/quest-engine/progress.ts:133-141, :164-180, :206-215) now refreshes the in-memory row (`quest.progress = newProgress`) and does all milestone math plus the returned entry from a captured `previousProgress`, so multiple events in one processEvent batch compound (50→100 and complete) instead of each recomputing from the stale snapshot. Repro pinned in src/story/quest-engine/progress.coverage.test.ts "two matching events in one batch compound instead of overwriting" (failing before: `previousProgress Expected 50, Received 0`, quest left active; 22/22 after). RESIDUAL CLOSED 2026-10-25 (commit "fix(quests): make the completion sequence transactional"): the completion sequence now runs in one state.db transaction — gate + progress write + upsert + rewards (trx-backed ItemsService) + XP atomic; worldState.snapshot and the memory event moved post-commit; in-memory progress un-advances on rollback. Repro pinned in progress.coverage.test.ts "completion sequence is atomic" (trigger aborted the upsert; quest stayed Completed pre-fix, rolls back to Active/0 now). Gates: typecheck + eslint green 2026-10-25, worktree fix/bug-sweep, issue BUG-QUEST-ENGINE-DOUBLE-ADVANCES-FROM-STALE-IN-MEMORY-PROGRESS-A.
**Priority:** high
**Effort:** Medium
**Epic:** epic-quests-encounters

**Summary:**

Two defects, one file: src/story/quest-engine/progress.ts.

A. Stale in-memory progress (F-3): calculateProgress reads quest.progress from the row fetched once at :63; applyProgress writes Math.min(quest.progress + delta, quest.target) at :128 but never updates the in-memory quest object. A turn with two progress-carrying events for the same quest computes the second delta from the stale value and overwrites the first write.
Verification: REPRODUCED - probe .tmp/glm-review/verify/quest-progress.ts runs the real processEvent + real collection calculator (only the Kysely handle is faked) with a progress-0/target-100 collection quest and two item_transfer events (delta 10 each): decisive output 'quests UPDATE payloads (in order): progress=10 then progress=10' and 'FINAL progress persisted: 10 - correct value would be 20 (10+10), target 100'; both results report previousProgress=0 (the in-memory row was never advanced).

B. Non-atomic completion sequence (F-8): applyProgress completion path runs requireQuestTransition (completion gate, :139 area) -> progress update (:142-149) -> upsertQuestProgress (:151) -> milestone snapshot (:179-185) -> distributeRewards + awardQuestCompletionXp (:188-191), six sequential awaits on the raw db handle with no transaction anywhere in the file. A mid-sequence failure leaves the quest Completed (terminal - retry throws TransitionError) with rewards/progress rows permanently missing.
Verification: CODE-READ - applyProgress body re-read verbatim; mid-sequence failure injection needs a live DB, but the write sequence is fully determined by the read.

Impact: silent quest-progress loss; wrongly completed or delayed quests; unrecoverable Completed-without-rewards states.

Fix: advance the in-memory quest.progress inside applyProgress (or accumulate deltas per quest and apply once), and wrap the whole completion sequence in one db.transaction().

Source: .tmp/glm-review/deep-story-crypto-1015.md F-3 + F-8 (gitignored; recorded here verbatim).

**Context:**

Closure rationale (2026-10-25, branch `fix/bug-sweep`): stale-progress claim FIXED — applyProgress (src/story/quest-engine/progress.ts:133-141, :164-180, :206-215) now refreshes the in-memory row (`quest.progress = newProgress`) and does all milestone math plus the returned entry from a captured `previousProgress`, so multiple events in one processEvent batch compound (50→100 and complete) instead of each recomputing from the stale snapshot.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue fad5ab4 (registry tip: e7ce81ad7 Konstantin Fedotov Close issue)
