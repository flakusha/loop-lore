<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Per-harness-family memory adapters after engram, each eval-gated

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-memory-knowledge-systems

**Summary:** Tracking ticket for one thin adapter per harness family that proves disjoint value (claude-code, codex, hermes, openclaw, opencode, antigravity, generic-ACP): each lands only with its own hit-at-3/MRR eval using the same bar as the reranker ticket, following the per-flavor registration rule of HARNESS_ADAPTER_FACTORIES. **Context:** Research rev2 sections 4-6. Fleet is heterogeneous by construction; memory follows the harness; unification lives in the single interfaces plus fusion chain, which does not grow with N. **Scope:** One adapter per family on demand, each with stub tests and 0..1 score mapping doc. First adapter is explicitly NOT this ticket (engram ticket covers it). **Acceptance:** No adapter lands without its eval; each new adapter reuses UnifiedWriter and UnifiedReader untouched. **Caveats:** Partial failure: shared-timeout rule applies to every adapter. Rollback: remove single adapter file. Stale state: recency plus provenance rule covers lagging families. Authorization: each adapter owns its credential handling, never shared across families. Observability: per-adapter latency in existing audit rows.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
