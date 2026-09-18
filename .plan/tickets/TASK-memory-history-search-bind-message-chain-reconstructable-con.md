<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: memory history search: bind message chain + reconstructable context

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** 🔨 Implemented (memory-history-search worktree — pending finalize)
**Priority:** high
**Effort:** Large
**Epic:** epic-memory-knowledge-systems.md

**Summary:**
Memory entries are low-context compacted summaries of chat events. At extraction time we need to bind the full chain of source message IDs (plural — current schema only stores a single `source_message_id`) so that "try hard to remember" lookups can reconstruct the original conversation by walking the message chain.

## Problem

Today's `actor_memories.source_message_id` is a single optional text column, but extraction (`src/memory/extraction.ts`) operates on a single AI response paired with a single user message. Memories derived from longer context windows (compaction of a section, summarization of a turn burst, re-extraction after context cut) lose their grounding: a recall lookup returns a summary string with no path back to the chat text.

**Use case — "try hard to remember":**
- Memory surface (injection) shows the compacted summary — fits the prompt budget.
- When `confidence` is low OR the user/character explicitly asks for detail, the system walks back to the original `messages` rows that fed the summary, ordered by their `parent_id` / `e2e_chain_index` chain, and reconstructs the exact quoted text.

## Scope

### Schema (append-only migration per `src/db/migrations/README.md`)

Landed as top-level migration `src/db/migrations/008_memory_source_chain.ts` (schema_version 29) per the migrations README policy — the `parts/` tree is frozen (orchestrated by `001_init`), so new schema changes go in new top-level `NNN_*.ts` files:
- Add `source_message_ids` `text` (JSON array of message IDs) — the chain bound at extraction.
- Add `source_chat_ids` `text` (JSON array) — chain may span multiple chats (carry-forward, side chats feeding main).
- Add `extraction_kind` `text` (enum: `single_response`, `burst`, `compaction`, `manual`, `carry_forward`) — distinguishes a one-off recall from a reconstructed chain. Define `ExtractionKind` const + type in `src/db/enums-story/world.ts` (next to `MemoryType`), register `ActorMemories.extraction_kind → ExtractionKind` in `src/db/column-types.ts`; the validation enum is generated automatically by `bun run db:sync-types` into `src/validation/db-schemas.ts`.
- Add `context_window_start` / `context_window_end` `text` — game-time bounds of the source span (timescape-aware decay, future-proofing).
- Backfill `source_message_ids` from the existing `source_message_id` (single → array of one) — non-destructive.
- Index on `source_chat_ids` (most likely search target across chats).

After migration:

```bash
# Stash or commit any unstaged edits under `src/validation/`, `scripts/generate-db-types.ts`
# before regenerating — `db:sync-types` rewrites those files and would clobber WIP.
bun run db:sync-types && bun run db:sync-manifest
bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts
bun run schemas:check
```

### Pipeline

- `src/memory/extraction.ts`:
  - `extractAndStoreMemories` accepts `sourceMessageIds: string[]` and `sourceChatIds: string[]` in `ExtractionOpts`.
  - Persist both as JSON arrays via existing string-encoded columns; populate `extraction_kind`.
  - New helper `extractFromBurst(db, opts, { messageIds, chatIds })` — extracts from a known chain (used by compaction pass, carry-forward, and manual "try hard" reruns).
- `src/memory/types.ts`:
  - `MemoryEntry.sourceMessageIds`, `sourceChatIds`, `extractionKind`.
  - `ExtractionOpts` gains the chain fields.
- New `src/memory/history-search.ts`:
  - `reconstructMessageChain(db, memoryId, opts)` → returns the ordered `messages` rows (by `created_at` then `parent_id`) that fed the memory. Spans `source_chat_ids` when chain crosses chats.
  - `expandMemoryContext(db, memoryId, opts)` → returns `{ summary, messages: MessageRow[] }`. Budget-aware: honors a soft token cap (default projects `MemoryBudgetConfig.maxTokens`, anchored on `src/memory/budget.ts:DEFAULT_MAX_TOKENS = 1024` unless an expansion-specific override is wired) for the expanded view. **E2E boundary**: each message row is returned with `content: m.content_plaintext ?? m.content` (matching the resolver pattern in `src/chat/service/carry-history.ts:90-105`). Rows with `key_id IS NOT NULL AND content_plaintext IS NULL` are dropped — they're ciphertext with no plaintext mirror, consistent with `carryHistory`.
  - `walkMessageChain(db, chatId, fromMessageId, direction)` — utility to walk parent/child in either direction, used by tests and future compaction passes. **Branch tie-break**: messages can have multiple children when branches/regenerations exist (`swipe_index`, `continuation_index`). Parent walk uses `created_at ASC` only (one parent per child). Child walk uses `created_at ASC, swipe_index IS NULL DESC, swipe_index ASC` (NULL first — original/active branch precedes regenerations).
