<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Blender binary discovery and admin capability probe

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-creative-tool-bridge
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Wire the local Blender bridge into operator-visible discovery: add a 'blender' entry to BINARY_CANDIDATES in src/services/external-server-utils.ts, expose an admin capability sweep/route that calls probeBlender() from src/blender/bridge.ts, and cache the verdict with refresh/reset seams (probeHarnessCommand/lora discovery shapes). Do not add an MCP client, do not execute bpy in-process, and do not introduce a new job-status vocabulary. Acceptance: admin can see pinned-version probe result and structured failure reason; binary lookup is injectable in tests; no Blender binary is executed in unit tests.

**Context:**

`src/blender/bridge.ts` probes and runs Blender behind a fail-soft, serialized
local boundary. `src/blender/discovery.ts` caches one verdict with explicit
refresh/reset seams and no TTL; `GET /api/admin/blender-status` surfaces it.
The 4.5.15 system install is the production backend, so no launcher prefix is
needed. Probe patterns were compared with `src/integrations/harness/availability.ts`
and `src/generation/lora/discovery.ts`.

**Acceptance Criteria:**

- [x] `BINARY_CANDIDATES` includes `blender`; lookup is injectable per test
- [x] An admin sweep/route reports pinned-version capability info or a structured failure reason
- [x] Probe verdicts are cached with distinct refresh/reset seams (no timeout/TTL conflation)
- [x] Tests use injected probes; no Blender binary is executed
- [x] No MCP client under `src/integrations/mcp/` and no new job-status vocabulary
