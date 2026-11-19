<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Blender headless node bridge

**Status:** Done
**Scope:** local Blender headless capability probe and job bridge
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-creative-tool-bridge
**Tags:** bridge, blender
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Blender background-mode python invocation as a B-tool: conversion/repair/bake/retopo recipes invoked by the 3D post-process chain; capability probe plus version report; subprocess isolation (GPL output-ownership documented). Pin Blender 4.5.15 LTS, local-first: plain `blender --background --factory-startup -noaudio --python job.py -- <args>`, never linked `bpy`, never MCP-driven in production (MCP servers are dev-time authoring aids only). When honkbox is the configured backend it owns the process (`FEAT-blender-job-route`, honkbox); otherwise this ticket owns a local sidecar. Shared host/outcome contract: `SOL-blender-job-boundary-and-contract`. AC: recipe invocations are timeout-bounded, exit-code-checked, and provenance-stamped; concurrent runs serialize per Blender instance; cancel only between stages.

**Context:**

No batch-subprocess supervision exists today: `ServerInstance.type` is
`llama-cpp|llama-swap|sd-cpp` (`src/services/server-external-manager/types.ts:15-23`).
Closest prior art is `src/integrations/harness/jsonrpc-process.ts` (sibling-owned,
read-only). Do not add an MCP client under `src/integrations/mcp/` — that
directory holds inbound servers only.

**Acceptance Criteria:**

- [x] Version-pinned invocation and capability probe covered by test
- [x] Timeout, exit-code check, provenance stamp, per-instance serialization tested
- [x] No MCP client added under `src/integrations/mcp/`

**Resolved:** 2026-11-19 registry-driven close: git issue ec74d7a (registry tip: 02d2275b9 Konstantin Fedotov Close issue)
