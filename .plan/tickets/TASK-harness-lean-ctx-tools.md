<!-- SPDX-License-Identifier: Apache-2.0 -->
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
- [ ] Capability catalog fronts the registered set: the agent enumerates tools by domain (structure / search / read / AST / LSP / patch / execute) and pulls per-domain usage detail on demand, instead of receiving every tool schema in the startup prompt.
- [ ] Command→tool resolution is 1:1 through the wrapper seam: a harness command resolves to a registered `ToolDefinition` (or MCP tool) before execution; unmapped/unknown commands fail fast at the boundary and never reach a shell or a raw file write.
- [ ] Role-gating (`gatePluginToolsByRole`), the `executePluginTool()` timeout/race, and sanitize + encrypted persist apply identically to catalog reads and tool calls.

## Related Files

- `src/plugins/types.ts`, `registry.ts`, `loader.ts`, `tool-executor.ts`, `src/generation/generate-route/tool-execution.ts`, `providers/types.ts`
- `src/assistant/prompt-assembler.ts`, `.rtk/filters.toml`, `.agents/references/agent-rules.md` (routing note)
- `TASK-harness-context-priority-tiers` (tier-0 manifest this catalog emits), `TASK-harness-skills-runtime` (trigger-matched detail channel)

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*


git issue: 9ab6eea
