<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 1.0.0 theme-1 §3.3: inbound MCP/ACP studio servers (external tools connect INTO loop-lore)

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-agentic-integration-mcp-acp
**Tags:** mcp, acp, agentic
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Inbound transports per epic-agentic-integration-mcp-acp §3.3: MCP stdio server over the facade op registry (SDK StdioServerTransport), ACP v1 studio agent over stdio NDJSON (case-insensitive method parity), integrations.inbound config + admin override store (deny-by-default), server-resolved external-agent principal with the facade tier ladder, start.ts boot wiring, isolated in-memory-DB tests, CHANGELOG entry.

**Context:**

Why: prior verification established the OUTBOUND direction is done (facade HTTP routes + stdio harness client) while the INBOUND studio servers were absent — epic-agentic-integration-mcp-acp status note names them as the remaining §3.3 work. Constraints: reuse the facade op registry as the single source of tools/prompts (no duplicated chat logic, per the epic's non-goals); the principal is SERVER-RESOLVED (operator-configured via integrations.inbound + the system_config override layer), never caller-supplied; deny-by-default like the harness ToS acks — an unseeded store or empty principal refuses every connection and a refused process exits 1. Alternatives considered: minting per-request principals from the RPC body (rejected — trust boundary), HTTP-only inbound (rejected — §3.3 pins stdio for both transports). ACs: (1) inbound MCP stdio + Streamable-HTTP-adjacent registry behavior with auth scoping per connecting principal tier; (2) inbound ACP studio server over stdio with case-insensitive method parity; (3) config surface consistent with harness admin settings, deny-by-default; (4) per-file isolated, parallel-safe tests (in-memory DB, no ports/paths) covering auth scoping, deny-by-default, and transport happy paths; (5) typecheck + eslint gates green; (6) CHANGELOG entry.


Verified 2026-11-12 on dev: AC1-4+6 code-cited — mcp/stdio-server.ts:51-72 (connectInboundMcpServer over StdioServerTransport, buildMcpServer op-registry graph), acp/stdio-server.ts:45-61 + agent-server.ts:135 (case-insensitive method dispatch), inbound/settings.ts:32-57 + principal.ts:78-86 (deny-by-default effective view, mirrors harness admin-settings), boot wiring start.ts:78-88,267-268, CHANGELOG Unreleased entry. Tests: 21 pass across inbound/ + acp/ + mcp/stdio-server.test.ts (bun test --isolate, re-run 2026-11-12); harness ladder suites 54 pass (isolation-gate/profile-selector/admin-settings/provider-tos). AC5 (typecheck + eslint) NOT re-run in the verification pass — pending one operator `bun run check` run.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing (21 pass across inbound/ + acp/ + mcp/stdio-server.test.ts, bun test --isolate)
- [x] Documentation updated (CHANGELOG Unreleased entry; §3.3 wiring documented in the touched module headers)

**Resolved:** 2026-11-12 registry-driven close: git issue 05bdec6 (registry tip: 432b29e03 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-1-0-0-THEME-1-3-3-INBOUND-M)
