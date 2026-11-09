<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Implement memory promotion pipeline

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Issue:** 22f6cd99-562f-4df1-a09a-f7f343a41b69
**Status:** Done
**Status Note:** 2026-11-09 reconcile: shipped — `promoteMessagesToMemories` in `src/chat/transitions.ts:165` (select → scope-detect → store with `storeMemoriesWithScope`, ownership guard), covered by `transitions.test.ts:61`. Companion `TASK-wire-memory-promotion-pipeline.md` already Done.
**Priority:** medium
**Epic:** epic-memory-knowledge-systems
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

## Overview

Wire message promotion to memory extraction and storage.

## Problem

`ContextWindow.promotedToMemory` is always empty. `selectMessagesForPromotion()` identifies messages to promote, but no pipeline extracts memories from them.

## Scope

- When context window trims messages, extract memories from promoted messages
- Detect scope: character (if message is from/about a character), world (if world-linked), assistant (if system-generated)
- Store extracted memories in `actor_memories` with correct scope
- Wire `transitions.ts` → `memory/extraction.ts` → DB

**Acceptance Criteria:**
- [x] Promoted messages trigger memory extraction
- [x] Extracted memories get correct scope (character/world/assistant)
- [x] `promotedToMemory` array is populated in ContextWindow
- [x] Existing memory extraction tests still pass

## Files

- `src/chat/transitions.ts` (modify)
- `src/chat/context-window.ts` (may modify)
- `src/memory/extraction.ts` (read-only)


git issue: cbd08c7
