<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: World list/search views expose private worlds to anonymous callers

**Status:** Done
**Status Note:** 2026-11-10 (release-010-closeout): the fix is on dev (`212107056` scope worlds list and search to viewer visibility, `8e84cc1d0` direct coverage of the visibility arms); the release note landed under 0.1.0 → Security.
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Symptom: GET /dynamic/worlds/list and GET /dynamic/worlds/search (htmx fragments, HX-Request: true, no /api prefix so the central auth guard allowlists them) return every world row to a caller with no identity, including private worlds (worlds.visibility defaults to 'private'). Leaked fields: world id, name, description, location count, NPC count, updated-at.

Root cause: src/routes/views/worlds.ts:36-40 (serveWorldsListDb) and src/routes/views/search.ts:170-173 (serveWorldsSearch) apply the owner filter only when userId is truthy — 'if (userId && !can(userRole, "admin.world"))'. With a null userId the condition is false, NO filter is added, and the query returns the full worlds table. The API twin handleListWorlds (src/routes/worlds/worlds.ts:65-87) has three explicit arms (authenticated -> owned|public|member; guest tier -> visibility='public' only; no identity -> empty page) and is correct.

Fix: route both view fragments through one shared views-layer visibility helper (src/routes/views/access.ts) with explicit arms: admin.world -> all worlds; authenticated non-admin -> owner_id = userId (unchanged scope; the views layer stays stricter than the API, which also lists public and member worlds); guest tier (userId null AND role guest) -> visibility = 'public' only; no identity at all -> empty result. No code path may leave the worlds query unfiltered.

Verification: new src/routes/views/worlds-anon-access.test.ts asserts the served fragment for anonymous (no rows), guest (public world only, private world absent), owner (own world) and admin (all worlds).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
