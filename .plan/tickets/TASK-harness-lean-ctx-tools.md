<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness lean-ctx tools (MCP wrapper + anchored seam)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** One MCP client wrapper hanging lean-ctx tools off the plugin registry; all file/patch work through `ctx_patch`-shaped anchored ops; token saving via .rtk filters + purpose-keyed compress.
**Context:** No MCP at runtime (no `@modelcontextprotocol` dep, no MCPClient, no `ctx_*` in `src/`). Tool pattern is the plugin registry: `ToolDefinition` + `ToolExecutionContext` + `ToolResult` (`plugins/types.ts`), `registry.ts`, `tool-executor.ts` (30s race), `gatePluginToolsByRole`, `executeToolCalls()` (`generate-route/tool-execution.ts`) with sanitize + encrypted persist. Edit/patch today is scattered direct DB/file writes; `.rtk/filters.toml` is example-only.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] MCP client wrapper maps `ToolDefinition` ⇄ MCP tool schema; `ctx_read`/`ctx_patch`/`ctx_execute` registered via existing `registerTool()` hook; execution reuses `executePluginTool()` timeout + role-gating. LLM sees new tools, no execution-path fork.
- [ ] Anchored ops (line+hash from read) are the single file/patch seam; direct-write paths frozen for non-MCP callers; no per-route rewrites.
- [ ] Real filters activated in `.rtk/filters.toml` + purpose-keyed compress step in `PromptAssembler`; savings measured via `harness.call_completed.savedTokens`.
- [ ] Unit tests for wrapper mapping + anchored-op validation. Serena analogue (anchored read + patch + memory recall) documented, no new service.

## Related Files

- `src/plugins/types.ts`, `registry.ts`, `loader.ts`, `tool-executor.ts`, `src/generation/generate-route/tool-execution.ts`, `providers/types.ts`
- `src/assistant/prompt-assembler.ts`, `.rtk/filters.toml`, `.agents/references/agent-rules.md` (routing note)

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
