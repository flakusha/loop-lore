<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Agentic integration tests

**Status:** Done
**Status Note:** scope narrowed to the DELIVERED seam (see Scope decision) — the inbound ACP stdio server and the MCP stdio transport remain open in their own tickets.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-agentic-integration-mcp-acp
**Tags:** mcp, acp, testing
**Depends on:** `TASK-mcp-tool-set-v1-from-facade-registry`, `TASK-acp-stdio-server-over-existing-chat-sessions`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

External client drives a chat turn through MCP and ACP; asserts auth scopes enforced (read-only key cannot write) and that per-op ownership/rate-limit/audit checks fire (amendment B1).
Parallel-safe resource contract (amendment B7): one server child + pipe pair per test killed in afterEach, port 0 for HTTP, per-test :memory: DB, documented resource-contract comments (repo precedent: fake-acp-server.ts:12-15).
AC: both MCP and ACP paths covered; unauthorized ops denied with 403-class results.

**Context:**

The epic's agentic surface is delivered in two halves: a facade op registry (`src/integrations/loop-lore-facade/`) with per-op authorization, budget, and audit, exposed over the MCP SDK transport and the facade REST op route; and the outbound ACP stack (`src/integrations/harness/`) where loop-lore drives an external harness as an ACP CLIENT. The inbound servers the epic also describes (an MCP stdio server, an ACP stdio server) are separate tickets whose surfaces do not exist yet. This ticket therefore covers what the seam actually offers: an external client (holding a scoped `llri_` integration token) drives a turn through the MCP transport, and loop-lore drives a turn through the ACP wire — asserting that the authorization, ownership, budget, and audit checks on those paths really fire.

**Scope decision (2026-11-07):** option (b) — narrow AC1 to the DELIVERED seam; this ticket does NOT implement an MCP/ACP stdio server surface.

Reason: the inbound servers belong to other tickets and their surfaces are missing, so implementing them here would duplicate another ticket's scope, add a protocol dependency (the bun.lock churn that held this ticket), and hand-roll ACP framing the epic forbids (ruling against hand-rolled framing stands).

Evidence:
- MCP path — DELIVERED, but at `src/integrations/loop-lore-facade/mcp/` (SDK `Server` over the facade op registry, HTTP JSON-RPC transport), not at the epic's `src/integrations/mcp/server.ts`. A second stdio server would duplicate it. The scoped-credential seam (`src/middleware/auth/integration-token.ts`, migration 097) and the facade's authorization surfaces (`authz.ts` scope ladder, `rate-limit.ts`, `audit.ts`) are landed.
- ACP path — DELIVERED as loop-lore-as-ACP-CLIENT: `src/integrations/harness/generic-acp.ts` + adapters + `dispatch.ts`, the isolation gate (`isolation-gate.ts`), and the fail-closed permission policy/queue. `src/integrations/acp/` does not exist: the inbound ACP stdio server is `TASK-acp-stdio-server-over-existing-chat-sessions` (Not Started, Large) and needs the official ACP TS SDK, which is not a dependency (the epic pins it as pending the ACP slice).

Coverage added:
- `src/integrations/loop-lore-facade/mcp/scoped-agent.test.ts` — the MCP transport and the facade REST op route driven with REAL integration tokens through the real auth middleware and the real central guard: a read-only token is refused `chat.send` with the facade's 403-class `forbidden` body over MCP (`isError` content) and with a LITERAL 403 on the REST route (and the refused op writes no message); a chat-write token writes and its audit row carries the token attribution (subject binding + token scope); a token cannot touch a chat its subject does not own; an unknown token is 401; a token principal is confined to the integration surfaces; the governance budget answers `rate_limited` once the token's own bucket is drained.
- `src/integrations/harness/acp-authorization.test.ts` — the ACP path over a REAL child process speaking ACP (the `fake-acp-server` fixture): a write-shaped permission ask is parked for a human (never auto-allowed) and the harness is told `reject_once` when the human denies it; a caller without the admin role is refused (`role_denied`) before any turn runs (no message row, no exec-log line); the authorized admin caller drives a turn over the wire and the reply lands in the chat.

What stays EXPLICITLY OPEN (not this ticket's scope):
- the inbound ACP stdio server (`TASK-acp-stdio-server-over-existing-chat-sessions`) — loop-lore as an ACP SERVER does not exist, so no test can cover it until it lands;
- the MCP stdio transport — the delivered MCP transport is HTTP JSON-RPC (`POST /api/v1/integrations/mcp`); the SDK's `StdioServerTransport` is not wired (the epic's `TASK-mcp-stdio-server-via-typescript-sdk`);
- the remaining facade slices (assets/characters/memory/rpg) — only the chat + generation ops exist, so only those are covered.

Findings for the owner (NOT implemented on the delivered seam):
- audit rows are written for ADMITTED calls only: `runFacadeOp` returns the authorization/budget rejection BEFORE `writeFacadeAudit`, so a refused call leaves no `facade.op` audit row (the epic asks for "an audit row per facade call"). The tests assert the audit row on the admitted path; the refusal path's missing row is reported, not asserted as behaviour.
- ownership refusals answer 404, not 403 — the wrapped access seam's not-found-or-not-owner verdict (`chat.history` on a foreign chat). The 403-class refusal is the SCOPE refusal.
- the ACP path has no scope/rate-limit/audit surface of its own: its authorization is the admin-role gate plus the fail-closed permission approval. Per-op scope, ownership, budget, and audit live on the facade (MCP/REST) side.

**Acceptance Criteria:**

- [x] Both MCP and ACP paths covered — the DELIVERED MCP path (SDK transport over the facade registry, driven with scoped tokens) and the DELIVERED ACP path (loop-lore as ACP client over the real wire); the inbound ACP stdio server and the MCP stdio transport are open in their own tickets (see Scope decision).
- [x] Unauthorized ops denied with 403-class results — a read-only token's write op is refused with the facade's 403-class `forbidden` body over MCP and with a literal 403 on the facade REST op route; an unknown token is 401; a token principal is 401 on any non-integration surface; on the ACP path an unauthorized caller is refused (`role_denied`) and an unapproved write ask is answered `reject_once`.
- [x] Auth scopes enforced (read-only key cannot write); per-op ownership/rate-limit/audit checks fire — the scope ladder (`read` < `chat-write`) refuses the write op and still admits the read op; a token cannot touch a foreign chat; the governance budget answers `rate_limited`; the audit row lands with the token attribution. The audit gap for REFUSED calls is reported above.
