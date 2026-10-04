<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Agent Tool-Calling & MCP Connector Surface

**Tags:** (none)
**Overview:** (see sections below)

**Status:** Not Started
**Priority:** Medium (matrix High future severity, but P6+ deferred under 0.1.0 alignment)
**Effort:** Large
**Type:** Feature Epic

## Summary

Define a cross-cutting tool schema that lets LLM-driven agents (assistant, GM, NPC autonomy, user-as-operator workspace) invoke loop-lore subsystems through structured function-call interfaces, plus the runtime that maps tool calls onto existing services (inventory, combat, quest, social, asset, lore, memory), plus MCP-compatible client/server surfaces so external MCP servers can plug in as tool providers.

What exists today is plugin-scoped, not subsystem-scoped: `src/plugins/registry.ts` (`addTools`/`getAllTools`) plus `src/plugins/tool-executor.ts` (`executePluginTool`, timeout + `isError` contract) give a registration + execution pattern, and `src/generation/generate-route/tool-execution.ts` already routes every generation-path tool through that executor. What does NOT exist: tool schemas for any RPG subsystem, an MCP transport in either direction, a user-facing tool palette, or a per-invocation audit trail. Consumers (`epic-assistant-gm-flows.md`, `epic-actor-autonomy-story-drive.md`, `epic-workflow-engine.md`) would otherwise each reinvent this surface.

## Scope

1. **Tool schema registry** — single source of truth for every tool the LLM can invoke. One schema per tool (`tool_inventory_list`, `tool_inventory_transfer`, `tool_combat_initiate`, `tool_quest_accept`, `tool_social_relationship_update`, ...). New `src/tools/registry.ts`, mirroring the registration pattern in `src/plugins/registry.ts`; tool shapes follow `ToolDefinition` in `src/plugins/types.ts`.
2. **Tool runtime dispatcher** — takes an LLM tool-call payload, validates against the registry, applies access control via the existing permissions surface (`src/users/permissions.ts`, `can`), invokes the underlying service, returns a typed result. Extends the `executePluginTool` pattern in `src/plugins/tool-executor.ts`; generation-path execution stays in `src/generation/generate-route/tool-execution.ts`.
3. **MCP client (new)** — connect to external MCP servers (stdio / SSE), negotiate capabilities at session start, expose their tools through the same registry.
4. **MCP server (new)** — expose an operator-flagged subset of loop-lore tools to external MCP clients.
5. **Tool palette UI (new)** — current agent's tools, invocation log, per-session revoke.
6. **Audit (new)** — every invocation records actor + tool-name + input + output; no unlogged tool path ships.
7. **First-wave subsystem tools** — Inventory, Combat, Quest, Social, Asset, Lore, Memory, World definitions landing through the registry.

## Non-Goals

- Provider adapters for LLM/image/voice models — owned by `epic-platform-integrations.md` (sibling: provider surface vs tool surface).
- Decision intelligence itself (BDI plans, reactions) — owned by `epic-agency-story-points.md`; this epic only carries the calls.
- Movement/pathfinding internals, AI director tension scoring — host epics keep them.
- Cross-instance federated tool calls — open question; separate epic only if the MCP surface cannot subsume it.
- Tool schema versioning policy beyond a `tool_version` field convention (deferred until second tool generation).

## Acceptance Criteria

- [ ] Tool registry exists with at least Inventory + Combat + Quest + Social + Asset tools wired through the `src/plugins/registry.ts` registration pattern.
- [ ] Tool runtime round-trips in < 50ms p95 for in-process tools via the `executePluginTool` contract (`src/plugins/tool-executor.ts`).
- [ ] MCP client connects to a public MCP server and exposes its tools through the registry.
- [ ] MCP server exposes 3+ loop-lore tools to an external MCP client under access control.
- [ ] Tool palette UI surfaces the current agent's tools + invocation log with per-session revoke.
- [ ] All invocations audited (actor + tool-name + input + output); no unlogged path.

## Related

- `epic-platform-integrations.md` — provider adapters (sibling).
- `epic-workflow-engine.md` — internal Run sessions (runtime may use these for orchestration).
- `epic-assistant-gm-flows.md` — consumer (GM turns run through the generation pipeline in `src/story/game-master/execute.ts`).
- `epic-actor-autonomy-story-drive.md` — consumer (NPC autonomy dispatches through governed pipelines).
- `epic-byok-api-keys.md` — auth chain (tools run under user API keys).
- `epic-plugin-system.md` — plugin surface (tools can be contributed by plugins; see `src/assistant/prompt/sections/plugin-agent-role.ts` for the existing registry consumer).

## Source

Proposed by `.plan/tickets/IDEA-epic-tool-calling-mcp-2026-09-26.md` (left untouched); matrix reference `matrix-cross-mechanics.md` G42; inspiration: Convai tool-calling / MCP connectors (research sweep 2026-08-14).

git issue: 00000000
