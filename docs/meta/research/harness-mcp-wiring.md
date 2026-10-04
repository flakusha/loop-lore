<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Research: Harness MCP wiring (client + server)

**Status:** Research — feeds task candidates
**Date:** 2026-10-04
**Source tickets:** `.plan/tickets/TASK-harness-lean-ctx-tools.md`, `.plan/tickets/IDEA-epic-tool-calling-mcp-2026-09-26.md`, `.plan/epics/epic-harness-integration.md` §6, `.plan/tickets/TASK-2026-openwebui-mcp-client-skeleton.md`, `.plan/tickets/TASK-workspace-mcp-bridge-on-openclaw-serve-registry-pattern.md`

## Question

How should loop-lore wire the Model Context Protocol into its existing plugin/tool
registry — client transports, auth, config surface, and the MCP *server* surface —
without forking the tool execution path or adding a second registry?

## Findings

### 1. The target registry is already the right shape

- `ToolDefinition` is `{ name, description, parameters (JSON Schema), handler, permissions?, timeoutMs?, sandboxed? }` — `src/plugins/types.ts:102-113`. `parameters` is already a JSON Schema object, which is exactly what MCP calls `inputSchema`.
- `PluginContext.registerTool(tool)` is the documented dynamic registration hook — `src/plugins/types.ts:75-84`; the loader wires it to `registry.addTools(manifest.name, [def])` inside `onLoad` — `src/plugins/loader.ts:149-159` (the `registerTool` closure is line 154).
- Static manifest tools register via `PluginManifest.tools` — `src/plugins/types.ts:62`; `registerManifestExtensions()` handles them — `src/plugins/loader.ts:175-182`.
- Core builtin tools register through the same `registry.addTools("core", [...])` call at boot — `src/plugins/loader.ts:104-111`, invoked from `loadAllPlugins()` (`src/server/start.ts:21`).
- `registry.getAllTools()` returns enabled plugins' tools in registration order — `src/plugins/registry.ts:116-118`; the enabled filter is `RegistryStore.getAllTools()` (`src/plugins/registry-store.ts:84-86`), with `"core"` enabled by default (`:36`).
- Origin capability gating (core/community/local) lives in `registry-policy.ts:7-11` — an MCP bridge plugin can only register `tools` if its origin allows it (all three currently do).

### 2. The execution path is a single seam — reuse it, don't fork it

- `gatePluginToolsByRole(agentRole)` filters `registry.getAllTools()` by the actor's role's `tools[]` — `src/generation/generate-route/tool-execution.ts:74-87`.
- `buildProviderRequest` calls it and maps each `ToolDefinition` to the provider wire shape `{ type: "function", function: { name, description, parameters } }` — `src/generation/generate-route/provider-request.ts:55-62`.
- `executeToolCalls()` looks the tool up by name in `registry.getAllTools()` (`:155`, `:159`), validates args are a JSON object (`:170-190`), then routes **every** tool through `executePluginTool()` (`:195`) and sanitizes the result (`:198`) — `src/generation/generate-route/tool-execution.ts:151-236`.
- `executePluginTool()` is the uniform timeout + failure contract: `tool.timeoutMs ?? 30_000`, a `setTimeout` race, and throw/timeout normalized to `{ content: {error}, isError: true }` — `src/plugins/tool-executor.ts:21`, `:33-55`.
- Tool results are persisted as encrypted `messages` rows (`content_type = ToolResult`, correlated via `metadata.tool_call_id`) — `src/generation/generate-route/tool-execution.ts:107-142`.
- Loop cap: `MAX_TOOL_ROUNDS = 5` — `src/generation/generate-route/tool-execution.ts:48`.

Consequence: **anything registered as a `ToolDefinition` is automatically visible to the LLM, role-gated, timeout-bounded, sanitized, and persisted.** An MCP client only needs to produce `ToolDefinition`s whose handler forwards to `client.callTool()`.

### 3. There is no MCP code or dependency in-repo today

