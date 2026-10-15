<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: External Creative Tool Bridge (MCP)

**Overview:** (see sections below)


**Status:** Not Started
**Priority:** High
**Effort:** Very High
**Type:** Feature Epic
**Tags:** mcp, external-tools, creative-studio, plugins, async-jobs, security
**Related Epics:** epic-plugin-system.md, epic-platform-integrations.md, epic-creative-studio.md, epic-asset-platform-capabilities.md, epic-security-sandboxing.md

## Summary

Bring external creative applications into loop-lore as first-class **tool servers over the Model Context Protocol (MCP)**, so the assistant and the workflow engine can drive deterministic editing (crop, rotate, filter, export) and long-running jobs (render, batch export) without a bespoke adapter per application. Second half: adopt MCP's **Tasks** extension as the house state machine for every long-running external operation, which is also the crash-resumable primitive `ServerExternalManager` lacks today.

Why MCP and not per-app SDKs: llama-swap supervises the OpenAI-compatible model family only. Blender, Krita, LibreOffice, GIMP and Inkscape are not OpenAI-compatible, so a per-app adapter is required for each. MCP is a published protocol with a TS SDK and a stable spec revision, so the adapter is written once and consumed by every app that ships an MCP server.

## Current State (verified 2026-10-15)

- **No MCP client in the source tree.** Confirmed three independent ways: `docs/research/harness-mcp-wiring.md:301` ("no MCP-related code in the source tree"), `docs/research/roadmap-tracker.md:75`, and `docs/research/doc-00-index.md:40`.
- `docs/spec/integrations-architecture.md:86` **already reserves `src/integrations/mcp/`** as the bridge home; `code-map.json:31460` maps `src/plugins/mcp/client.ts` to a target ticket. The shot-caller passes for the target directory already exist.
- MCP spec revision **2026-07-28**: JSON-RPC 2.0, stateless, per-request capability negotiation. Server features = Resources, Prompts, Tools; client feature = Elicitation. Extensions: **Tasks**, Skills-over-MCP, MCP Apps.
- Spec security position, quoted: *"Tools represent arbitrary code execution and must be treated with appropriate caution"*, and tool annotations *"MUST be treated as untrusted unless the server is trusted".*
- Plugin `ToolDefinition` (`src/plugins/types.ts`) carries `parameters`, `timeoutMs`, `sandboxed`. `executePluginTool` (`src/plugins/tool-executor.ts`) enforces only `timeoutMs` (default `DEFAULT_TOOL_TIMEOUT_MS = 30_000`); `sandboxed` is read nowhere in `src/` — a **dead field** today.
- Related open work: `TASK-workspace-mcp-bridge-on-openclaw-serve-registry-pattern` (workspace-scoped bridge), `TASK-2026-openwebui-mcp-client-skeleton` (generic client wrapper), `epic-tool-calling-mcp.md`.

### Known blocker in existing plan tickets

`TASK-2026-openwebui-mcp-client-skeleton.md` proposes the client but designs a **closed connection pool built around a Python `AsyncExitStack`** — a Python asyncio idiom. The TS SDK's `stdio` transport already takes an `onclose` callback and kills the child process itself. Executing that ticket verbatim would re-implement the SDK inside a Python shape. The ticket must be rewritten before it is picked up; this epic's batch B1 owns that rewrite.

### Unverified external claims — resolve before writing app adapters

These came from external research and are **not upstream-verified**. Each must be confirmed (repo last commit, README, published tool list) before its adapter ticket starts:

| Claim | Status |
| --- | --- |
| Krita has an MCP server exposing ~40 tools (as `krita-cli`, PyPI) | **Unverified** — contradicts one research doc's explicit "no MCP server for Krita". Resolve with `pip show krita-cli` plus the repo's last commit. |
| Blender has an MCP server | Unverified. |
| LibreOffice / GIMP / Inkscape have MCP servers | Unverified. |

## Batches (each independently shippable)

### B1 — Generic MCP client (no app-specific work)

A `src/integrations/mcp/client.ts` that speaks the 2026-07-28 revision over both `stdio` and `streamable-http`, using the official TS SDK, with connection lifecycle delegated to the SDK's `onclose`. No tool semantics, no creative-app knowledge. Rewrites `TASK-2026-openwebui-mcp-client-skeleton`.

### B2 — External tool -> plugin `ToolDefinition` bridge

Map MCP tool descriptors (`name`, `inputSchema`, annotations) onto the existing `ToolDefinition` shape so an MCP server's tools appear in the existing plugin tool surface and flow through `executePluginTool`. This is where the dead `sandboxed` field becomes a policy tag (see `epic-security-sandboxing.md`).

### B3 — Tasks extension as the long-operation state machine

Adopt `tasks/get`, `tasks/update`, `tasks/cancel`, the five statuses, `pollIntervalMs`/`ttlMs`, and durable `taskId` persistence as the house pattern for all long-running external work. Directly supplies the crash-resumable job spine that `epic-local-process-swarm.md` needs for external-process survivability.

### B4 — Per-app adapters (one ticket each, gated on B1+B2)

Krita, then Blender, then LibreOffice/GIMP/Inkscape. Each only after the app's MCP server is verified in the table above.

## Non-Goals

- Re-implementing the MCP SDK.
- Transport or protocol forks.
- Replacing the plugin tool system — MCP tools are surfaced *through* it.
- Filesystem/network sandboxing inside MCP (that belongs to `epic-security-sandboxing.md`; MCP Tasks is a state machine, not a boundary).

## Sequencing

B1 -> B2 -> {B3, B4}. B3 is worth doing even if no creative-app adapter ever lands, because the state machine is reused by every long-running job in the platform.


git issue: bd11716
