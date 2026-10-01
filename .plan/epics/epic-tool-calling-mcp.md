<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Agent Tool-Calling & MCP Connector Surface

**Status:** Not Started
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** tool-calling, mcp, cross-cutting
**Related:** epic-platform-integrations.md, epic-workflow-engine.md, epic-assistant-gm-flows.md, epic-actor-autonomy-story-drive.md, epic-byok-api-keys.md, epic-plugin-system.md

## Summary

Define a cross-cutting tool schema that lets LLM-driven agents (assistant, GM, NPC autonomy, user-as-operator workspace) invoke loop-lore subsystems through structured function-call interfaces, plus the runtime that maps tool calls onto existing services (inventory, combat, quest, social, asset, lore, memory), plus MCP-compatible client/server surfaces so external MCP servers can plug in as tool providers.

## Scope

1. **Tool schema registry** — single source of truth for every tool the LLM can invoke. One TypeBox schema per tool (`tool_inventory_list`, `tool_inventory_transfer`, `tool_combat_initiate`, `tool_quest_accept`, `tool_social_relationship_update`, etc.). Mirror the registration pattern used by `src/plugins/registry.ts`.
2. **Tool runtime** — dispatcher that takes an LLM tool-call payload, validates against the registry, applies access control, invokes the underlying service, and returns a typed result. Reuse the existing per-route handlers; the runtime is glue.
3. **MCP client** — connect to external MCP servers (via stdio / SSE) and expose their tools through the same registry. Negotiate capabilities at session start.
4. **MCP server** — expose a subset of loop-lore tools to *external* MCP clients (e.g. another agent runtime). Server-operator feature flag.
5. **Tool palette UI** — end-user surface to see what tools the current agent has access to, audit invocations, and revoke per-session.
6. **Audit** — every tool invocation writes an `audit_events` row with input + output + actor + tool-name. Reuse `src/audit/`.
7. **First-wave subsystem tool definitions** — Inventory, Combat, Quest, Social, Asset, Lore, Memory, World (8 first-wave tools).

## Work Items

- [ ] Tool schema registry + TypeBox per tool
- [ ] Tool runtime dispatcher + access control integration
- [ ] MCP client (stdio + SSE transports)
- [ ] MCP server (operator-flagged subset)
- [ ] Tool palette UI
- [ ] Audit surface
- [ ] Subsystem tool definitions for: Inventory, Combat, Quest, Social, Asset, Lore, Memory, World (8 first-wave)

## Acceptance Criteria

- [ ] Tool registry in `src/tools/registry.ts` with at least Inventory + Combat + Quest + Social + Asset tools wired
- [ ] Tool runtime round-trips in < 50ms p95 for in-process tools
- [ ] MCP client connects to a public MCP server (e.g. `@modelcontextprotocol/server-filesystem`) and exposes its tools through the registry
- [ ] MCP server exposes 3+ loop-lore tools to an external MCP client; access controlled
- [ ] Tool palette UI surfaces the current agent's tools + invocation log
- [ ] All invocations audited

## Rationale

The matrix audit (G42) flagged tool-calling / MCP as the **broadest integration gap** — "Define tool schemas for each RPG subsystem; tool-calling agent invokes RPG actions via structured interface." Currently the gap is real:

1. **No tool schemas exist** for any RPG subsystem. `epic-inventory-ui.md` ships UI but not a structured function-call surface.
2. **No dispatcher** — even if a tool schema existed, no runtime maps tool-call payloads onto existing service handlers.
3. **No MCP surface** — neither client nor server. External MCP servers (filesystem, GitHub, Postgres) cannot be used as agent tools.
4. **No audit trail** — when a future LLM invokes a tool, there is no per-call audit row.

Without this epic, every consumer (`epic-assistant-gm-flows.md`, `epic-actor-autonomy-story-drive.md`, `epic-workflow-engine.md`, future user-as-operator workspace) reinvents tool-calling from scratch — leading to the same fragmentation problem the matrix already documents for character-as-agent (G18–G20).

## Open Questions

1. **Blocking vs out-of-band** — should the tool runtime be inside the LLM request path (blocking tool result before response) or out-of-band (queued, processed async, surfaced as side-channel events)? Matrix gap G46 (interrupt semantics) suggests out-of-band; the existing streaming implementation may inform this.
2. **Per-user tool allow-list vs role-based** — should an admin define which tools a *role* (player / GM / NPC / operator) can call, or should each user configure their own tool list?
3. **MCP server scope** — what's the minimum subset of tools safe to expose to external MCP clients? Operator-controlled flags per tool?
4. **Tool schema versioning** — when a tool's signature changes, how do old LLM tool-calls fail gracefully? Use a `tool_version` field?
5. **Cost attribution** — when an agent invokes 8 tools in one turn, how is the cost split between the user, the operator, and the upstream provider?
6. **Cross-instance tool calls** — if the agent is federated and the tool target lives on a peer, does the MCP surface subsume this or do we need a separate epic?
7. **Conflict with `epic-platform-integrations.md`** — the provider adapter epic is the natural neighbor. Should the tool-calling epic be a sibling or a sub-epic of platform-integrations?

## Dependencies

- `epic-platform-integrations.md` — provider adapters (sibling; provider vs tool surface)
- `epic-workflow-engine.md` — internal Run sessions (the tool runtime may use these for orchestration)
- `epic-assistant-gm-flows.md` — consumer (GM flows call tools during autonomous turns)
- `epic-actor-autonomy-story-drive.md` — consumer (NPC autonomy uses tools)
- `epic-byok-api-keys.md` — auth chain (tools run under user API keys)
- `epic-plugin-system.md` — plugin surface (tools can be contributed by plugins)
- `epic-analytics-observability.md` — audit ingest (or use existing `src/audit/`)
