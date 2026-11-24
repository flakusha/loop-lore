<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Cap semantic recall topK and pre-budget cost across memory owners

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-memory-knowledge-systems

**Summary:** The memories section calls semanticRecall with topK = mutable.length over speaker 50 + 5 per other participant, with a batch vector load. Token budget caps output tokens but not rerank work; cost grows with party size. External backends merged at this phase must also be capped before merge, not after. **Context:** Research .tmp/research/memory-management-injection-shipped-2026-11-24.md gap 5. Evidence: src/assistant/prompt/sections/memories.ts:106-124, OTHER_MEMORY_CAP=5 (line 53). **Acceptance Criteria:** bounded topK per owner and global pre-budget candidate cap; external topK capped before merge; test with multi-participant chat proves bounded vector-load size. **Caveats:** cap must not starve small chats (floor); observability (log truncated counts); stale embedding rows skipped, not fatal.
