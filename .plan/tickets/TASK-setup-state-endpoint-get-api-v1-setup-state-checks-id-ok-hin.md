<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: setup-state endpoint: GET /api/v1/setup/state {checks:[{id,ok,hint}]}

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-first-run-auto-setup
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## What

New sibling route GET /api/v1/setup/state returning {checks:[{id, ok, hint}]}.

Authorization: server-side, default-deny — reuse the exact existing admin guard pattern: requirePermissionUserId(ctx, "admin.system") with typed 403 (src/routes/admin/system-config.ts:48-50,64-66). An anonymous booleans-only mode (no hints, no counts) is opt-in via explicit config, never the default, and never leaks check hint text or counts anonymously.

Checks sourced from existing in-process state: env/PII gate (isDevEnv() vs secrets present — the section-3 boot blocker), provider health cache (src/admin/provider-health.ts), SMK (src/crypto/smk.ts), model roles (src/admin/model-roles.ts), native status (src/native/loader.ts:199-214), TLS cert presence. Check ids are stable strings, documented, and tested.

Consumers: the boot readiness summary ticket (same checks module), the assistant /doctor command, the provider-connection-wizard epic (what-is-missing preview), and external ACP harnesses finishing setup themselves (P6). Boundary: the external-harness ACP epic has NO setup/bootstrap scope of its own (task list checked 2026-11-01) — its harness-acp isolation ticket e5ed173 stays execution-scoped; this endpoint is the machine-readable surface its consumers read instead.

## Why

Research round 3 candidate C2 (ranked as the smallest standalone PR; unblocks C1b/C3/C4/C5): setup state must be machine-readable so headless/agent deploys can finish setup without a human wizard. Extending /api/health in place would widen its pinned TypeBox schema and put setup hints on a deliberately unauthenticated contract (health.test.ts + bare-metal-deploy.md 10.2 depend on it); a sibling route reuses the health route pattern and leaks nothing.

## Scope

- src/routes/setup/ (or sibling of src/routes/health.ts) — route + TypeBox schema + server-side guard
- checks module shared with the boot readiness summary ticket
- tests: schema validation, 403 negative path, stable check ids, fresh-clone env/PII check shape
- docs: endpoint documented next to /api/health

## Do NOT touch

- Do NOT extend /api/health in place (pinned, deliberately unauthenticated — must never carry setup hints)
- Do NOT add a parallel doctor CLI surface (src/cli/headless.ts would just proxy this endpoint)
- Do NOT leak check hint text or counts in the anonymous booleans mode

## Acceptance Criteria

- [ ] JSON shape documented and schema-validated like health (src/routes/health.ts:55-57 pattern)
- [ ] non-admin/unauthenticated request gets a server-side 403 (or booleans-only mode per explicit opt-in config)
- [ ] each check id is stable and tested, including a negative test for the 403 path
- [ ] serves as the single source consumed by the readiness summary, /doctor, and the wizard epic
- [ ] on a fresh clone the env/PII check reports ok:false with a hint naming NSFW_PII_SECRET — matching the observed boot failure

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
