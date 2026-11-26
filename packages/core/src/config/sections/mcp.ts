// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/mcp.ts — MCP section defaults, validation, JSON-schema meta

import { MCP_TRANSPORTS, type McpConfig, type McpTransport, } from "../schema/mcp";

/** Defaults: MCP is opt-in, and no servers are configured. */
export const MCP_DEFAULTS: McpConfig = { enabled: false, servers: {}, };

// ponytail: argv head only (no quoted-token parsing); add a shell-token parser
// if a stdio executable ever needs spaces or a Windows path.
const COMMAND_PATTERN = /^[^\s"'\\;$&|`<>()]+$/;

/**
 * Validate the top-level `[mcp]` section after defaults are applied.
 * @param mcp - the merged MCP config (absent = nothing to check)
 * @throws {Error} If the section or any server entry is malformed.
 */
export function validateMcpConfig(mcp: McpConfig | undefined,): void {
  if (mcp === undefined) { return; }
  if (mcp.enabled !== undefined && typeof mcp.enabled !== "boolean") {
    throw new Error("mcp.enabled must be a boolean",);
  }

  const servers: unknown = mcp.servers;
  if (servers === null || typeof servers !== "object" || Array.isArray(servers,)) {
    throw new Error("mcp.servers must be a table of named servers",);
  }

  for (const [name, entry,] of Object.entries(servers as Record<string, unknown>,)) {
    validateServer(name, entry,);
  }
}

/**
 * Validate one named server entry.
 * @param name - local server name (from the config key)
 * @param raw - parsed entry
 * @throws {Error} If transport fields are missing, conflicting, or malformed.
 */
function validateServer(name: string, raw: unknown,): void {
  const prefix = `mcp.servers["${name}"]`;
  if (name.trim() === "") {
    throw new Error("mcp.servers: server names must be non-empty",);
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw,)) {
    throw new Error(`${prefix} must be a table`,);
  }

  const entry = raw as Record<string, unknown>;
  if (entry.enabled !== undefined && typeof entry.enabled !== "boolean") {
    throw new Error(`${prefix}.enabled must be a boolean`,);
  }

  const transport: unknown = entry.transport;
  if (typeof transport !== "string" || !MCP_TRANSPORTS.includes(transport as McpTransport,)) {
    throw new Error(`${prefix}.transport must be one of: ${MCP_TRANSPORTS.join(", ",)}`,);
  }

  const hasCommand = entry.command !== undefined;
  const hasUrl = entry.url !== undefined;
  if (hasCommand === hasUrl) {
    throw new Error(`${prefix}: set exactly one of command (stdio) or url (http)`,);
  }

  if (transport === "stdio") {
    if (!hasCommand) {
      throw new Error(`${prefix}: transport "stdio" requires command`,);
    }
    validateCommand(prefix, entry.command,);
    validateStringArray(prefix, "args", entry.args,);
    validateStringMap(prefix, "env", entry.env,);
  } else {
    validateUrl(prefix, entry.url,);
    validateStringMap(prefix, "headers", entry.headers,);
  }

  const timeout: unknown = entry.timeoutMs;
  if (
    timeout !== undefined &&
    (!Number.isInteger(timeout as number,) || (timeout as number) < 0)
  ) {
    throw new Error(`${prefix}.timeoutMs must be a non-negative integer`,);
  }

  validateStringArray(prefix, "allowlist", entry.allowlist,);
  if (Array.isArray(entry.allowlist,) && (entry.allowlist as string[]).includes("*",)) {
    throw new Error(`${prefix}.allowlist must name tools explicitly ("*" is not allowed)`,);
  }
}

/**
 * Validate a stdio executable: an argv head, never a shell string.
 * @param prefix - error prefix
 * @param raw - configured command
 * @throws {Error} If the command is empty or contains shell/whitespace characters.
 */
function validateCommand(prefix: string, raw: unknown,): void {
  if (typeof raw !== "string" || !COMMAND_PATTERN.test(raw,)) {
    throw new Error(`${prefix}.command must be a single executable path (no shell syntax)`,);
  }
}

/**
 * Validate an optional string array field.
 * @param prefix - error prefix
 * @param field - field name
 * @param raw - configured value
 * @throws {Error} If the value is not a string array.
 */
function validateStringArray(prefix: string, field: string, raw: unknown,): void {
  if (
    raw !== undefined &&
    (!Array.isArray(raw,) || raw.some((item,) => typeof item !== "string" || item === ""))
  ) {
    throw new Error(`${prefix}.${field} must be a string array`,);
  }
}

/**
 * Validate an optional string → string map field.
 * @param prefix - error prefix
 * @param field - field name
 * @param raw - configured value
 * @throws {Error} If the value is not a string → string table.
 */
function validateStringMap(prefix: string, field: string, raw: unknown,): void {
  if (
    raw !== undefined && (raw === null || typeof raw !== "object" || Array.isArray(raw,) ||
      Object.values(raw as Record<string, unknown>,).some((value,) => typeof value !== "string"))
  ) {
    throw new Error(`${prefix}.${field} must be a string → string table`,);
  }
}

/**
 * Validate an http endpoint: absolute http(s) URL, no other scheme.
 * @param prefix - error prefix
 * @param raw - configured value
 * @throws {Error} If the URL is missing, relative, or uses another scheme.
 */
function validateUrl(prefix: string, raw: unknown,): void {
  if (typeof raw !== "string") {
    throw new Error(`${prefix}.url must be a string`,);
  }

  let url: URL;
  try {
    url = new URL(raw,);
  } catch {
    throw new Error(`${prefix}.url must be an absolute http(s) URL (got "${raw}")`,);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${prefix}.url must use http or https (got "${url.protocol}")`,);
  }
}

/** JSON-schema metadata for the `mcp` section. */
export const mcpMeta = {
  type: "object" as const,
  description: "Declarative MCP servers loop-lore connects to (stdio or http)",
  properties: {
    enabled: {
      type: "boolean",
      default: false,
      description: "Master switch; absent/false exposes no MCP servers",
    },
    servers: {
      type: "object",
      description: "Servers keyed by local name; each needs a transport and exactly one of command/url",
      additionalProperties: {
        type: "object",
        properties: {
          enabled: { type: "boolean", default: true, description: "Per-server switch", },
          transport: { type: "string", enum: [...MCP_TRANSPORTS,], description: "Server transport", },
          command: { type: "string", description: "stdio executable (argv head, never a shell command)", },
          args: { type: "array", items: { type: "string", }, description: "stdio argv tail", },
          env: { type: "object", description: "stdio environment (string → string)", },
          url: { type: "string", description: "http endpoint (absolute http(s) URL)", },
          headers: { type: "object", description: "http request headers (string → string)", },
          timeoutMs: { type: "integer", minimum: 0, description: "Per-call timeout in ms (0 disables)", },
          allowlist: {
            type: "array",
            items: { type: "string", },
            description: "Tool names eligible for the registry; empty/absent exports none",
          },
        },
        required: ["transport",] as const,
      },
    },
  },
};
