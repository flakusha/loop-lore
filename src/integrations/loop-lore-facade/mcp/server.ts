// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/mcp/server.ts - the MCP PROTOCOL LAYER
// (@modelcontextprotocol/sdk `Server`) over the facade op registry
// (TASK-MCP-BRIDGE: tools/list + tools/call).
//
// SINGLE SOURCE OF TRUTH: tools derive from registry.manifest() (+ resolve()
// for bodySchema); execution is runFacadeOp with a FacadeContext the HTTP
// layer builds from the AUTHENTICATED principal - never from the RPC body.
// The SDK owns the wire protocol: version negotiation (a requested revision
// the SDK does not support - e.g. one newer than its LATEST - answers the
// SDK's latest per the spec's downgrade rule), initialize/ping handling, and
// the JSON-RPC envelope/error codes (handler-thrown McpError.code propagates
// into the error envelope).
//
// STATELESS by slice decision: a fresh Server graph is built per payload and
// no session ids exist - initialize-per-request is tolerated.

import { Server, } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { safeJsonStringify, } from "../../../utils";
import { type FacadeRegistry, runFacadeOp, } from "../registry";
import type { FacadeContext, } from "../types";

export const MCP_SERVER_NAME = "loop-lore-facade";

/** Deps bound per HTTP payload (the facade context carries the principal). */
export interface McpServerDeps {
  registry: FacadeRegistry;
  version: string;
  ctx: FacadeContext;
}

function textContent(value: unknown,): { type: "text"; text: string } {
  const serialized = safeJsonStringify(value ?? null,);
  return { type: "text", text: serialized.ok ? serialized.value : "null", };
}

/**
 * Build the SDK MCP server over a facade registry + per-payload context.
 * @param deps - registry (single source of truth), app version for
 *   serverInfo, and the authenticated facade context for this payload
 * @returns a connect-ready SDK Server instance
 */
export function buildMcpServer(deps: McpServerDeps,): Server {
  const { registry, ctx, } = deps;

  const server = new Server(
    { name: MCP_SERVER_NAME, version: deps.version, },
    { capabilities: { tools: { listChanged: false, }, }, },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.manifest().map((entry,) => {
      const schema = registry.resolve(entry.name,)?.bodySchema;

      return {
        name: entry.name,
        description: schema === undefined
          // Permissive-schema note: ops without a declared body schema accept
          // any JSON object (each handler validates authoritatively).
          ? `${entry.description} (input: any JSON object)`
          : entry.description,
        inputSchema: schema ?? { type: "object", additionalProperties: true, },
      };
    },),
  }),);

  server.setRequestHandler(CallToolRequestSchema, async (request,) => {
    const { name, arguments: args = {}, } = request.params;

    if (registry.resolve(name,) === undefined) {
      throw new McpError(ErrorCode.InvalidParams, `unknown tool "${name}"`,);
    }

    const result = await runFacadeOp(registry, ctx, name, args,);

    if (!result.ok) {
      return { content: [textContent(result.json,),], isError: true, };
    }

    // structuredContent is object-only per spec; arrays/primitives ride the
    // text content alone.
    const structured = typeof result.json === "object" && result.json !== null
      ? result.json
      : undefined;

    return {
      content: [textContent(result.json,),],
      ...(structured === undefined ? {} : { structuredContent: structured, }),
    };
  },);

  // initialize + ping are served by the SDK itself (negotiation + empty
  // result); no handler registration needed.

  return server;
}
