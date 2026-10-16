<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: MCP server surface (stdio, operator-flagged)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-harness-integration`
**Depends on:** `TASK-harness-mcp-client-wrapper`
**Related:** docs/meta/research/harness-mcp-wiring.md, epic-external-creative-tool-bridge.md

**Summary:**

An operator-flagged stdio MCP server exposing only export-flagged loop-lore tools, each inbound `tools/call` routed through `executePluginTool()` so timeout + role gate stay intact; unauthenticated HTTP refused. Closes the "no MCP surface" gap (external agent runtimes can drive loop-lore tools).

**Context:**

`docs/spec/integrations-architecture.md:86` already reserves `src/integrations/mcp/` as the bridge home, and `code-map.json` maps `src/plugins/mcp/client.ts` to a target ticket — the shot-caller paths exist. External agents (omp, hermes, third-party supervisors per `epic-recursive-self-improvement.md` §2) currently can only reach the REST API.

**Acceptance Criteria:**

- [ ] stdio server registers only tools whose export flag is set; one flag, no second tool taxonomy
- [ ] Every inbound `tools/call` routes through `executePluginTool()` — timeout + `gatePluginToolsByRole` identical to in-process calls
- [ ] Unauthenticated HTTP transport refused (loopback-only or bearer); documented trust boundary matches `docs/spec/integrations-architecture.md:86`
- [ ] Tests: export-flag filtering, auth refusal, one end-to-end `tools/call` against the plugin registry
- [ ] `bun run check` green

## Technical Notes

- MCP spec position "tools = arbitrary code execution" applies doubly to exposing ours: the role gate is the security boundary, not network location.
