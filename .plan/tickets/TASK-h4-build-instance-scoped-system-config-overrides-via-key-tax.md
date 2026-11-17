<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: H4 build: instance-scoped system_config overrides via key taxonomy

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-harness-integration.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Design is complete (`.tmp/research/wave4-h4h5-design.md`, Chosen Candidate A: key taxonomy, no migration). Implement `instance.<slug>.<key>` override rows in `system_config`: `scopeKey` / `parseScopeKey` in `src/admin/config-keys.ts`; an optional `scope` (default `resolveInstanceSlug`) on `getConfig` / `getConfigValue` / `setConfig` / `deleteConfig` / `getAllConfig` merge; the admin-settings overlay reads instance-scoped keys; the admin save path passes a `global` flag.

**Context:**

- Touch ONLY `src/admin/` + `admin-settings`. NEVER `src/db/migrations/*` (the sibling harness-queue lane owns those) — no new migration file appears in the diff.
- Enabler already shipped: `resolveInstanceSlug` (`packages/core/src/config/state-dir.ts:119`).
- Read precedence: instance row > global row > seed default > code default.
- Ordering: `TASK-harness-budget-prognosis-and-execution-order.md` rank 7, judgment-class — good-worker-only, never a fast worker.
- Epic: `epic-harness-integration.md` (Status Not Started).

**Related:**

- `.tmp/research/wave4-h4h5-design.md` (H4 section, Candidate A)
- `TASK-harness-budget-prognosis-and-execution-order.md` (rank 7, judgment-class)
- `packages/core/src/config/state-dir.ts:119` (`resolveInstanceSlug` enabler, shipped)
- honkbox: no direct analogue (honkbox has no per-instance config-scope ticket; `FEAT-capabilities-api.md` (Status: proposed) is the nearest — runtime-config-derived feature flags, no instance scope)

**Acceptance Criteria:**

- [ ] `scopeKey` / `parseScopeKey` helpers exist in `src/admin/config-keys.ts` with unit tests beside `config-keys.test.ts`.
- [ ] `getConfig` / `getConfigValue` / `setConfig` / `deleteConfig` / `getAllConfig` accept an optional `scope`, defaulting to `resolveInstanceSlug()`; existing callers keep working unchanged.
- [ ] `getAllConfig` merges to one row per logical key with a scope badge; `seedDefaults` still writes global rows only.
- [ ] The admin-settings overlay reads instance-scoped override keys, and the admin save route passes a `global?: boolean` flag (surface only, no behavior change when absent).
- [ ] Two-slug-one-DB tests: set global + instance override, assert per-scope `getConfigValue`; override-delete falls back to the global row; a fresh instance with no rows reads seed defaults.
- [ ] No new migration file in the diff; `src/db/migrations/*` untouched.
- [ ] Tests passing, docs updated.
