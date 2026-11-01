<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Agentic integration surface (MCP + ACP + scoped REST)

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Promoted from evaluated research `.tmp/research/AgenticIntegration-MCPACP.md` + `.tmp/research/RSI-RepoAccess-EVALUATION.md` — amended per RSI-RepoAccess-EVALUATION Part 4; provisional defaults marked inline.
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** mcp, acp, agentic, facade, api-keys, streamable-http, capability-manifest, integration-tests
**Depends on:** epic-principal-scoped-credentials.md
**Related Epics:** epic-principal-scoped-credentials.md, epic-external-harness-acp.md, epic-api-openapi.md, epic-plugin-system.md, epic-harness-rsi-repo-access.md

## Summary

Expose loop-lore as a stable, scoped, documented agentic surface: MCP server (stdio + optional Streamable HTTP), ACP server (stdio NDJSON, ACP v1), and a service facade over existing chat/generation services. Amended per evaluation: facade-level authorization (access control is ROUTE-level and a guard-skipping facade bypasses every guard), dependency on the shared principal/credentials epic only (RSI Part B / repo-access coupling removed), protocol SDKs adopted, Streamable HTTP replaces deprecated HTTP/SSE.

## Protocol pins

- MCP: spec revision 2026-07-28 pinned in code (Streamable HTTP transport; HTTP+SSE deprecated since 2025-03-26; protocol-level sessions removed). Tool descriptions/schemas treated as untrusted-adjacent input.
- ACP: v1 pinned (schema `agentclientprotocol/agent-client-protocol`); v2 out of scope until needed.

## SDK decision (provisional — owner may override, evaluation §5 Q7)

Adopt `@modelcontextprotocol/sdk` + the official ACP TS SDK rather than hand-rolled JSON-RPC/NDJSON framing (spec-drift precedent: SSE deprecation, session removal). `banned-patterns.md:71-75` (own-abstraction stance) does not prohibit protocol SDKs — ruling recorded.

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

- §5 Q4 credentials story (scoped admin-issued tokens vs OAuth-style): OPEN.
- §5 Q7 protocol SDK deps: adopted (provisional).
- §B8 docs wiring from the op registry: proposal; single-source requirement stands.
