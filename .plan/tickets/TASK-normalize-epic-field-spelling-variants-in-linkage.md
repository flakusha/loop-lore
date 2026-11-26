<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: normalize Epic field spelling variants in linkage

**Status:** Done
**Priority:** medium
**Effort:** Small
**Epic:** epic-unified-spec-framework
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The linkage gate only recognizes the **Epic:** spelling, so the **Epic**: variant leaves tickets phantom-unbound. Accept both spellings (canonicalize on parse) and keep the scoped allowance for pending merges. Research: .tmp/research/giwt-md-json-roundtrip-gaps-2026-11-26.md. Acceptance: both spellings bind; no phantom-unbound tickets remain on the measured corpus.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-11-26 registry-driven close: git issue ee15807 (registry tip: 78e1bf20e Konstantin Fedotov Verified fixed in installed giwt: fence-aware status scan (linesOutside)
