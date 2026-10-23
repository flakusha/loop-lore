<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Open WebUI Parity

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** P2
**Effort:** Large
**Type:** Feature Epic / Frontend-Backend Parity
**Tags:** openwebui, parity, sse, streaming, tool-calling
**Issue:** (none)

## Summary

Open WebUI defines the de-facto UX contract for local LLM frontends. This epic
closes the parity gaps one surface at a time: SSE reconnect/replay so a dropped
socket never loses a stream, a typed stream-event registry instead of ad-hoc
payload shapes, thinking-block rendering, a structured tool-call renderer with
tool-stream interleaving, tool access grants, a valves-style settings panel,
retry-from-point, and cancel-generation wiring end to end.

## Scope

1. **SSE resilience**: reconnect with replay so in-flight generations survive
   transport drops.
2. **Stream contract**: a registry of stream event types; thinking blocks and
   tool calls rendered as first-class stream citizens, interleaved in order.
3. **Tool surface**: structured tool-call renderer, tool access grants.
4. **Generation controls**: valves panel, retry-from-point, cancel-generation
   wiring from UI to the generation job.

## Tasks

- [ ] `TASK-2026-openwebui-sse-reconnect-replay` — SSE reconnect/replay
- [ ] `TASK-2026-openwebui-stream-event-type-registry` — stream event registry
- [ ] `TASK-2026-openwebui-thinking-block-render` — thinking-block rendering
- [ ] `TASK-2026-openwebui-structured-toolcall-renderer` — structured tool-call renderer
- [ ] `TASK-2026-openwebui-tool-stream-interleaving` — tool stream interleaving
- [ ] `TASK-2026-openwebui-tool-access-grants` — tool access grants
- [ ] `TASK-2026-openwebui-tool-valves-panel` — valves panel
- [ ] `TASK-2026-openwebui-retry-from-point` — retry-from-point
- [ ] `TASK-2026-openwebui-cancel-generation-wiring` — cancel-generation wiring

## Acceptance Criteria

- [ ] A dropped SSE connection resumes the same generation without loss or duplication
- [ ] All stream events are typed and rendered (thinking, tool calls, text) in interleaved order
- [ ] Tool calls render structurally with grant-gated access
- [ ] Valves panel, retry-from-point, and cancel generation work end to end with tests

## Related Epics

- `epic-external-creative-tool-bridge.md` — hosts the MCP client skeleton (re-homed)
- `epic-comfyui-plugin.md` — hosts ComfyUI websocket progress (re-homed)
- `epic-generation-flow-control.md` — generation job lifecycle this UI wires into

## Bind Tickets

- `TASK-2026-openwebui-sse-reconnect-replay.md` (open)
- `TASK-2026-openwebui-stream-event-type-registry.md` (open)
- `TASK-2026-openwebui-thinking-block-render.md` (open)
- `TASK-2026-openwebui-structured-toolcall-renderer.md` (open)
- `TASK-2026-openwebui-tool-stream-interleaving.md` (open)
- `TASK-2026-openwebui-tool-access-grants.md` (open)
- `TASK-2026-openwebui-tool-valves-panel.md` (open)
- `TASK-2026-openwebui-retry-from-point.md` (open)
- `TASK-2026-openwebui-cancel-generation-wiring.md` (open)
