<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: desired context window and promote pruned messages to memory

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-chat-context-optimization.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The chat context size is a hardcoded 32K token cap regardless of model window, and messages evicted by pruning are only logged as promotion candidates. Both are shipped seams with no wiring.

**Evidence (dev 2026-11-18):** MAX_TOKENS=32_000 at src/chat/context/context-pruning.ts:18; promotion candidates logged only at :95-103; unused promotion seam src/chat/memory-promotion.ts:52-95; no recommended_context_tokens key in config (grep empty).

**Scope:** resolve desired context as min(configured desired, model max); add recommendedContextTokens server config; persist selected pruned messages through the memory-promotion seam with scope and dedup metadata.

**Acceptance Criteria:**

- [ ] 128K model no longer prunes at 32K
- [ ] desired 4096 setting trips pruning earlier
- [ ] promoted rows appear in actor_memories
- [ ] quiet chats unchanged

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
