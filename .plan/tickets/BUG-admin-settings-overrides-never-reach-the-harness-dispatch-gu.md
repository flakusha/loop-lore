<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Admin settings overrides never reach the harness dispatch guard (reads config file only)

**Status:** Done
**Status Note:** Implemented on branch `harness-effective-view` (stacked on `acp-composition-root` @ `9c5c95116`); pending finalize behind the parked wave.
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

The store persisted acks/enable as `system_config` overrides while the dispatch-time
consumers read the file config. Selector (`profile-selector.ts` walk: effective
master-switch + per-profile acks via a new `tosDenied` helper) and the isolation gate now
read the effective view (`getHarnessAdminSettings`); a new
`isHarnessAdminSettingsSeeded()` gates the no-downgrade fallback — an unseeded store
degrades to the raw file layer (last-known-good), never a silent widening; the composed
runtime is untouched structurally (`runtime.ts` composes nothing when file-disabled).
Authz semantics unchanged: only WHERE enabled/acks are read from moved. AC evidence:
unit tests at select/runTurn/gate level in `profile-selector.test.ts`,
`isolation-gate.test.ts`, `runtime.test.ts`, `admin-settings.test.ts` (in-memory fakes,
store reset per test); documentation = the updated module doc headers.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
