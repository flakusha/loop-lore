<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: setup-state endpoint: GET /api/v1/setup/state {checks:[{id,ok,hint}]}

**Status:** In Progress
**Scope:** GET /api/v1/setup/state machine-readable setup checks
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

Shipped contract (this branch): `GET /api/v1/setup/state` → `{ checks: [{ id, ok, hint? }] }`.

- Route: `src/routes/setup/routes.ts` — `setupRoutes(opts: { database?: Kysely<DB>; config: Config }, prefix = "/api")`, mounted ONLY from the v1 barrel (`src/routes/v1/base-surface.ts`, prefix `/api/v1`). `/api/health` is untouched and there is NO unversioned `/api/setup/state` mount.
- Guard: default-deny, exactly the `src/routes/admin/system-config.ts:49-50` pattern — `requirePermissionUserId(ctx, "admin.system")` returns the userId string on success and a 401 (anonymous) / 403 (non-admin) Response otherwise. There is NO anonymous mode and NO booleans-only mode in this implementation: the ticket allowed one only as an opt-in, and default-deny with zero hint/count leakage is the shipped behaviour.
- Response schema: TypeBox `t.Object({ checks: t.Array(t.Object({ id: t.String(), ok: t.Boolean(), hint: t.Optional(t.String()) })) })` declared inline in the route file (200), plus `ErrorResponse` (403) from `src/validation/schemas`.
- Checks module: `src/routes/setup/checks.ts` — `setupChecks(config, db?)` returns SIX checks, always the same ids in the same order, each individually try/caught (a throwing probe becomes `{ id, ok: false, hint: <error message> }`):
  - `env.pii` — reads `isDevEnv()` and the three resolved PII secrets (`resolveNsfwPiiSecret` / `resolveReporterHashSecret` / `resolveTelemetryPiiSecret`) from `packages/core/src/config/load/pii-safety.ts`. Dev → ok. Prod → each resolved secret must be ≥ `MIN_PII_SECRET_LENGTH` (32); a missing/short secret yields ok:false with a hint naming the offending env var (`NSFW_PII_SECRET`, `NSFW_FLAG_REPORTER_HASH_SECRET`, `TELEMETRY_PII_SECRET`). Resolution errors are caught, never thrown.
  - `provider.health` — reads `getHealthCache()` from `src/admin/provider-health.ts` only (NO network scan from this endpoint): empty cache → ok:false; otherwise ok when some entry has status `healthy`, else the hint lists the failing provider names and their error text.
  - `smk` — `isEncryptionEnabled()` from `src/crypto/smk.ts`.
  - `model.roles` — `resolveModelRole("main", config, db)` from `src/admin/model-roles.ts`; ok when the resolved role has a non-empty provider AND model.
  - `native` — `getNativeStatus().available` from the native loader (`src/native/loader.ts` → `packages/core/src/native/loader.ts`).
  - `tls` — `existsSync` on `config.server.tls.key` and `config.server.tls.cert`. `ensureTlsCerts` is deliberately NOT called: it GENERATES certificates, a side effect a read-only endpoint must not have.

Why this shape: the checks read IN-PROCESS state only (no network, no cert generation, no disk writes), so the endpoint stays a cheap read and can back the boot readiness summary, `/doctor` and the provider-connection wizard without re-querying anything.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
