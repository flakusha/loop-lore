<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness provider ToS usage-class matrix

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

Static in-code metadata table mapping each harness flavor (and its spawn command shape) to a provider ToS note plus allowed usage classes, distinguishing subscription-backed profiles (provider subscription accounts driven for RPG/other non-chat functionality — the ToS grayzone) from local and api profiles (local model runners and direct BYOK API access — NOT limited by ToS by default and MUST stay ungated). Surfaced in the admin harness panel. Metadata only: the matrix informs the admin UI and the dispatch guard but gates nothing by itself.

Policy frame (binding): harness-as-provider for RPG/other functionalities is permitted ONLY when the user explicitly allowed it via per-profile acknowledgement; local execution and direct API access are NOT limited by ToS by default and must remain ungated.

## Context

- Research `.tmp/research/Harness-ToS-Validation.md` Gaps 1 ("No provider matrix — nothing records which providers/subscriptions permit non-chat/programming usage") + Rec 2 ("provider metadata table (static, in code, not config) mapping flavor → ToS note + allowed usage classes; surface in admin panel").
- Flavors are enumerated by `HARNESS_FLAVORS` at `packages/core/src/config/schema/harness.ts:24`; no ToS/usage-class metadata exists anywhere in the schema (`packages/core/src/config/schema/harness.ts`) or validator (`packages/core/src/config/sections/harness.ts`).
- The admin harness surface is telemetry-only today: `src/components/harness/admin-harness-panel.html` and `src/frontend/alpine/admin-harness.ts` render run telemetry, no provider notes.

## Acceptance Criteria

- [ ] Static module beside `src/integrations/harness/flavor-factories.ts` (e.g. `provider-tos.ts`) exporting per-flavor metadata: ToS note text plus a usage-class union (subscription-backed / local / api), keyed off `HARNESS_FLAVORS`.
- [ ] Admin harness panel renders the ToS note and usage class per configured profile flavor (`src/components/harness/admin-harness-panel.html` + `src/frontend/alpine/admin-harness.ts`).
- [ ] Local and api usage classes are visibly marked as ungated / not ToS-limited.
- [ ] No new config fields, no new dependencies.

**Dependencies:** none; feeds TASK-harness-tos-acknowledgement-frontend-confirmation (renders the note) and informs TASK-harness-tos-acknowledgement-dispatch-guard (usage classes).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
