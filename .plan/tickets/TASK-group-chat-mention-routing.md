<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Group Chat Mention Routing

**Status:** ⬜ Not Started
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

- [ ] Exact match preferred; on ambiguity, longest-prefix / explicit-disambiguation wins
- [ ] Collision case produces a deterministic, documented resolution (or surfaces ambiguity to the user)
- [ ] Tests cover prefix-collision and multi-match scenarios
- [ ] BUG-group-chat-mention-prefix-collision closed
- [ ] `bun run check` green
