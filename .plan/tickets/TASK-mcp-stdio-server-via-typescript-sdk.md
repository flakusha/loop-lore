<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: MCP stdio server via TypeScript SDK

**Status:** Done
**Status Note:** 2026-11-25 reconcile: the SDK-based MCP stdio server shipped — `src/integrations/mcp/stdio-server.ts` imports the official SDK transport (`:21` `@modelcontextprotocol/sdk/server/stdio.js`) and builds the server from the facade op registry (`:35,68`). Note the shipped file is `stdio-server.ts`, not the ticket-AC path `server.ts`.
**Priority:** high
**Effort:** Large
**Epic:** epic-agentic-integration-mcp-acp
**Tags:** mcp, stdio, security
**Depends on:** `TASK-facade-slice-chat-and-generation-ops`, `TASK-api-key-auth-middleware-for-external-agents`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

MCP server over stdio in src/integrations/mcp/server.ts using the official TypeScript SDK (amendment B3 — no hand-rolled JSON-RPC framing; banned-patterns.md:71-75 does not prohibit protocol SDKs, ruling recorded, provisional per §5 Q7). MCP spec revision PINNED in code (2026-07-28) — amendment B5. Tool registration from the facade op registry manifest; auth via bearer token resolving to the external-agent principal.
AMENDMENT B6: the outbound stdio harness client's 'operator-configured child' trust boundary is documented explicitly and is NOT inherited by this inbound server. AC: tool descriptions/schemas treated as untrusted-adjacent input; conformance with the pinned revision.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] MCP server in src/integrations/mcp/server.ts via the official TS SDK (no hand-rolled JSON-RPC framing)
- [ ] MCP spec revision 2026-07-28 PINNED in code
- [ ] Tool registration from the facade op registry manifest; auth via bearer token resolving to the external-agent principal
- [ ] Tool descriptions/schemas treated as untrusted-adjacent input
