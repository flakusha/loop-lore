<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: DB-backed injection history and keyphrase cooldown for memory injection

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems

**Summary:** Keyphrase cooldown lives in a process-local Map (5000-entry sweep, 15-min TTL) and injection history is never persisted at all. Restart or second process loses both, causing double-injection across restarts and no cross-instance dedup. Required before any second (external) backend lands, since fan-out adds processes. **Context:** Research .tmp/research/memory-management-injection-shipped-2026-11-24.md gaps 1 and 4. Evidence: src/memory/keyphrase-recall.ts:49-56, memories.ts:209-214 (no history map). **Acceptance Criteria:** (chat, memory) last-injected timestamps persisted in DB; keyphrase cooldown reads/writes the same store; restart-safe test (state survives module reload); multi-instance-safe (unique constraint or transactional upsert). **Caveats:** lock/unlock lifecycle on the cooldown row; data races on concurrent assemblies; stale rows need TTL purge; partial failure must fail open (inject, never block the prompt).
