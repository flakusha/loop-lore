<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: egui-nsfw-consent-gate

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-frontend-age-gate
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

egui surfaces age-gate plus NSFW consent before gated sends. Web reference: src/frontend/alpine/age-gate.ts plus nsfw-panel. Missing: egui only preserves 403 bodies with no status or consent surface. Acceptance: gate status shown; consent line precedes first gated send; server stays authoritative. TUI already covered by TASK-tui-pre-send-age-consent-hint; this is the egui twin.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
