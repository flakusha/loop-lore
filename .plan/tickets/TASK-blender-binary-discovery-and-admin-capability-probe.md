<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Blender binary discovery and admin capability probe

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-creative-tool-bridge
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Wire the local Blender bridge into operator-visible discovery: add a 'blender' entry to BINARY_CANDIDATES in src/services/external-server-utils.ts, expose an admin capability sweep/route that calls probeBlender() from src/blender/bridge.ts, and cache the verdict with refresh/reset seams (probeHarnessCommand/lora discovery shapes). Do not add an MCP client, do not execute bpy in-process, and do not introduce a new job-status vocabulary. Acceptance: admin can see pinned-version probe result and structured failure reason; binary lookup is injectable in tests; no Blender binary is executed in unit tests.

**Context:**

`src/blender/bridge.ts` now probes and runs Blender behind a fail-soft,
serialized local boundary, but nothing discovers the binary or surfaces the
verdict to an operator. `BINARY_CANDIDATES` has no `blender` entry; existing
admin sweeps cover sd.cpp only. Probe patterns live in
`src/integrations/harness/availability.ts` and
`src/generation/lora/discovery.ts`.

**Acceptance Criteria:**

- [ ] `BINARY_CANDIDATES` includes `blender`; lookup is injectable per test
- [ ] An admin sweep/route reports pinned-version capability info or a structured failure reason
- [ ] Probe verdicts are cached with distinct refresh/reset seams (no timeout/TTL conflation)
- [ ] Tests use a fake command; no Blender binary is executed
- [ ] No MCP client under `src/integrations/mcp/` and no new job-status vocabulary