- `package.json` `dependencies` (`:125-148`) and `devDependencies` (`:149-190`) contain no `@modelcontextprotocol/*` entry.
- A repo-wide search for `modelcontextprotocol` matches only docs/tickets (`docs/research/federation-messenger-email-integration-research.md:206`, `.plan/tickets/TASK-2026-openwebui-mcp-client-skeleton.md:16`), never `package.json`/`bun.lock`.
- A search for `mcp`/`MCP` across `src/` returns **no matches**. `TASK-harness-lean-ctx-tools.md:11` states the same ("No MCP at runtime").
- No sandboxing exists for tool handlers: plugin tools run in-process (`docs/spec/plugin-system.md:24`, `TASK-harness-tool-sandbox.md:11`). The `ToolDefinition.sandboxed` flag is declared (`src/plugins/types.ts:112`) but unenforced.

### 4. The omp MCP config shape (the surface to mirror)

`~/.omp/agent/mcp.json` (`$schema` at line 2, `mcpServers` at line 3) is a map of server name → config:

- `type: "http"` + `url` — `:4-15` (RivalSearchMCP, context7, deepwiki).
- `type: "stdio"` + `command` + `args` (+ optional `enabled`) — `:16-51` (engram, lean-ctx, serena `enabled: false`, context-mode).
- The referenced JSON Schema (`.../config/mcp-schema.json`) defines `stdioServer` (`command`/`args`/`env`/`cwd`, `url` forbidden), `httpServer` (`url`/`headers`, `command` forbidden), and a legacy `sseServer` (`type: "sse"`), plus shared `serverBase` keys `enabled`, `timeout` (ms, 0 disables), `instructions`, `auth` (`oauth`|`apikey`) and `oauth`. Top-level also supports `disabledServers` (denylist, highest precedence) and `enabledServers` (allowlist override).

This is the de-facto shape to copy: operators already maintain it, and it maps 1:1 onto the MCP spec's two transports.

### 5. MCP spec facts that constrain the design

- **Transports** — the spec defines two: **stdio** (client spawns the server; newline-delimited JSON-RPC over stdin/stdout; stderr is free-form logging) and **Streamable HTTP** (single endpoint, POST + optional GET/SSE; `Mcp-Session-Id`, `MCP-Protocol-Version` headers). The older HTTP+SSE transport is deprecated. Clients SHOULD support stdio whenever possible. — https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- **Lifecycle** — `initialize` → capability negotiation → `notifications/initialized` → operation → shutdown. Clients MUST only use negotiated capabilities; implementations SHOULD set per-request timeouts and cancel on expiry. — https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- **Tools** — servers declare the `tools` capability; `tools/list` returns `{ name, title?, description?, inputSchema (JSON Schema), outputSchema?, annotations? }`; `tools/call` returns `{ content: [...], isError? }`; `notifications/tools/list_changed` signals a changed list. Tool annotations MUST be treated as untrusted unless the server is trusted. — https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- **Auth** — authorization is OPTIONAL. HTTP transports SHOULD use OAuth 2.1 + RFC 9728 Protected Resource Metadata + `WWW-Authenticate` discovery, tokens in `Authorization: Bearer`. **STDIO transports SHOULD NOT use the OAuth flow and instead retrieve credentials from the environment.** — https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- **Newer revision exists** — `2025-11-25` adds tool-name guidance, JSON Schema 2020-12 as the default dialect, and input-validation errors returned as tool-execution errors (enabling model self-correction). — https://modelcontextprotocol.io/specification/2025-11-25/changelog
- **SDK** — `@modelcontextprotocol/sdk` v1.32.0 (MIT) exports `Client` (`client/index.js`), `StdioClientTransport` (`client/stdio.js`), `StreamableHTTPClientTransport` / `SSEClientTransport`, and `McpServer` (`server/mcp.js`) + `StdioServerTransport` (`server/stdio.js`); client verbs are `listTools()` / `callTool({name, arguments})`. — https://ts.sdk.modelcontextprotocol.io/client.html, https://ts.sdk.modelcontextprotocol.io/server.html, https://www.npmjs.com/package/@modelcontextprotocol/sdk
- **SDK v2 splits packages** — `@modelcontextprotocol/client` v2.3.0 (Apache-2.0) + `@modelcontextprotocol/core`; import paths move (`@modelcontextprotocol/client`, `/stdio`). v2 `callTool` returns `content` plus optional `structuredContent`, and `listTools()` aggregates pagination automatically. — https://www.npmjs.com/package/@modelcontextprotocol/client, https://ts.sdk.modelcontextprotocol.io/v2/clients/connect.html, https://ts.sdk.modelcontextprotocol.io/v2/clients/calling.html

