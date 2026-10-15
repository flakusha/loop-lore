<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: MCP tool descriptor to plugin ToolDefinition bridge

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-external-creative-tool-bridge

**Summary:**

Map MCP tool descriptors onto the existing plugin ToolDefinition so MCP tools flow through executePluginTool.

**Context:**

Verified 2026-10-15: plugin `ToolDefinition` (`src/plugins/types.ts`) carries `parameters`, `timeoutMs`, `sandboxed`; `executePluginTool` (`src/plugins/tool-executor.ts`, default `DEFAULT_TOOL_TIMEOUT_MS = 30_000`) enforces only `timeoutMs`. MCP tool descriptors expose `name`, `inputSchema` and annotations.

MCP spec position, quoted verbatim: *"Tools represent arbitrary code execution and must be treated with appropriate caution"*, and tool annotations *"MUST be treated as untrusted unless the server is trusted"*. That second clause is the governing constraint of this ticket — a server declaring `readOnlyHint: true` must not gain privilege.

Depends on `TASK-mcp-client-over-stdio-and-streamable-http`.

**Acceptance Criteria:**

- [ ] **Behaviour:** an MCP tool descriptor maps 1:1 onto `ToolDefinition` and the tool appears in the existing plugin tool listing.
- [ ] **Behaviour:** MCP tool arguments are validated against the descriptor's `inputSchema` before reaching `executePluginTool`.
- [ ] **Tests:** descriptor→definition mapping for required / optional / array / enum fields; two servers advertising the same tool name collide deterministically; a live server returning an empty tool list.
- [ ] **Edge cases:** tool name containing characters illegal in the plugin naming convention; `inputSchema` absent or not an object; annotations missing entirely; a tool returning a non-JSON content block.
- [ ] **Edge cases:** oversized `inputSchema` (deep nesting, many properties) must not exhaust the validator.
- [ ] **Security:** annotations (`readOnlyHint`, `destructiveHint`) are treated as **untrusted** — a tool declaring `readOnlyHint: true` is granted no elevated privilege; a test pins this.
- [ ] **Security:** an unknown/untrusted server cannot register tools into the shared plugin surface.
- [ ] **Concurrency / TOCTOU:** a server's tool list can change between listing and invocation — the descriptor captured at list time is revalidated (or the invocation is rejected) rather than trusted, so a tool removed after listing cannot still be called.
- [ ] **Regressions:** existing plugin tool tests unchanged; `executePluginTool` still fires its timeout.
- [ ] **Repo gates:** `bun run check` green.
