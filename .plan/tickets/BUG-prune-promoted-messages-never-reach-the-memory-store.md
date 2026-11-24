<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Prune-promoted messages never reach the memory store

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-memory-knowledge-systems

**Summary:** checkAndStorePromoted path missing: prune() buckets messages into promoted/ but checkAndPruneContext only soft-hides pruned rows and logs the promoted count; promoteMessagesToMemories/storeMemories is never called on pruneResult.promoted, and the prune message text claims 'promoted N to memory'. **Context:** Research .tmp/research/memory-context-compaction-2026-11-24.md item 3. Evidence: src/generation/auto-gen/context-pruning.ts:69-95 (no store call), src/chat/pruning/prune.ts:114-117 (misnomer text). Contrast: scene-transition-context-cut.ts:84-91 does call promoteMessagesToMemories. **Acceptance Criteria:** pruneResult.promoted messages are passed to promoteMessagesToMemories (or storeMemories) before soft-hide; log line reflects stored count; test covers promoted-written + pruned-hidden. **Caveats:** partial failure (store fails but hide succeeds) must warn, not lose; idempotency of re-run promotion; observability via stored-count log.