- `src/memory/history-search.ts` (orchestrator with DB access — `src/memory/injection/` is a pure module whose existing `selectMemoriesForInjection(memories, config, ctx)` takes pre-loaded memories, NOT a `db`):
  - Landed as `selectMemoriesWithExpansion(db, memories, config, ctx, opts)` — takes pre-loaded candidate memories, pre-loads chains for those below `expandBelowConfidence` (default 0.5) via `expandMemoryContext`, then delegates to the pure `selectMemoriesForInjection`. Expansion does not change `selectMemoriesForInjection`'s signature.
  - Add `expandedFromMemoryId: string | null` on `MemoryInjectionEvent` (extend the existing interface in `src/memory/injection/types.ts`) so callers can log/meter expansions.

### Wiring

- `src/routes/actor-memories.ts`: dedicated `GET /api/actors/:actorId/memories/:memoryId/expand` (optional `?maxTokens=N`, default 1024) routed through `expandMemoryContext`, ownership-checked like the CRUD routes.
- Existing extraction callers are **NOT** in `src/chat/service/crud/create.ts` or `src/chat/service/carry-memory.ts` (those reference `source_message_id` for an unrelated message-metadata copy path). The real call sites for `extractAndStoreMemories` are `src/generation/generate-route/non-stream.ts:186` and `src/generation/generate-route/stream-to-client.ts:273`. At both, pass `sourceMessageIds: [messageId]` and `extractionKind: "single_response"`. No semantic change to the surrounding flow; just populates the new array.
- Compaction pass (if/when added — see also `TASK-context-cut-memory-promotion.md`) calls `extractFromBurst` with the chain.

### Tests

- `src/memory/extraction.test.ts` — assert the chain is persisted and round-trips through the JSON column.
- New `src/memory/history-search.test.ts`:
  - `reconstructMessageChain` returns messages in chain order across a single chat.
  - `expandMemoryContext` honors the token budget.
  - Backfill migration preserves existing single-IDs (assert `source_message_ids` equals `[old_id]` after upgrade).
- `src/db/migration-roundtrip.test.ts` — new part traverses the roundtrip path.

### Verification

```bash
bun run check
bun test src/memory/ src/db/migrations.test.ts src/db/migration-roundtrip.test.ts
```

## Out of scope

- LLM-based compaction pass that emits a single summary over a chain (`TASK-context-cut-memory-promotion.md`).
- Vector embedding the message chain itself (only the summary is embedded today; chain expansion is exact-fetch).
- Cross-timeline memory propagation rules (`epic-memory-propagation.md`).

## Dependencies

- `src/db/migrations/parts/012_memory.ts` (existing) — extending the same logical table.
- `epic-memory-knowledge-systems.md` — parent epic; add this feature row.
- `docs/spec/memory-system.md` — episodic memories are linked to chats/workspaces; this makes the link explicit and reconstructable.

## Linked Epics

- `epic-memory-knowledge-systems.md`
- `epic-archival-workflow.md` (chain walk overlaps with archive retrieval)

**Acceptance Criteria:**
- [x] Migration `008_memory_source_chain.ts` lands and roundtrips (up→down→up).
- [x] `ExtractionKind` enum defined in `src/db/enums-story/world.ts`; column-type override registered in `src/db/column-types.ts`; validation enum auto-regenerated into `src/validation/db-schemas.ts`.
- [x] `actor_memories.source_message_ids` and `source_chat_ids` populated by extraction; existing single-ID rows backfilled.
- [x] `reconstructMessageChain` returns messages ordered by `created_at`; branch tie-break applied on child walk.
- [x] `expandMemoryContext` uses `content_plaintext ?? content`; E2E rows lacking a plaintext mirror are dropped (not returned as ciphertext).
- [x] Expansion honors a token budget and never exceeds the configured cap.
- [x] All existing extraction callers migrated (no regression in single-message path) — real call sites only.
- [x] `bun run check` green; `bun test src/memory/` and migration tests pass.
- [x] DB schema gate (`schemas:check`) green after regeneration.