### 6. Existing ticket intentions (and one that needs correcting)

- `TASK-harness-lean-ctx-tools.md:16-17` — wrapper maps `ToolDefinition` ⇄ MCP tool schema; `ctx_read`/`ctx_patch`/`ctx_execute` registered via `registerTool()`; execution reuses `executePluginTool()` timeout + role gating; no execution-path fork.
- `IDEA-epic-tool-calling-mcp-2026-09-26.md:34-37` — MCP client over stdio/SSE exposing external tools through the same registry; MCP server as an operator-flagged subset; tool palette UI; every invocation audited.
- `TASK-workspace-mcp-bridge-on-openclaw-serve-registry-pattern.md:24` — trust boundary is explicit: **stdio = local-user boundary (no network auth); HTTP must be loopback-only or authenticated, never unauthenticated.**
- `docs/spec/integrations-architecture.md:86` already reserves `src/integrations/mcp/` (new) for the MCP bridge, with the same trust rule.
- `TASK-2026-openwebui-mcp-client-skeleton.md:10,18,31` proposes an `AsyncExitStack` + `ClientSession` design and a `registry.mcpServers` map. **`AsyncExitStack` is a Python idiom** (open-webui is Python); the TS SDK has no such class. This ticket's shape should be corrected to TS SDK semantics (`connect()`/`close()`), and its "second map on the registry" contradicts the reuse-first rule — see Recommendation.

## Recommendation (design sketch, reuse-first)

### One wrapper, one registry

New module `src/integrations/mcp/client.ts` (path already reserved by the spec) exposing a thin
`McpClient` over the SDK:

```ts
// src/integrations/mcp/client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"; // verify the exact subpath against the pinned SDK version

export interface McpServerConfig { /* mirrors omp mcp.json — see below */ }

export class McpClient {
  private client: Client;
  async connect(cfg: McpServerConfig): Promise<void>;      // picks transport by cfg.type
  async listTools(): Promise<McpTool[]>;                   // SDK paginates for us
  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult>;
  async close(): Promise<void>;
}
```

**Client ↔ registry mapping** (the whole integration; no `mcpServers` map on `PluginRegistry`):

| MCP (`tools/list` item) | `ToolDefinition` | Note |
|---|---|---|
| `name` | `` `${serverName}__${tool.name}` `` | namespace to avoid collisions with plugin tools |
| `description` | `description` | verbatim |
| `inputSchema` | `parameters` | already JSON Schema on both sides |
| `outputSchema` | (dropped in v1) | keep only `content` text |
| — | `handler: (params) => client.callTool({ name: tool.name, arguments: params })` | returns `{ content, isError }` |
| — | `timeoutMs: server.timeout` | falls back to `executePluginTool`'s 30 s |
| — | `permissions` / `sandboxed` | left unset until the sandbox ticket lands |

Mapping `{ content: ContentBlock[], isError }` → `ToolResult`: join `type: "text"` blocks into
`content`; set `isError`; anything else (image/audio/resource) stringified into `metadata` (v1).
The handler MUST throw (not return a value) when `isError` is set, so `executePluginTool()`'s
`catch` (`src/plugins/tool-executor.ts:50-55`) produces the canonical `{ error }` result — MCP's
`isError` and `ToolResult.isError` are the same concept, but the wrapper is what carries it across.

### Registration and execution

An MCP bridge **core plugin** (`plugins/core/mcp-bridge/plugin.ts`) owns the client pool and, in
`onLoad(context)`, connects each configured server and calls `context.registerTool(def)` once per
remote tool (`src/plugins/loader.ts:154`). Nothing else changes:

- LLM visibility: `provider-request.ts:55-62` already serializes every registered tool.
- Role gating: `gatePluginToolsByRole` filters by `AgentRoleDefinition.tools[]` — an MCP tool is
  gated exactly like a builtin; to scope it, list `server__tool` in the role's `tools`.
