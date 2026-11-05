// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/mcp/server.ts — MCP server semantics
// over the facade op registry (epic TASK: tools/list + tools/call).
//
// SINGLE SOURCE OF TRUTH: tools come from registry.manifest() (+ resolve()
// for bodySchema); execution is runFacadeOp with a FacadeContext the HTTP
// layer builds from the AUTHENTICATED principal — never from the RPC body.
//
// HAND-ROLLED (no @modelcontextprotocol/sdk dependency — flagged): protocol
// revision pinned to the epic's 2026-07-28 pin. STATELESS by slice decision:
// no session ids, no session storage — the pinned spec removed protocol-level
// sessions, so an initialize per request (or per client run) is tolerated.

import { safeJsonStringify, } from "../../../utils";
import { type FacadeRegistry, runFacadeOp, } from "../registry";
import type { FacadeContext, } from "../types";
import { RPC_INVALID_PARAMS, RpcError, } from "./jsonrpc";

/** Protocol revision pinned by the epic (Streamable HTTP, sessions removed). */
export const MCP_PROTOCOL_VERSION = "2026-07-28";

export const MCP_SERVER_NAME = "loop-lore-facade";

/** MCP tool content block (text only — this slice streams JSON as text). */
export interface McpTextContent {
  type: "text";
  text: string;
}

/** MCP tools/call result. */
export interface McpCallToolResult {
  content: McpTextContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** MCP tools/list tool descriptor. `inputSchema` is a JSON Schema object —
 * TypeBox TSchema at runtime — typed honestly as unknown (serialization
 * boundary data, never queried structurally by this module). */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

/** MCP initialize result. */
export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: { tools: { listChanged: false } };
  serverInfo: { name: string; version: string };
}

export interface McpFacadeServer {
  initialize(params: unknown,): McpInitializeResult;
  toolsList(): { tools: McpTool[] };
  toolsCall(params: unknown, ctx: FacadeContext,): Promise<McpCallToolResult>;
  ping(): Record<string, never>;
}

function asParamsObject(params: unknown,): Record<string, unknown> {
  return typeof params === "object" && params !== null && !Array.isArray(params,)
    ? params as Record<string, unknown>
    : {};
}

function textContent(value: unknown,): McpTextContent {
  const serialized = safeJsonStringify(value ?? null,);
  return { type: "text", text: serialized.ok ? serialized.value : "null", };
}

/**
 * Build the MCP server over a facade registry.
 * @param deps - the op registry (single source of truth) + app version for
 *   serverInfo (APP_VERSION from src/config/constants)
 * @returns the protocol-method implementations
 */
export function createMcpFacadeServer(deps: {
  registry: FacadeRegistry;
  version: string;
},): McpFacadeServer {
  const { registry, version, } = deps;

  return {
    initialize(params,): McpInitializeResult {
      const requested = asParamsObject(params,).protocolVersion;
      // Negotiation: echo the client's requested revision when it supplies
      // one, else answer with our pin.
      const protocolVersion = typeof requested === "string" && requested.length > 0
        ? requested
        : MCP_PROTOCOL_VERSION;

      return {
        protocolVersion,
        capabilities: { tools: { listChanged: false, }, },
        serverInfo: { name: MCP_SERVER_NAME, version, },
      };
    },

    toolsList(): { tools: McpTool[] } {
      const tools = registry.manifest().map((entry,) => {
        const schema = registry.resolve(entry.name,)?.bodySchema as
          | Record<string, unknown>
          | undefined;

        return {
          name: entry.name,
          description: schema === undefined
            // Permissive-schema note: ops without a declared body schema
            // accept any JSON object (each handler validates authoritatively).
            ? `${entry.description} (input: any JSON object)`
            : entry.description,
          inputSchema: schema ?? { type: "object", additionalProperties: true, },
        };
      },);

      return { tools, };
    },

    async toolsCall(params, ctx,): Promise<McpCallToolResult> {
      const p = asParamsObject(params,);
      const name = typeof p.name === "string" && p.name.length > 0 ? p.name : null;
      if (name === null) {
        throw new RpcError(RPC_INVALID_PARAMS, "tools/call requires a string tool name",);
      }

      const op = registry.resolve(name,);
      if (!op) {
        throw new RpcError(RPC_INVALID_PARAMS, `unknown tool "${name}"`,);
      }

      const rawArgs = p.arguments;
      const args = typeof rawArgs === "object" && rawArgs !== null && !Array.isArray(rawArgs,)
        ? rawArgs
        : {};

      const result = await runFacadeOp(registry, ctx, name, args,);

      if (!result.ok) {
        return { content: [textContent(result.json,),], isError: true, };
      }

      // structuredContent is object-only per spec; arrays/primitives ride the
      // text content alone.
      const structured = typeof result.json === "object" && result.json !== null
        ? result.json as Record<string, unknown>
        : undefined;

      return {
        content: [textContent(result.json,),],
        ...(structured === undefined ? {} : { structuredContent: structured, }),
      };
    },

    ping(): Record<string, never> {
      return {};
    },
  };
}
