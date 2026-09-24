<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-2026-openwebui-mcp-client-skeleton: MCP Streamable-HTTP Client Wrapper for Tool Servers

**Status:** open
**Priority:** medium
**Effort:** Small
**Labels:** generation, tools, mcp
**Summary:** Add a new `src/plugins/mcp/client.ts` that wraps `@modelcontextprotocol/sdk`'s `streamablehttp_client` + `ClientSession` and exposes `listTools()`, `callTool(name, args)`, `disconnect()`. Lifecycle managed via `AsyncExitStack` (LIFO — required by the MCP SDK). OAuth token storage is mocked initially. Extend `src/plugins/registry.ts` with a `mcpServers: Map<string, MCPClient>` and route to MCP when a tool's `apiFamily === 'mcp'`.

**Context:** Open-webui speaks the Model Context Protocol over Streamable HTTP for remote tool servers (`utils/mcp/client.py:59–87`). Loop-lore's plugin registry currently treats every tool as either local JS or a remote HTTP function. To stay compatible with the MCP ecosystem (and let users point loop-lore at any MCP-compliant server), we need a first-class client wrapper. This ticket lands the skeleton — concrete server registration UX is a follow-up.

**Acceptance Criteria:**

- [ ] **Prerequisite**: `@modelcontextprotocol/sdk` is added to `package.json` `dependencies` and `bun install` is clean. (Verified missing as of writing — this is a blocking dep.) Once added, file a one-line dependency note in this ticket's References.
- [ ] `src/plugins/mcp/client.ts` exists with `connect`, `listTools`, `callTool`, `disconnect` methods.
- [ ] `AsyncExitStack` is used; `disconnect()` calls `exitStack.close()` (LIFO order preserved).
- [ ] `src/plugins/registry.ts` exports `mcpServers: Map<string, MCPClient>`.
- [ ] `executeToolCalls` routes to the MCP client when `tool.apiFamily === 'mcp'`.
- [ ] OAuth token storage is a single in-memory constant for now; a clear `ponytail:` comment marks the upgrade path.
- [ ] TypeScript strict mode clean.

**Description:**

Skeleton shape:

```ts
// src/plugins/mcp/client.ts
export class MCPClient {
  private exitStack = new AsyncExitStack();
  private session?: ClientSession;

  async connect(url: string, oauthToken = "DEV_MOCK") {
    const transport = await this.exitStack.enterContext(
      streamablehttp_client(new URL(url), { authProvider: () => oauthToken }),
    );
    this.session = await this.exitStack.enterContext(new ClientSession(transport));
    await this.session.initialize();
  }

  async listTools() { return (await this.session!.listTools()).tools; }
  async callTool(name: string, args: Record<string, unknown>) {
    return this.session!.callTool({ name, arguments: args });
  }
  async disconnect() { await this.exitStack.close(); } // LIFO
}
```

Registry change (`src/plugins/registry.ts`):

```ts
export const registry = {
  tools: new Map<string, ToolDefinition>(),
  mcpServers: new Map<string, MCPClient>(),
  // ...
};
```

Routing in `executeToolCalls` (`src/generation/generate-route/tool-execution.ts:154`):

```ts
if (tool.apiFamily === "mcp") {
  const client = registry.mcpServers.get(tool.serverId!);
  return client.callTool(tool.name, call.arguments);
}
```

**Acceptance Criteria:**

- [ ] **Prerequisite**: `@modelcontextprotocol/sdk` is added to `package.json` `dependencies` and `bun install` is clean. (Verified missing as of writing — this is a blocking dep.) Once added, file a one-line dependency note in this ticket's References.
- [ ] `src/plugins/mcp/client.ts` exists with `connect`, `listTools`, `callTool`, `disconnect` methods.
- [ ] `AsyncExitStack` is used; `disconnect()` calls `exitStack.close()` (LIFO order preserved).
- [ ] `src/plugins/registry.ts` exports `mcpServers: Map<string, MCPClient>`.
- [ ] `executeToolCalls` routes to the MCP client when `tool.apiFamily === 'mcp'`.
- [ ] OAuth token storage is a single in-memory constant for now; a clear `ponytail:` comment marks the upgrade path.
- [ ] TypeScript strict mode clean.

**Notes:**

- This is a skeleton — no auth flow, no retry, no reconnection. Those land as follow-ups once the basic shape is exercised.
- ponytail: OAuth is mocked as `DEV_MOCK`; replace with persistent storage + refresh-token flow when an admin UI exists.
- The `@modelcontextprotocol/sdk` dependency MUST already be present in `package.json` (verify before starting) — if not, file a blocker note in this ticket.

**References:**

- loop-lore: `src/plugins/registry.ts` — current plugin map; needs `mcpServers` field.
- loop-lore: `src/generation/generate-route/tool-execution.ts:154` — current dispatch point for tool execution.
- open-webui: `open-webui/backend/open_webui/utils/mcp/client.py:59–87` — `MCPClient` shape and `AsyncExitStack` LIFO lifecycle.
- open-webui: `open-webui/backend/open_webui/config.py` — MCP environment variable schema reference for the eventual admin UI.


git issue: 7f2efca
