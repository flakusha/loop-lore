// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/mcp.ts — declarative MCP server config types
//
// Top-level `[mcp]` / `[mcp.servers.<name>]` section. This is not the
// per-ACP-profile `mcpServers` array in ./harness.ts (that one is forwarded
// verbatim to an external agent) — this section is loop-lore's own client
// surface and is validated at config load.

/** Transports loop-lore understands (runtime list: validation cannot drift). */
export const MCP_TRANSPORTS = ["stdio", "http",] as const;

/** One MCP transport. */
export type McpTransport = (typeof MCP_TRANSPORTS)[number];

/**
 * One configured MCP server. `command` (stdio) and `url` (http) are mutually
 * exclusive; `allowlist` is the explicit set of tool names this server may
 * expose to the registry (absent/empty exports none).
 */
export interface McpServerEntry {
  /** Server switch; absent/default true. A disabled server is never registered. */
  enabled?: boolean;
  /** Transport used to reach the server. */
  transport: McpTransport;
  /** Executable for stdio servers — an argv head, never a shell command. */
  command?: string;
  /** Extra argv entries for a stdio server. */
  args?: string[];
  /** Environment entries for a stdio server. */
  env?: Record<string, string>;
  /** Endpoint for http servers. */
  url?: string;
  /** Static request headers for http servers (no OAuth flow in v1). */
  headers?: Record<string, string>;
  /** Per-call timeout in ms (0 disables; absent uses the wrapper default). */
  timeoutMs?: number;
  /** Tool names eligible for the registry; empty/absent exports no tools. */
  allowlist?: string[];
}

/** Top-level `[mcp]` section. */
export interface McpConfig {
  /** Master switch; absent/false exposes no MCP servers. */
  enabled?: boolean;
  /** Servers keyed by local name (`[mcp.servers.<name>]`). */
  servers: Record<string, McpServerEntry>;
}
