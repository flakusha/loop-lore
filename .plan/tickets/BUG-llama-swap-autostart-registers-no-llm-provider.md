<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: llama-swap autostart registers no LLM provider

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-llama-swap
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

startLlamaSwap starts proxy but registers nothing (init-background-services.ts:100-117) — no provider entry, no default-model patch, roles/health/rescan ignore it. Fix: mirror llamaCpp registration block for swap port, or document manual wiring.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 81c0b72 (registry tip: 4f5d4a78d Konstantin Fedotov Close issue)