- Timeout + error contract: `executePluginTool()` — no per-call fork.
- Sanitize + encrypted persist: `executeToolCalls()` — free.
- Enable/disable: `registry.setEnabled(serverName, false)` (or per-tool) reuses the existing
  plugin-state surface; server-level `enabled: false` in config is the static equivalent.

Client lifecycle: `onUnload()` closes the pool (stdio shutdown per spec: close stdin → SIGTERM →
SIGKILL; HTTP: `terminateSession()` then `close()`).

### Config surface (`mcpServers`-shaped)

Add one config section, shaped like omp's `mcp.json` so operators copy-paste:

```toml
# config.mcp.example.toml
[mcp]
enabled = true

[mcp.servers.lean-ctx]
type = "stdio"
command = "lean-ctx"
args = []
enabled = true

[mcp.servers.remote-tools]
type = "http"
url = "https://example.com/mcp"
enabled = false
timeout = 60000
# headers = { Authorization = "Bearer ${MCP_REMOTE_TOKEN}" }   # env-expanded
```

Implementation reuses the config machinery as-is: a `McpConfig` interface in
`src/config/schema/mcp.ts` + barrel export (`src/config/schema/index.ts:9-37`), defaults in
`src/config/schema-class/mcp.ts` + `createConfigSchema()` (`src/config/schema-class/index.ts:62-123`),
which auto-feeds `envMap()`, `validate()` and the generated JSON Schemas
(`schemas/loop-lore-config.schema.json`) — no hand-written duplicate. Per-server `enabled` mirrors
omp's `enabled`/`disabledServers` precedence without adding a second mechanism.

**Auth rules (v1, minimal):**

- **stdio** = trusted local process: pass `env` from config (and the inherited env), no token flow —
  matches the spec's "stdio SHOULD NOT follow the authorization spec; credentials from the
  environment" and the integrations trust boundary (`docs/spec/integrations-architecture.md:86`).
- **http** = static `headers` map (bearer/api-key) sourced from config/env; **no OAuth 2.1 flow in
  v1**. The spec makes OAuth optional; wiring discovery + PKCE is a separate, later ticket.
- Never expose an MCP server endpoint unauthenticated; loopback-only if unauthenticated.

### MCP *server* surface (operator-flagged subset)

In scope as a thin, opt-in adapter — not a second tool system. Reuse the planned
`src/integrations/mcp/` home:

- **stdio server first** (`McpServer` + `StdioServerTransport`): a small entrypoint that registers
  a *config-flagged* subset of `registry.getAllTools()` whose `permissions`/allowlist marks them
  exportable, forwarding each to `executePluginTool()`. stdio = local-user boundary, no network auth.
  **Not all registered tools are safe to export** — the current core tools (`write_memory_note`,
  `character_creation`, `world_creation`, `location_creation`, `item_creation`, registered at
  `src/plugins/loader.ts:105-111`) are mutating creation/write tools; the default export allowlist
  MUST be empty (explicit opt-in per tool).
- **HTTP server later**, mounted on the existing Elysia app (`.use()` beside the plugin routes,
  `src/elysia-app.ts:208-210`), loopback-only unless bearer-auth is configured.
- Export policy is an explicit per-tool operator flag, never "all tools by default" (IDEA ticket
  open question 3, `.plan/tickets/IDEA-epic-tool-calling-mcp-2026-09-26.md:82`).
- Every inbound call still flows through `executePluginTool` → same timeout, same role gate. The
  existing audit surface is `recordAuditLog` (`src/memory/audit.ts:144`), but its `AuditLogEntry`
  (`:44-50`) is **memory-scoped** (`memoryId` required) — a generic tool-call audit needs a new
  sink/table, not a reuse of `memory_audit_log`. Costed in task 4.

### Deliberately skipped (add when needed)

- Tool palette UI — the registry already exposes `GET /api/plugins` (`src/routes/plugins/index.ts:41-59`);
  extend it later. Not needed to land MCP.
- `outputSchema`/`structuredContent`, resources, prompts, sampling, elicitation — out of v1 scope.
- Sandbox isolation — belongs to `TASK-harness-tool-sandbox.md`; MCP tools inherit whatever that
  ticket gives every other tool.
