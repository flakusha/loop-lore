<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wire memory promotion pipeline

**Summary:** Wire the message → memory extraction pipeline so `ContextWindow.promotedToMemory` is populated: `selectMessagesForPromotion()` finds candidates, `promoteMessagesToMemories()` extracts and stores them with correct scope; context-cut path calls it on trim.
**Context:** Epic `epic-memory-knowledge-systems.md` (Memory promotion pipeline row: Extract → promote → inject). Live pipeline: `src/chat/transitions.ts:108-191` (`selectMessagesForPromotion` + `promoteMessagesToMemories`), surfaced via `src/chat/index.ts:28-29`, consumed on context cut by `src/routes/messages/scene-transition-context-cut.ts:81-88`, window field `src/chat/types/context.ts:45` (`promotedToMemory`), ownership/poisoning guards covered in `src/chat/transitions.test.ts:162-269`. Canonical tracker is `TASK-memory-promotion-pipeline.md`; extraction read path is `src/memory/extraction.ts`.
**Acceptance Criteria:**
- [ ] Promoted messages trigger memory extraction (`promoteMessagesToMemories` stores rows with correct character/world/assistant scope)
- [ ] `promotedToMemory` is populated on the context-cut path (`scene-transition-context-cut.ts` wires `selectMessagesForPromotion` → `promoteMessagesToMemories` → `createTransition`)
- [ ] Ownership guard holds: non-participant actor promotes nothing (memory-poisoning defense in `transitions.test.ts`)
- [ ] Existing memory extraction tests still pass


**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-crafting-professions
