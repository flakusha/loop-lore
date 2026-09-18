<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Group Chat Mention Routing

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Already Implemented (companion BUG ticket closed)
**Priority:** High
**Effort:** Small
**Epic:** epic-group-chat
**Related:** BUG-group-chat-mention-prefix-collision
**git issue:** 0008385

## Summary

Make @mention resolution deterministic and collision-safe so the intended actor
always receives the turn.

## Context

`resolveMention` (src/group-chat/mention-parser.ts) falls back to the first
participant whose name `startsWith` the mention — wrong actor on prefix
collision (Luna/Lun/Lunatic). `extractMentionedActorIds` deduplicates via `Set`,
so collisions silently drop actors. No test covers the collision case. The feature
existed in code but had no owning epic or task until this ticket.

## Acceptance Criteria

- [x] Exact match preferred; on ambiguity, longest-prefix / explicit-disambiguation wins
- [x] Collision case produces a deterministic, documented resolution (or surfaces ambiguity to the user)
- [x] Tests cover prefix-collision and multi-match scenarios
- [x] BUG-group-chat-mention-prefix-collision closed
- [x] `bun run check` green

## Resolution

All five ACs already met on `dev`. Verified 2026-09-12 during `chat-bugfix-batch-1` preparation.

- `src/group-chat/mention-parser.ts` `resolveMention` (lines 78-104) does exact-match-first (case-insensitive), then a prefix scan over participants stably ordered by `actorId`. If the prefix matches more than one participant, returns `null` so the caller surfaces an ambiguity message — no "wrong actor on prefix collision" behaviour.
- `src/group-chat/mention-parser.test.ts` covers exact-over-prefix (`Lun` resolves to `Lun`, not `Luna`), prefix-collision returns `null` (`[Luna, Lunatic]` + `"Lun"` → null), case-insensitive exact (`alex` + `ALEX` → `alex`), and the `Dark Knight` multi-word resolution via single-token prefix match.
- Companion `BUG-group-chat-mention-prefix-collision` already shows `Status: ✅ Resolved` and cites commit `f1f92684`. This TASK ticket was stale ("Not Started") despite the underlying work being shipped.

No new code required. Bookkeeping ticket: `TASK-bookkeeping-chat-bugfix-batch-1-scope-discovery`.
