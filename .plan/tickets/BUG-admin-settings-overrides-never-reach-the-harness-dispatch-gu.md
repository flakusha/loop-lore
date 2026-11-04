<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Admin settings overrides never reach the harness dispatch guard (reads config file only)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The admin settings store persists acks/enable as `system_config` overrides, but the dispatch guard keeps reading `cfg.tosGrayzoneAcknowledged` from the profile config unchanged (`src/integrations/harness/admin-settings.ts:21-24`, review `G3` `.tmp/research/harness-acp-implementation-review-2026-11-03.md:184`); `harness.acp.enabled` override is likewise ignored by the gate/probe (`src/integrations/harness/isolation-gate.ts:61`, `src/integrations/harness/profile-registry.ts:53`). Toggling ack in the UI cannot make a profile selectable - live operator surprise.

Fix direction: selector/registry/gate consume the effective admin-settings store view (`admin-settings.ts:87-91`).

AC:

- UI-toggled ack enables selection of a subscription-backed profile without a config-file edit (unit test at select/runTurn level)
- disabled override suppresses spawn even with file `enabled: true`
- no-downgrade behavior when the store is unavailable

Dependencies: implement after the ACP composition-root wiring ticket (plan §3.1); before the ToS-scoping BUG (shares the effective-view read).

Owner-confirmed required 2026-11-03 (ratifies review OQ2: admin-settings store view owns dispatch-time config).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
