<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: MCP client wrapper (ToolDefinition bridge)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `epic-harness-integration`
**Depends on:** `TASK-harness-lean-ctx-tools`
**Related:** docs/meta/research/harness-mcp-wiring.md, TASK-harness-mcp-config-section.md

**Summary:**

`McpClient` connecting over stdio and Streamable HTTP; every remote `listTools()` item becomes a `ToolDefinition` registered through the existing `registerTool()` hook; `callTool` results map to `ToolResult` with `isError` preserved; `onUnload()` closes transports. The reusable seam the other three MCP tickets hang off.

**Context:**

No MCP at runtime: no `@modelcontextprotocol` dependency, no client, no `ctx_*` in `src/` (`docs/meta/research/harness-mcp-wiring.md:40-42`). The plugin registry (`ToolDefinition` + `ToolExecutionContext` + `ToolResult`, `gatePluginToolsByRole`, `executePluginTool()` timeout) is already the right shape and wired to LLM egress — the wrapper only needs to map onto it, not beside it. Research doc §Task candidates 1 carries the full design.

**Acceptance Criteria:**

- [ ] `src/integrations/mcp/client.ts` connects stdio + Streamable HTTP; name namespacing and `inputSchema`→`parameters` mapping unit-tested; `isError` passthrough preserved; error result never throws
- [ ] Registration through `registerTool()`; role-gating + timeout semantics identical to native tools (no second tool-execution path)
- [ ] `onUnload()` closes every transport; unit tests cover the mapping surface
- [ ] SDK choice pinned per the doc's open question 1 (`@modelcontextprotocol/sdk@1.x` vs v2 split) — one dependency added, decision recorded in the ticket before code lands
- [ ] `bun run check` green

## Technical Notes

- Sandbox isolation is NOT in scope — MCP tools inherit whatever `TASK-harness-tool-sandbox` gives every tool.
- v1 surface excludes resources, prompts, sampling, elicitation, `outputSchema` (doc §Deliberately skipped).
