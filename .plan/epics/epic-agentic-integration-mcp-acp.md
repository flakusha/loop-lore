<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Agentic integration surface (MCP + ACP + scoped REST)

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Promoted from evaluated research `.tmp/research/AgenticIntegration-MCPACP.md` + `.tmp/research/RSI-RepoAccess-EVALUATION.md` — amended per RSI-RepoAccess-EVALUATION Part 4; provisional defaults marked inline. Landed in the tree: scoped-token facade seam + MCP transport tests (`scoped-agent.test.ts`: 403-class scope refusals, ownership/budget/audit over MCP and the facade REST op route) and ACP-client authorization tests (`acp-authorization.test.ts`: admin-role gate, parked write asks answered `reject_once`) — the narrowed integration-tests ticket is Done 3/3. Still open: the inbound MCP stdio server, the inbound ACP stdio server, and the remaining facade slices (assets/characters/memory/rpg).
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** mcp, acp, agentic, facade, api-keys, streamable-http, capability-manifest, integration-tests
**Depends on:** epic-principal-scoped-credentials.md
**Related Epics:** epic-principal-scoped-credentials.md, epic-external-harness-acp.md, epic-api-openapi.md, epic-plugin-system.md, epic-harness-rsi-repo-access.md

## Summary

Expose loop-lore as a stable, scoped, documented agentic surface: MCP server (stdio + optional Streamable HTTP), ACP server (stdio NDJSON, ACP v1), and a service facade over existing chat/generation services. Amended per evaluation: facade-level authorization (access control is ROUTE-level and a guard-skipping facade bypasses every guard), dependency on the shared principal/credentials epic only (RSI Part B / repo-access coupling removed), protocol SDKs adopted, Streamable HTTP replaces deprecated HTTP/SSE.

## Protocol pins

- MCP: the `@modelcontextprotocol/sdk` owns negotiation (SDK 1.32.2; a client requesting a revision newer than the SDK — e.g. 2026-07-28 — gets the SDK's latest per the spec downgrade rule). Streamable HTTP transport, stateless (no session ids, initialize tolerated per request; HTTP+SSE deprecated since 2025-03-26). Tool descriptions/schemas treated as untrusted-adjacent input.
- ACP: v1 pinned (schema `agentclientprotocol/agent-client-protocol`); v2 out of scope until needed.

## SDK decision (ADOPTED for MCP — evaluation §5 Q7)

`@modelcontextprotocol/sdk` is installed and owns the MCP protocol layer (`mcp/server.ts` + `mcp/bridge.ts` over an InMemoryTransport peer; hand-rolled JSON-RPC framing deleted). stdio needs no new work when a ticket asks for it — the same SDK `Server` attaches to `StdioServerTransport`. The ACP TS SDK remains to be adopted with the ACP slice (ruling against hand-rolled framing stands: spec-drift precedent — SSE deprecation, session removal; `banned-patterns.md:71-75` does not prohibit protocol SDKs).

## Facade authorization (evaluation BLOCKING fix)

Every facade op carries: scope + ownership checks per op, governance-equivalent rate limiting keyed on the API-key principal (stdio has no userId), and an audit row per facade call. Facade ops import the SAME typebox schemas from `src/validation/schemas` (never re-implement) and delegate authz to the shared principal middleware. The MCP HTTP transport enters the central guard as a NEW ALLOWLIST ENTRY — never a bypass; auth + governance apply with a principal in ctx; OAuth 2.1 noted for remote deployments. The outbound stdio harness client's 'operator-configured child' trust boundary is documented explicitly and is NOT inherited by the inbound servers.

## Design

### Layered, smallest first

1. Facade op registry `src/integrations/loop-lore-facade.ts`, sliced per domain — chat + generation first, remaining domains (assets/characters/memory/rpg) follow. Each registry entry carries typebox schemas + scope + summary/description metadata (single source of truth).
2. MCP server `src/integrations/mcp/server.ts` (stdio) via MCP TS SDK; tools from the registry manifest.
3. ACP server `src/integrations/acp/server.ts` (stdio NDJSON, ACP v1) via the ACP TS SDK; sessions map onto the EXISTING chats/generation model.
4. API-key auth → external-agent principal with scopes via the shared credential epic's fail-closed seam; rate limits per key.
5. Discovery: `/api/v1/capabilities`, MCP `tools/list`, and the docs tool table all GENERATE from the facade op registry (reusing the OpenAPI/VitePress pipeline; per-op metadata is the named prerequisite; the docs wiring itself is a proposal — owner may decline, the single-source requirement stands).
6. Plugin-contributed MCP tools (optional, after core) — same per-op authorization.

## Tasks

- [ ] Facade slice: chat + generation (op registry, per-op authz, rate limits, audit rows)
- [ ] Facade slice: remaining domains (assets/characters/memory/rpg)
- [ ] API-key auth middleware (external-agent principal; fail-closed seam sibling)
- [ ] MCP server (stdio) via TS SDK, pinned revision
- [ ] MCP tool set v1 (chat+gen first, then remaining domains)
- [ ] ACP server (stdio, ACP v1) over existing chats/generation
- [ ] Streamable HTTP MCP transport (new requireAuthGuard allowlist entry; OAuth 2.1 noted)
- [ ] Capability manifest + generated docs (from facade op registry)
- [ ] Plugin-contributed MCP tools (optional)
- [ ] Integration tests (parallel-safe resource contract)

## Non-goals

- No duplication of chat/generation logic (facade only).
- No replacement of REST/WS.
- No destructive admin ops over MCP by default.
- No MCP client mode (consuming external tools).
- No repo-root access, internal-service bootstrap, or escalation queue — those live in `epic-harness-rsi-repo-access.md`.

## Dependencies

Depends on `epic-principal-scoped-credentials.md` (principal kinds + scoped credentials). NO dependency on RSI Part B or the agent API boundary (chat-session hosting needs only facade + credentials — evaluation B7).

## Related Epics

`epic-principal-scoped-credentials.md`, `epic-external-harness-acp.md`, `epic-api-openapi.md`, `epic-plugin-system.md`, `epic-harness-rsi-repo-access.md`.

## DECISIONS (owner questions pending — RSI-RepoAccess-EVALUATION §5)

- §5 Q4 credentials story: DECIDED (2026-11-05) — admin/subscription harness API keys are LOCKED (ToS: 1 subscription = 1 person/user; the scoped-credential epic must not mint credentials backed by them). Research candidates, out of scope until a ticket exists: BYOK (user-supplied keys / local harness) and federation (federated instance runs its own harness, sharing DB/chat with the head/master instance). Recorded in `authz.ts` + `docs/spec/integrations-architecture.md`.
- §5 Q7 protocol SDK deps: ADOPTED for MCP (`@modelcontextprotocol/sdk` in-tree); ACP SDK pending the ACP slice.
- §B8 docs wiring from the op registry: proposal; single-source requirement stands.


git issue: f3a6d8e
