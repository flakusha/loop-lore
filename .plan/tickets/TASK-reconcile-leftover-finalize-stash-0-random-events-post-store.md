<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Reconcile leftover finalize stash @{0} (random-events post-store.ts edit)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Dev has a leftover finalize stash: stash@{0} 'On dev: worktree-finalize-mtnryt47' (commit d8a26240, parents d286db9b 4db3d545 18942bf9). It holds a post-store.ts edit (old imports randomEventToEventRef/loadChatLocation) that is NOT identical to dev HEAD 48941fd8 — likely a pre-rebase variant superseded by the random-events-wiring merge, but it was never popped and never explicitly confirmed dead. Action: verify the merged 48941fd8 post-store.ts covers this content; if yes, git stash drop stash@{0} (worktree-only); if no, restore the lost lines. Owner: random-events session or cleanup worktree.

## Additional scope found during strict review (2026-09-05)

stash@{0} ALSO contains an untracked payload in its untracked-commit parent (18942bf9):

- loop-lore-data-backup/2026-09-04T16-42-08-449Z-loop-lore.db
- loop-lore-data-backup/2026-09-04T16-42-08-449Z-loop-lore.db-shm
- loop-lore-data-backup/2026-09-04T16-42-08-449Z-loop-lore.db-wal

Current dev disk ALSO has loop-lore-data-backup/ untracked (verified 2026-09-05) with the same 3 files — nothing is lost. Reconciliation must cover BOTH the post-store.ts edit AND this untracked backup payload: verify the on-disk copy matches the stash copy, then either (a) `git stash drop` after confirming the backup is safe on disk (worktree-only), or (b) preserve the stash until the backup is archived elsewhere. Do NOT drop blindly — the .db-wal may hold data not yet checkpointed into .db.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
