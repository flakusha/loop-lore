<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Introduction-Based Generation — Create Entity & Backpropagate Context

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** High
**Effort:** High
**Epic:** epic-chat-product-features

## Summary

When the LLM or a participant introduces a new entity (character, NPC, location, item) into a chat, the system must generate it via the existing entity-generation workflows and backpropagate the resulting context — name, attributes, relationships — into the originating chat so future messages can reference the new entity without hallucinating.

## Acceptance Criteria

- [ ] Detects introduction phrasing in chat (per `src/generation/auto-gen/classify-intent.ts`)
- [ ] Triggers the entity-generation workflow for the inferred entity type
- [ ] Generated entity is registered in world / character store with a backflow entry into the source chat
- [ ] Subsequent turns reference the entity via `resolve-known-names` without re-generation
- [ ] Hallucination guard (`src/chat/hallucination-guard/detect.ts`) accepts the entity as known post-introduction
- [ ] Memory extraction (`src/memory/extraction.ts`) records the introduction as a stable memory entry

## Related Tickets / Epics

- epic-chat-product-features
- epic-entity-generation-workflows
- epic-rag-retrieval
- epic-character-growth

## Files

- `src/generation/auto-gen/classify-intent.ts`
- `src/generation/auto-gen/resolve-known-names.ts`
- `src/chat/hallucination-guard/detect.ts`
- `src/memory/extraction.ts`

## Open Questions

- Does backpropagation include the full generated description, or a summarised seed?
- Should the user confirm the introduction before it lands, or is it automatic?

