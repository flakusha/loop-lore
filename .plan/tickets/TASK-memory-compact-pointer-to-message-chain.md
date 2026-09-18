<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Memory Compact Pointer To Message Chain

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems
**Tags:** memory, pointer, source-chain

**Summary:**
Memory content compact and precise event description; full discovery by reading old context. Memory row carries a pointer chain to the precise chat message (and neighbors) instead of duplicating chat history.

**Context:**
Current memory storage can grow unbounded as LLM-extracted snippets accumulate and re-sum. The world-RPG epic batch wants memory rows to be tiny: 1-3 sentences + a list of pointers (chatId, messageId, +/- neighbor window) that the prompt assembly dereferences on demand.

**Acceptance Criteria:**
- Schema change: `actor_memories.content` becomes max 1024 chars; new `memory_pointers(memory_id, chat_id, anchor_message_id, neighbor_window_up, neighbor_window_down, role_label)` (multiple rows per memory).
- Composer code path: when emitting a memory, dereference each pointer by fetching the surrounding messages (<=80 lines combined); fall back gracefully if pointer is broken (chat deleted, message pruned).
- Threshold fallback: low-confidence recall (per FEA-2026-063) loads full context; high-confidence emits the compact summary.
- Tests: emitter writes pointer, not full text; dereference resolves chain; broken pointer does not crash.
