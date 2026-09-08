<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: hallucination-guard-isKnownEntity-stubs-unused-falls-through-to-name-match

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

isKnownEntity (src/chat/hallucination-guard/known.ts:39) accepts _knownActorIds/_knownLocationIds stubs but never reads them — name-match only. detectHallucinations already supports a third pathway via HallucinationCheckOpts.knownEntityNames. Fix per investigation 2026-09-08: thread knownEntityNames: string[] through PostStoreOpts + StoryModeOpts, resolve participant display names via loadChatParticipants/loadChatLocation at call sites before calling detectHallucinations. Reuses existing working pathway; no GenDeps changes. Files: src/chat/hallucination-guard/types.ts, src/generation/auto-gen/post-store.ts, src/generation/auto-gen/post-store-types.ts (or opts file), src/generation/auto-gen/story-mode.ts, src/chat/hallucination-guard/story-mode-types.ts (or opts file).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