- OAuth 2.1 discovery/PKCE — headers-only until a real remote server needs it.

## Task candidates

1. **TASK-harness-mcp-client-wrapper** — `McpClient` + `ToolDefinition` mapping + core bridge plugin.
   - *Why:* the reusable seam; everything else depends on it.
   - *Acceptance:* `src/integrations/mcp/client.ts` connects over stdio and Streamable HTTP;
     `listTools()` items become `ToolDefinition`s registered via `registerTool()`; `callTool`
     result maps to `ToolResult` with `isError` preserved; `onUnload()` closes every transport;
     unit tests cover the mapping (name namespacing, `inputSchema`→`parameters`, error passthrough);
     `@modelcontextprotocol/sdk` (or v2 `@modelcontextprotocol/client`) added to `package.json`.
   - *Files:* `src/integrations/mcp/client.ts`, `plugins/core/mcp-bridge/plugin.ts`,
     `src/plugins/types.ts` (read-only), `package.json`.

2. **TASK-harness-mcp-config-section** — `[mcp]` / `[mcp.servers.*]` config section shaped like omp `mcp.json`.
   - *Why:* operators need one declarative surface; the schema generator already exists.
   - *Acceptance:* `McpConfig` type + defaults + `config.mcp.example.toml`; `loadConfig()` round-trips
     stdio and http entries; `validate()` rejects a server with both `command` and `url`, or neither;
     `envMap()`/generated JSON Schema include the new keys; `enabled = false` keeps the server out of
     the registry.
   - *Files:* `src/config/schema/mcp.ts`, `src/config/schema/index.ts`, `src/config/schema-class/mcp.ts`,
     `src/config/schema-class/index.ts`, `src/config/schema-class/validate.ts`, `configs/config.mcp.example.toml`.

3. **TASK-harness-mcp-server-surface** — operator-flagged MCP server (stdio first).
   - *Why:* closes IDEA G42's "no MCP surface"; enables external agent runtimes to drive loop-lore tools.
   - *Acceptance:* a stdio MCP server registers only tools whose export flag is set; each inbound
     `tools/call` routes through `executePluginTool()` (timeout + role gate intact); unauthenticated
     HTTP is refused (loopback-only or bearer); documented trust boundary matches
     `docs/spec/integrations-architecture.md:86`.
   - *Files:* `src/integrations/mcp/server.ts`, `src/server/start.ts`, `src/plugins/tool-executor.ts`.

4. **TASK-harness-mcp-call-audit** — generic tool-invocation audit + harness exec-log coverage.
   - *Why:* IDEA ticket requires every invocation audited; the harness exec log already records the
     tool names offered to the model.
   - *Acceptance:* each MCP `tools/call` writes a tool-invocation audit row (new generic audit table
     or extension of `AuditLogEntry` — `memory_audit_log` cannot hold a non-memory tool); the call is
     attributed to the parent generation run so it appears in the harness log. **Caveat:**
     `HarnessRunRecord.tools` is populated from `req.tools` at the egress seam
     (`src/generation/providers/call-with-failover.ts:43,66`), i.e. the tools *offered*, not the tools
     *invoked* — so "name appears in `tools`" alone is not an invocation record; the audit row is the
     invocation record.
   - *Files:* `src/integrations/mcp/client.ts`, `src/memory/audit.ts` (or a new audit module),
     `src/harness/exec-recorder.ts`.

## Open questions

1. **SDK v1 vs v2** — pin `@modelcontextprotocol/sdk@1.x` (single package, `client/index.js` paths)
   or the v2 split (`@modelcontextprotocol/client@2.3.0`, Apache-2.0)? v2 changes import paths and
   adds `structuredContent`; pick before writing the wrapper.
2. **Protocol revision target** — 2025-06-18 (what the spec pages read for this doc describe) vs
   2025-11-25 (JSON Schema 2020-12 default). Confirm what the chosen SDK negotiates.
3. **Tool-name constraints** — 2025-11-25 adds name guidance; decide the namespace separator
   (`server__tool`) against any length/charset limits.
