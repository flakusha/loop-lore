<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness-approval-flow-operability-alpine-tui-approve-deny-callers

**Status:** Done
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

## Implementation

The caller half, in two surfaces, both driving the SAME routes the backend already shipped.

**Alpine (admin panel, Harness tab).** New slice `src/frontend/alpine/admin-harness-permissions.ts`, spread into `adminHarness` like the runs/settings/files slices: `harnessPermissionRows`, `harnessPermissionsError`, `harnessDecidingId` plus `refreshHarnessPermissions()` / `answerHarnessPermission(id, decision)`. `loadHarnessPermissions` calls `GET /api/v1/harness/permissions` and decodes with the server's own `HarnessPermissionsResponse` schema (`parseOr`, the runs surface's pattern), so no field name is restated client-side — the F4 drift fix path is preserved. The error path reuses `harnessFailure(res, key)` from `./admin-harness-detail`, so a 403 renders the shared `harness.errorForbidden` message exactly like the runs surface, and a non-2xx renders the route's own message. `decideHarnessPermission` posts to `/permissions/:id/approve|deny` (one-shot `allow_once` / `reject_once` — no grant is remembered), guards against a double decision with `harnessDecidingId`, and reloads the queue afterwards. Markup: `src/components/harness/admin-harness-panel.html` grows a "Pending requests" block above the runs table — one row per ask (profile, tool, cwd, request preview, arrival) with an approve/deny button pair per row, plus the empty-queue and load-error states.

**TUI (pi-tui harness overlay).** New `src/tui/harness/pending.ts` holds the queue state (the parked asks, the highlighted row, the last failure); the HTTP calls live in `./api` (`loadPendingPermissions`, `decidePermission`) and the row formatting in `./display` (`formatPendingPermission`, `formatPermissionInput`) — the same split the runs family already uses. The overlay (`src/tui/harness/index.ts`) renders a "Pending requests" block above the run list; `a` approves the highlighted ask, `d` denies it, Tab moves the Up/Down cursor between the two lists. The TUI's wire types are DERIVED from the server's schemas (`HarnessPendingPermission`, `HarnessPermissionsView`, `HarnessPermissionDecisionResponse` imported from `src/frontend/alpine/admin-harness-schema`), never hand-copied.

**Wire shape.** The server wraps every JSON response in `meta.api_version` (`jsonResponse`). The frontend schemas are TypeBox `Type.Object`s, which accept the extra envelope key, so the browser bundle decodes the real body unchanged — verified against the real captured bodies, in a separate process from the server (the browser bundle is a separate realm; in one process Elysia mutates the shared schema object to `additionalProperties: false`, which breaks an in-process decode but never the browser's). The TUI does not runtime-validate, so it reads `items` straight off the response.

**Verification.** Server half proven against the real route (mount + real runtime + a parked ask): `GET /permissions` → 200 with the queued ask, `POST .../approve` and `POST .../deny` → 200, queue drains. Browser half proven in a separate process against those captured bodies: the schema accepts the body with `meta`, one row is built, approve is sent and the queue reloads empty. TUI half proven against the real route through the overlay's own fetch seam: the block renders the parked ask, `a` approves it (queue empties), a second ask is denied with `d`. The built browser bundle carries the new caller (`harness/permissions` present in `dist/public/alpine-init-*.js`).

**Acceptance Criteria:**

- [x] Admin UI lists pending permission asks and approves/denies them (approve → `allow_once`, deny → `reject_once`).
- [x] TUI surfaces pending asks + approve/deny, or an explicit defer decision is recorded in this ticket.
- [x] 403/non-admin and empty-queue states behave like the existing runs surface.

**Resolved:** 2026-11-06 — landed as `feat(harness): approve parked permission asks from the UI` (admin panel + pi-tui overlay; 21 files: 2 new Alpine/TUI modules with tests, the panel markup, the TUI overlay wiring, 10 locale files, CHANGELOG).
