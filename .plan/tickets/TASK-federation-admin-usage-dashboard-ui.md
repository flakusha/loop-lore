<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Federation admin usage dashboard UI

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-federation-offload-quotas
**Related:** TASK-federation-admin-peer-and-quota-routes
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Ship the federation panel inside the existing admin shell: peer list with
health-on-save, per-peer quota editors, the workload assignment matrix, and a
live usage view.

## Context

`.plan/epics/epic-federation-offload-quotas.md` §5 (frontend half). Built on
the routes from the previous ticket.

**Nothing new is introduced.** The panel slots into `/views/admin`, guarded by
`adminViewGuard` (`src/middleware/admin-gate.ts:20`), which already requires
`admin.system`. A new `src/frontend/alpine/admin-federation.ts` exports a plain
object spread into `adminPage()` (`src/frontend/alpine/admin.ts:60`), exactly
like `admin-audit.ts`. Data is fetched with `apiFetch`
(`src/frontend/alpine/htmx.ts:30`) over `feFetch`
(`src/frontend/fe-fetch.ts:45`) and validated with `parseOr(Schema, …, EMPTY)`
against `src/validation/schemas/responses`. Live refresh is interval polling,
matching the existing admin pattern (`src/frontend/alpine/admin.ts:80`, 30s) —
**not** a new SSE channel. Errors surface through
`hx-target-error="#toast-container"`.

Four views:

1. **Peer list** — origin, display name, kind, state, last-seen, link kind,
   workload trust, class chips, storage usage bar. Add/edit/delete with typed
   confirm on delete; the health-probe verdict from save is shown inline.

2. **Per-peer quota editors** — concurrency, rpm, advisory/hard toggle, queue
   depth, per-class storage soft/hard, each shown beside the observed value so
   the operator edits against reality.

3. **Assignment matrix** — rows are workload classes, columns are peers, cells
   are the ordered preference list. An empty class is local-only.

4. **Usage dashboard** — per-peer in-flight/limit, rpm used, latency, storage
   vs soft vs hard, open reservations, recent quota rejections, circuit
   state. Read-only.

## Acceptance Criteria

**Behaviour**

- The federation panel renders under the existing admin nav and loads its
  peer list on open.

- Saving a peer shows the health-probe verdict inline; a failed probe shows
  the reason and the peer as `pending`.

- A quota edit persists and the usage view reflects the new limit on the next
  poll.

- An empty matrix row for a class shows that class as local-only.
- Delete requires typing the origin into the confirm modal and cannot be
  submitted empty.

**Tests**

- `src/frontend/alpine/admin-federation.test.ts` — component loads, save
  dispatches with the right payload, confirm-modal gating rejects an empty or
  mismatched origin, polling cadence calls the usage endpoint on the interval.

- Responses that fail schema validation fall back to the empty default rather
  than throwing in the component.

**Edge cases**

- A `403` from the API renders an error state, not a blank panel.
- A usage payload with missing fields degrades to the empty default rather
  than crashing the tab.

**Concurrency / TOCTOU**

- A poll in flight when the tab is closed does not update a detached
  component.

**Security**

- The panel is unreachable without `admin.system`; the page guard is the
  existing one, not a new check.

- No peer token is rendered or held in component state.

**Regressions**

- `src/frontend/alpine/admin*.test.ts` and `src/routes/views.test.ts` green.

**Repo gates**

- `bun run check` green.

## Dependencies

- `TASK-federation-admin-peer-and-quota-routes`.

## Out of Scope

- A new SSE stream for admin data.
- A separate federation permission string.

**Context:** The Alpine/htmx panel inside the existing admin shell. Adds nothing new: the existing guard, the `adminPage()` spread, `apiFetch`/`feFetch`, `parseOr` schema validation and 30s interval polling are all reused, and errors surface through the existing toast target.
**Acceptance Criteria:** The panel loads its peer list from the existing shell; the health-probe verdict shows inline on save; delete is typed-confirm and rejects an empty origin; quota edits persist and show on the next poll; a 403 renders an error state rather than a blank panel.

Implementation complete; tests passing; documentation updated.

Implementation complete; tests passing; documentation updated.
