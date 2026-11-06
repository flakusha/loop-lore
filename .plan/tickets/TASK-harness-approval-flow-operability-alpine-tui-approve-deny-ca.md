<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness-approval-flow-operability-alpine-tui-approve-deny-callers

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Make the permission-approval flow operable from real surfaces: routes exist and are tested (`GET /permissions`, `POST /:id/approve`, `POST /:id/deny` in `src/routes/harness/permissions.ts:73,81,84`; queue + classifier tested), schemas exist (`admin-harness-schema.ts:221-242`), but NO frontend or TUI caller hits any of them — `admin-harness.ts` fetches only runs/stats/settings, and `src/tui/harness/` covers runs/detail/stats only (F4 drift: hand-written `read-models.ts` field-identical to TypeBox today). Backend stays in `TASK-permission-approval-flow` (Done); this ticket is the caller half.

**Context:**

## Why

Parity matrix gap #4 + admin-surface finding (schema-only): a parked permission ask can only be approved/denied via curl. The approval queue FIFO-orders oldest-first and never times out, so an unserviced ask blocks its session indefinitely with no UI signal.

## Scope

- Alpine callers: list pending asks (`GET /permissions`) + approve/deny buttons reusing the runs error/403/empty-state pattern and the existing `HarnessPermissionDecisionResponse` schema.
- TUI callers: pending-ask list + approve/deny verbs in `src/tui/harness/` (same overlay family as runs/detail/stats), or record an explicit defer decision here if TUI stays read-only.
- Keep `allow_once`/`reject_once` semantics (no `allow_always` persistence — route doc `permissions.ts:11-12`).

## Do NOT touch

- Do NOT change queue semantics or add grant persistence (deliberately not offered).
- Do NOT regress the F4 drift fix path: reuse the schema, do not hand-copy field shapes.

**Acceptance Criteria:**

- [ ] Admin UI lists pending permission asks and approves/denies them (approve → `allow_once`, deny → `reject_once`).
- [ ] TUI surfaces pending asks + approve/deny, or an explicit defer decision is recorded in this ticket.
- [ ] 403/non-admin and empty-queue states behave like the existing runs surface.
