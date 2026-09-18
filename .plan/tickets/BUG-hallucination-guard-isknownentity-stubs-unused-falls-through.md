<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: hallucination-guard-isKnownEntity-stubs-unused-falls-through-to-name-match

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** [OK] Resolved (dev, prior to 2026-09-13)
**Priority:** high
**Effort:** Medium

## Summary

isKnownEntity (src/chat/hallucination-guard/known.ts:39) accepts _knownActorIds/_knownLocationIds stubs but never reads them — name-match only. detectHallucinations already supports a third pathway via HallucinationCheckOpts.knownEntityNames. Fix per investigation 2026-09-08: thread knownEntityNames: string[] through PostStoreOpts + StoryModeOpts, resolve participant display names via loadChatParticipants/loadChatLocation at call sites before calling detectHallucinations. Reuses existing working pathway; no GenDeps changes. Files: src/chat/hallucination-guard/types.ts, src/generation/auto-gen/post-store.ts, src/generation/auto-gen/post-store-types.ts (or opts file), src/generation/auto-gen/story-mode.ts, src/chat/hallucination-guard/story-mode-types.ts (or opts file).

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Implemented via the `knownEntityNames` pathway rather than populating the unused `_knownActorIds` / `_knownLocationIds` stubs in `isKnownEntity`:

- `src/generation/auto-gen/resolve-known-names.ts` — `resolveChatKnownEntityNames(database, chatId)` reads `chat_participants` → `actors.display_name` plus `chats.current_location_id` → `locations.name`, swallows errors and returns `[]` (over-flag rather than crash).
- `src/generation/auto-gen/post-store.ts:118-125` — calls the helper and passes `knownEntityNames` into `detectHallucinations`.
- `src/generation/auto-gen/story-mode.ts:131-139` — same wiring on the GM path.
- `src/generation/auto-gen/resolve-known-names.test.ts` — coverage tests for the helper.

The `_knownActorIds` / `_knownLocationIds` parameters remain on `isKnownEntity` as documented stubs (underscore-prefixed) so the signature stays compatible with existing call sites; the working pathway is `knownEntityNames`, exercised by both callers.

Ticket status updated 2026-09-13 during plan-ticket bookkeeping sweep; ticket was stale-on-paper.
