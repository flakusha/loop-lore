<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: harness-f1-non-admin-providers-callers-swallow-403

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Fix the two non-admin surfaces that call admin-gated `GET /api/v1/providers` and swallow 403: `src/frontend/personas.ts:50` and `src/frontend/settings/general.ts:118` call `GET /api/v1/providers` (`src/routes/admin/providers.ts:30-31`), which is admin-gated (`requirePermissionUserId(ctx, "admin.system")`) and documented public in a stale comment (`:29-30`, `:50`) — the contract decision already landed admin-only (see `BUG-admin-providers-list-vs-auth-conflict-needs-contract-decisio`, Done, and `BUG-admin-providers-list-endpoint-is-public`, Done: anonymous-401/non-admin-403 coverage exists). The callers were never updated: non-admin users get a silent 403 instead of a degraded-but-honest surface.

**Context:**

## Why

Parity matrix blocking-adjacent finding F1: the gate is correct, the callers are stale. A non-admin opening personas or settings/general hits a 403 that is swallowed — no provider list, no error, no hint. This is the user-visible half of a gate that was fixed server-side only.

## Scope

- Update both callers to handle 403 explicitly: degraded provider list (empty/static) + honest UI signal, or an authorized lightweight alternative if one exists — record the choice here.
- Fix the stale `public` doc comments on the route (`providers.ts:27`, `:48`) as a drive-by if untouched elsewhere.
- Tests: non-admin caller path (403 → degraded, no swallow, no crash).

## Do NOT touch

- Do NOT re-litigate the admin-only contract (decided + landed; see the two Done BUGs above).
- Do NOT strip fields or re-public the endpoint.

**Acceptance Criteria:**

- [ ] Both callers handle 403 with an explicit degraded state (no silent swallow).
- [ ] Stale `public` comments on the route corrected (or a pointer to the ticket that owns them).
- [ ] Non-admin test: 403 → degraded UI, no unhandled rejection.
