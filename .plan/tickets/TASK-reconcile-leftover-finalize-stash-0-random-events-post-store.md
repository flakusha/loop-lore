<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Reconcile leftover finalize stash @{0} (random-events post-store.ts edit)

**Status:** ✅ Done (2026-09-05, fix-character-growth-gate-failures worktree)
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

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution (2026-09-05)

Both verification gates passed; stash dropped (`git stash drop stash@{0}` = `d8a26240`).

**(a) post-store.ts import edit is dead — no remaining call sites**
Verified `grep -nE 'randomEventToEventRef|loadChatLocation|loadChatParticipants|generateRandomEvent' src/generation/auto-gen/post-store.ts` returns zero matches. All three names live exclusively in `src/generation/auto-gen/fire-random-event.ts` (extracted at `e599011b`):
- `fire-random-event.ts:16` `import { generateRandomEvent, type RandomEvent, }`
- `fire-random-event.ts:17` `import { randomEventToEventRef, }`
- `fire-random-event.ts:20` `import { loadChatLocation, loadChatParticipants, }`

The stash's pre-extraction variant of `post-store.ts` was fully superseded by `e599011b`. Dropping the tracked-side change loses no content.

**(b) backup byte-match — drop is safe (no checkpoint-pending data)**
Extracted untracked blob commit `18942bf9` via `git checkout 18942bf9 -- 'loop-lore-data-backup/*'` to `.tmp/loop-lore-data-backup-stash/loop-lore-data-backup/`. SHA256 byte-match against `git cat-file -p 18942bf9:<path>`:

| File | Bytes | SHA256 |
|---|---|---|
| `.db` | 2273280 | `d3e73a45…63f9` ← match |
| `.db-shm` | 32768 | `a55f047f…efb2` ← match |
| `.db-wal` | 0 | `e3b0c44…b855` ← match (empty) |

The `.db-wal` SHA256 (`e3b0c44…`) is the well-known hash of an empty file, meaning all WAL transactions were already checkpointed into the `.db` before the stash was created. No data loss risk from dropping.

**Stash status:** dropped; `git stash list` empty. Backup preserved at `.tmp/loop-lore-data-backup-stash/loop-lore-data-backup/` for one rotation cycle (delete after the next `bun run check` confirms the migration/seed cycle recreates the schema without loss).