4. **Collision policy** — what happens when a remote MCP tool and a plugin tool share a name after
   namespacing (prefix both, or last-registration-wins like `registry.addTools`)?
5. **`enabled` precedence** — config `enabled` vs runtime `registry.setEnabled` vs omp-style
   `disabledServers` denylist; define one precedence order.
6. **stdio process lifetime** — one child per server for the process lifetime, or lazy-spawn on
   first tool call? Affects boot time and `onUnload` shutdown.
7. **MCP server auth model** — bearer only, or reuse the existing user/session auth for HTTP?

## Sources

**Repo (file:line):** `src/plugins/types.ts:75-84,102-113`; `src/plugins/registry.ts:50-53,116-118`;
`src/plugins/registry-store.ts:36,84-86`; `src/plugins/registry-policy.ts:7-11`;
`src/plugins/loader.ts:104-111,149-159,175-182`; `src/plugins/tool-executor.ts:21,33-55`;
`src/plugins/index.ts:7-40`; `src/generation/generate-route/tool-execution.ts:48,74-87,107-142,151-236`;
`src/generation/generate-route/provider-request.ts:55-62`; `src/server/start.ts:21`;
`src/app/register-plugins.ts:130`; `src/elysia-app.ts:208-210`; `src/config/schema/index.ts:9-37`;
`src/config/schema/providers.ts:19-40`; `src/config/schema-class/index.ts:62-123`;
`src/config/schema-class/validate.ts:7-61`; `src/config/load/constants.ts:10-22`;
`src/routes/plugins/index.ts:41-59`; `src/routes/v1/openapi.ts:82-96`; `src/memory/audit.ts:44-50,144`;
`src/generation/providers/call-with-failover.ts:43,66`;
`src/harness/types.ts:37-63`; `src/harness/exec-recorder.ts:21-41`; `src/harness/exec-log.ts:23-26`;
`package.json:125-190`.

**Tickets/specs:** `.plan/tickets/TASK-harness-lean-ctx-tools.md:11,16-19`;
`.plan/tickets/IDEA-epic-tool-calling-mcp-2026-09-26.md:34-37,52-55,82`;
`.plan/tickets/TASK-2026-openwebui-mcp-client-skeleton.md:10,16-20,31`;
`.plan/tickets/TASK-workspace-mcp-bridge-on-openclaw-serve-registry-pattern.md:17,24`;
`.plan/tickets/TASK-harness-tool-sandbox.md:11`; `.plan/epics/epic-harness-integration.md:154-164`;
`docs/spec/integrations-architecture.md:86`; `docs/spec/plugin-system.md:8,24`.

**Local config evidence:** `~/.omp/agent/mcp.json:2-51`; omp MCP JSON Schema
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json`
(`$defs.stdioServer`, `$defs.httpServer`, `$defs.sseServer`, `$defs.serverBase`, `disabledServers`, `enabledServers`).

**External (verified 2026-10-04):**
- https://modelcontextprotocol.io/specification/2025-06-18/basic/transports (stdio, Streamable HTTP, SSE deprecation)
- https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle (initialize, capabilities, timeouts)
- https://modelcontextprotocol.io/specification/2025-06-18/server/tools (`tools/list`, `inputSchema`, `tools/call`, `isError`)
- https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization (OAuth 2.1 for HTTP; stdio uses env)
- https://modelcontextprotocol.io/specification/2025-11-25/changelog (JSON Schema 2020-12 default, tool-name guidance)
- https://ts.sdk.modelcontextprotocol.io/client.html (v1 `Client`, `StdioClientTransport`, `listTools`/`callTool`)
- https://ts.sdk.modelcontextprotocol.io/server.html (`McpServer`, `StdioServerTransport`, `registerTool`)
- https://ts.sdk.modelcontextprotocol.io/v2/clients/connect.html (v2 transport classes, `close()` semantics)
- https://ts.sdk.modelcontextprotocol.io/v2/clients/calling.html (v2 `structuredContent`, pagination aggregation)
- https://www.npmjs.com/package/@modelcontextprotocol/sdk (v1.32.0, MIT)
- https://www.npmjs.com/package/@modelcontextprotocol/client (v2.3.0, Apache-2.0)
