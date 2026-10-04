<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA-epic-tool-calling-mcp-2026-09-26: Tool-Calling / MCP Connectors — cross-cutting epic proposal

**Status:** Not Started
**Priority:** medium (P6+ per matrix, but 🔴 High future impact)
**Effort:** Large
**Type:** Research
**Summary:** `matrix-cross-mechanics.md` G42 names Tool-Calling / MCP as the "broadest integration gap — touches entire matrix." No epic owns the cross-cutting tool schema, the agent runtime, or the MCP client/server surfaces. `epic-platform-integrations.md` covers provider adapters (LLM/image/voice) but **not** agent-facing tool schemas (inventory, combat, quest, social, asset). This ticket proposes a new epic to close the gap.
**Context:** Source row: 2026-09-26 epic audit; matrix reference: `matrix-cross-mechanics.md` G42; inspiration source: Convai tool-calling / MCP connectors (research sweep 2026-08-14). Existing related work: `epic-workflow-engine.md` (internal Run sessions), `epic-assistant-gm-flows.md` (in-character autonomous behavior), `epic-byok-api-keys.md` (per-user provider keys).

## Suggested epic description

### Title

`epic-tool-calling-mcp.md` — Agent Tool-Calling & MCP Connector Surface

### Status / Priority / Effort / Type

- Status: Not Started
- Priority: Medium (matrix 🔴 High future severity, but P6+ deferred under 0.1.0 alignment)
- Effort: Large (cross-cutting: schema + runtime + UI + 5+ subsystem integrations)
- Type: Feature Epic

### Summary

Define a cross-cutting tool schema that lets LLM-driven agents (assistant, GM, NPC autonomy, user-as-operator workspace) invoke loop-lore subsystems through structured function-call interfaces, plus the runtime that maps tool calls onto existing services (inventory, combat, quest, social, asset, lore, memory), plus MCP-compatible client/server surfaces so external MCP servers can plug in as tool providers.

### Scope

1. **Tool schema registry** — single source of truth for every tool the LLM can invoke. One TypeBox schema per tool (`tool_inventory_list`, `tool_inventory_transfer`, `tool_combat_initiate`, `tool_quest_accept`, `tool_social_relationship_update`, etc.). Mirror the registration pattern used by `src/plugins/registry.ts`.
2. **Tool runtime** — dispatcher that takes an LLM tool-call payload, validates against the registry, applies access control via `src/auth/factors/`, invokes the underlying service, and returns a typed result. Reuse the existing per-route handlers; the runtime is glue.
3. **MCP client** — connect to external MCP servers (via stdio / SSE) and expose their tools through the same registry. Negotiate capabilities at session start.
4. **MCP server** — expose a subset of loop-lore tools to *external* MCP clients (e.g. another agent runtime). Server-operator feature flag.
5. **Tool palette UI** — end-user surface to see what tools the current agent has access to, audit invocations, and revoke per-session.
6. **Audit** — every tool invocation writes an `audit_events` row with input + output + actor + tool-name. Reuse `src/audit/`.

### Tasks

- [ ] Tool schema registry + TypeBox per tool
- [ ] Tool runtime dispatcher + access control integration
- [ ] MCP client (stdio + SSE transports)
- [ ] MCP server (operator-flagged subset)
- [ ] Tool palette UI
- [ ] Audit surface
- [ ] Subsystem tool definitions for: Inventory, Combat, Quest, Social, Asset, Lore, Memory, World (8 first-wave)

**Acceptance Criteria:**
- [ ] Tool registry in `src/tools/registry.ts` with at least Inventory + Combat + Quest + Social + Asset tools wired
- [ ] Tool runtime round-trips in < 50ms p95 for in-process tools
- [ ] MCP client connects to a public MCP server (e.g. `@modelcontextprotocol/server-filesystem`) and exposes its tools through the registry
- [ ] MCP server exposes 3+ loop-lore tools to an external MCP client; access controlled
- [ ] Tool palette UI surfaces the current agent's tools + invocation log
- [ ] All invocations audited

### Related Epics

- `epic-platform-integrations.md` — provider adapters (sibling; provider vs tool surface)
- `epic-workflow-engine.md` — internal Run sessions (the tool runtime may use these for orchestration)
- `epic-assistant-gm-flows.md` — consumer (GM flows call tools during autonomous turns)
- `epic-actor-autonomy-story-drive.md` — consumer (NPC autonomy uses tools)
- `epic-byok-api-keys.md` — auth chain (tools run under user API keys)
- `epic-plugin-system.md` — plugin surface (tools can be contributed by plugins)
- `epic-audit-observability.md` — audit ingest

## Rationale

The matrix audit (2026-08-14) flagged G42 as the **broadest integration gap** — "Define tool schemas for each RPG subsystem; tool-calling agent invokes RPG actions via structured interface." Currently the gap is real:

1. **No tool schemas exist** for any RPG subsystem. `epic-inventory-ui.md` ships UI but not a structured function-call surface.
2. **No dispatcher** — even if a tool schema existed, no runtime maps tool-call payloads onto existing service handlers.
3. **No MCP surface** — neither client nor server. External MCP servers (filesystem, GitHub, Postgres) cannot be used as agent tools.
4. **No audit trail** — when a future LLM invokes a tool, there is no per-call audit row.

Without this epic, every consumer (`epic-assistant-gm-flows.md`, `epic-actor-autonomy-story-drive.md`, `epic-workflow-engine.md`, future user-as-operator workspace) reinvents tool-calling from scratch — leading to the same fragmentation problem the matrix already documents for character-as-agent (G18–G20).

## Open questions

1. Should the tool runtime be **inside the LLM request path** (blocking tool result before response) or **out-of-band** (queued, processed async, surfaced as side-channel events)? Matrix gap G46 (interrupt semantics) suggests out-of-band; the existing `src/generation/streaming` already implements stream-truncate semantics that the tool runtime should reuse.
2. **Per-user tool allow-list vs role-based** — should an admin define which tools a *role* (player / GM / NPC / operator) can call, or should each user configure their own tool list? Matrix doesn't say.
3. **MCP server scope** — what's the minimum subset of tools safe to expose to external MCP clients? Operator-controlled flags per tool?
4. **Tool schema versioning** — when a tool's signature changes (e.g. `tool_inventory_transfer` adds an `urgency` parameter), how do old LLM tool-calls fail gracefully? Use a `tool_version` field?
5. **Cost attribution** — when an agent invokes 8 tools in one turn, how is the cost split between the user, the operator, and the upstream provider?
6. **Cross-instance tool calls** — if the agent is federated and the tool target lives on a peer, does the MCP surface subsume this or do we need a separate `epic-tool-calling-mcp-federation.md`?
7. **Conflict with `epic-platform-integrations.md`** — the provider adapter epic is the natural neighbor. Should the tool-calling epic be a sibling or a sub-epic of platform-integrations?

**Tags:** idea, matrix-gap, g42, tool-calling, mcp, cross-cutting
**Related:** .plan/matrix-cross-mechanics.md (G42), .plan/epics/epic-platform-integrations.md, .plan/epics/epic-workflow-engine.md, .plan/epics/epic-assistant-gm-flows.md, .plan/epics/epic-plugin-system.md, .plan/backlog/open-untriaged.md

git issue: 00000000
