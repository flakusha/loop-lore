<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Tool Calling and MCP Integration — External Tool Calling Surface

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** tool-calling, mcp, agents
**Related:** epic-platform-integrations.md, epic-assistant-gm-flows.md

## Summary

Cross-cutting tool schema letting LLM agents (assistant, GM, NPC autonomy,
operator workspace) invoke subsystems via structured calls, plus
MCP-compatible client/server surfaces so external MCP servers plug in as
tool providers. Provider adapters stay in `epic-platform-integrations.md`;
this epic owns the agent-facing tool surface.

## Scope

- Tool schema registry: one TypeBox schema per tool (inventory, combat, quest, social, asset, lore, memory, world).
- Tool runtime dispatcher: validate, access-control, invoke service, typed result.
- MCP client (stdio + SSE) exposing external tools through registry.
- MCP server (operator-flagged subset) for external clients.
- Tool palette UI + per-session audit via `audit_events`.

## Tasks

- [ ] Registry + TypeBox schemas (first wave: 8 subsystems).
- [ ] Runtime dispatcher + auth integration.
- [ ] MCP client (stdio + SSE, capability negotiation).
- [ ] MCP server (flagged subset).
- [ ] Palette UI (tools + invocation log + revoke).
- [ ] Audit surface for every invocation.
- [ ] OpenWebUI renderer / grants / stream-interleaving / valves wiring.

## Acceptance Criteria

- [ ] Registry round-trips in-process tools < 50ms p95.
- [ ] Client exposes a public MCP server's tools through registry.
- [ ] Server exposes 3+ tools to an external client, access-controlled.
- [ ] Palette shows tools + log; revoke works per session.
- [ ] Every invocation audited with input + output + actor.

## Linked Tickets

| # | Ticket |
| - | ------ |
| 1 | `TASK-2026-openwebui-mcp-client-skeleton.md` |
| 2 | `TASK-2026-openwebui-structured-toolcall-renderer.md` |
| 3 | `TASK-2026-openwebui-tool-access-grants.md` |
| 4 | `TASK-2026-openwebui-tool-stream-interleaving.md` |
| 5 | `TASK-2026-openwebui-tool-valves-panel.md` |
| 6 | `TASK-odysseus-manage-tool-parity-evaluation.md` |
| 7 | `TASK-odysseus-style-external-agent-integration-surface.md` |
| 8 | `TASK-tool-call-user-text-sanitization.md` |
| 9 | `TASK-tool-calling-agents.md` |
| 10 | `FEAT-tool-agent-output-parsing-distinct-from-narrative.md` |
| 11 | `TASK-classifier-model-survey-message-intent-memory-ranking-emotio.md` |
