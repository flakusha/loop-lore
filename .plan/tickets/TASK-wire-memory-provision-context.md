<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wire memory provision context

**Summary:** Wire the full provision context (participants + trust modifier + world/owner scoping) into prompt assembly so `provisionMemories()` filters by privacy, scope, shareability, and token budget instead of keyword-only injection.
**Context:** Epic `epic-memory-knowledge-systems.md` (Memory provision wiring + trust modifier rows; FEA-2026-056/057 emotion→mood/coping/relationship integration). Live path: `buildProvisionContext()` in `src/assistant/prompt/sections/memories-helpers.ts:59-83` (participants from `chat_participants`, trust via `RelationshipsService.getRelationship` in `src/characters/services/relationships-service/` averaged in `computeTrustModifier:21-48`) consumed by `src/assistant/prompt/sections/memories.ts:33-67`; pure filter is `provisionMemories()` in `src/memory/provision.ts:63-84` (secret→`evaluateShareability` with `trustModifier`, budget via `selectWithinBudget`, types in `ProvisionContext:21-36`), covered by `src/memory/provision.test.ts`. Canonical trackers: `TASK-memory-provision-wiring.md`, `TASK-memory-trust-modifier-wiring.md`.
**Acceptance Criteria:**
- [ ] `src/assistant/prompt/sections/memories.ts` calls `provisionMemories()` with a full `ProvisionContext` (viewerId, ownerId, chatId, worldId, participantIds, trustModifier)
- [ ] Private memories inject only for the owner; secret memories respect shareability + trust modifier
- [ ] Token budget from the context window caps injection (`selectWithinBudget`, pins respected)
- [ ] Existing memory tests still pass


**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-crafting-professions
