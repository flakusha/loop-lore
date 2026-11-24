<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Unified memory reader with rank fusion and budget-last guarantee

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-memory-knowledge-systems

**Summary:** UnifiedReader fans out under one shared timeout, rank-normalizes per backend (never raw scores), fuses via RRF, re-ranks once with the existing cross-encoder seam, applies hard provision filters first and confidence threshold, and caps with selectWithinBudget LAST so budget is the only anti-overfill guarantee. **Context:** Research rev1 sections 1/3/5 and rev2 section 6. Reuses owned tickets TASK-hybrid-search-rrf-fusion-plus-rerank and the rerankViaLlamaCpp seam. **Scope:** Reader module, per-backend 0..1 score mapping documented per adapter, rank fusion, threshold, budget cap, tests with stub backends. Out of scope: new adapters. **Acceptance:** Order is filter, fuse, rerank, threshold, budget; slow backend degrades to absent under shared timeout; contradictions resolve by recency plus provenance never score; budget holds regardless of backend count; eval-gated before landing. **Caveats:** Partial failure: slow or dead backend must not head-of-line block the turn; shared timeout enforced. Rollback: reader flag off falls back to native path. Stale state: lagging backend loses to recency rule. TOCTOU: rank snapshot per query, no cross-query reuse. Observability: per-backend latency plus drop reason logged. Security: provision scope/privacy filters run before any external content enters the prompt.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
