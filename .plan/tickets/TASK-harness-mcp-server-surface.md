<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: MCP server surface (stdio, operator-flagged)

**Status:** In Progress
**Status Note:** Shipped on dev — the stdio inbound MCP server (`src/integrations/mcp/stdio-server.ts:21,141`) and the HTTP surface (`src/integrations/mcp/http-server.ts:52,441`) are live. The open legs are the operator export-flag filter decision and the trust-boundary write-up, not a missing transport.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-harness-integration
**Depends on:** `TASK-harness-mcp-client-wrapper`
**Related:** docs/meta/research/harness-mcp-wiring.md, epic-external-creative-tool-bridge.md

**Summary:**

Reconcile the MCP server surface against what actually shipped. The stdio inbound MCP server is already live (`src/integrations/mcp/stdio-server.ts`, `connectInboundMcpServer`, `main`); tools derive from the facade op manifest and execute through `runFacadeOp` with a server-resolved principal. The original premise (no MCP surface; export-flag filter + `executePluginTool()` bridge) is stale.

**Context:**

Shipped: `src/integrations/mcp/stdio-server.ts` attaches `buildMcpServer` to `StdioServerTransport`, gated by `buildInboundFacadeContext` (deny-by-default admission, operator-configured principal, facade tier ladder). `src/integrations/mcp/http-server.ts` + `http-allowlist.ts` cover the HTTP surface. Before filing any new MCP ticket, decide whether the remaining gap is the operator export-flag filter (facade manifest is broader than export-flagged subset) or only documentation; do not refile the stdio transport itself.

**Acceptance Criteria:**

- [ ] Decision recorded: export-flag filter needed on top of facade op manifest, or already covered by facade tier ladder
- [ ] If needed, filter applied at the inbound seam without a second tool taxonomy; otherwise ticket closes as documentation-only
- [ ] Trust boundary documented against the shipped `buildInboundFacadeContext` admission gate
- [ ] No new stdio transport implementation (already shipped)

## Technical Notes

- MCP spec position "tools = arbitrary code execution" applies doubly to exposing ours: the role gate is the security boundary, not network location.

## 2026-11-25 reconciliation

Shipped: stdio (`src/integrations/mcp/stdio-server.ts:54,68,141`) and HTTP
(`src/integrations/mcp/http-server.ts:61,470`) both attach `buildMcpServer`
with a server-resolved principal. Residual scope is limited to the decision
and documentation ACs: record whether an export-flag filter is needed on top
of the facade manifest, apply it at the inbound seam only if needed, and
document the `buildInboundFacadeContext` trust boundary. No transport work
remains; status stays In Progress on those legs.


git issue: 5e63952
