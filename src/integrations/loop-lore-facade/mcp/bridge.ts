// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/mcp/bridge.ts - the stateless MCP
// transport bridge: raw JSON-RPC payload in, JSON-RPC envelope(s) out.
//
// Protocol correctness comes from the SDK: each payload gets a fresh
// `buildMcpServer` wired to an InMemoryTransport peer; requests are awaited
// by id, notifications fire-and-forget. Envelopes for payloads that never
// reach the SDK (parse failures, invalid requests, empty batches) are built
// as plain spec objects because the SDK response schema cannot express the
// spec-mandated `id: null`.

import { InMemoryTransport, } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ErrorCode,
  isJSONRPCNotification,
  isJSONRPCRequest,
  type JSONRPCMessage,
  JSONRPCMessageSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { safeJsonParse, } from "../../../utils";
import { buildMcpServer, type McpServerDeps, } from "./server";

/** Safety net: a request whose response never arrives fails, never hangs. */
const RESPONSE_DEADLINE_MS = 10_000;

/** RPC id as the JSON-RPC 2.0 spec allows it (null for unparseable payloads). */
type RpcId = string | number | null;

/** The HTTP answer for one payload: 200 + envelope(s), or 202 + no body. */
export interface McpPayloadOutcome {
  status: 200 | 202;
  body: unknown;
}

function errorEnvelope(id: RpcId, code: number, message: string,): unknown {
  return { jsonrpc: "2.0", id, error: { code, message, }, };
}

function extractId(entry: unknown,): RpcId {
  if (typeof entry === "object" && entry !== null) {
    const id = (entry as { id?: unknown }).id;
    if (typeof id === "string" || typeof id === "number") {
      return id;
    }
  }

  return null;
}

/** Stateless MCP JSON-RPC endpoint logic (one instance per route plugin). */
export class McpTransportBridge {
  /**
   * Dispatch a raw JSON-RPC payload (single message or batch array).
   * @param raw - the undecoded request body (body must stay reachable so
   *   JSON-RPC -32700 parse errors are answerable)
   * @param deps - per-payload deps (registry + version + facade context)
   * @returns the response envelope(s); `body: null` means 202 Accepted
   */
  async handlePayload(raw: string, deps: McpServerDeps,): Promise<McpPayloadOutcome> {
    const parsedResult = safeJsonParse<unknown>(raw,);
    if (!parsedResult.ok) {
      return { status: 200, body: errorEnvelope(null, ErrorCode.ParseError, "Parse error",), };
    }

    const parsed = parsedResult.value;
    const isBatch = Array.isArray(parsed,);
    const entries: unknown[] = isBatch ? parsed : [parsed,];
    if (entries.length === 0) {
      return { status: 200, body: errorEnvelope(null, ErrorCode.InvalidRequest, "Invalid Request",), };
    }

    // Fresh stateless server graph per payload: no sessions, no cross-talk.
    const [client, serverTransport,] = InMemoryTransport.createLinkedPair();
    const pending = new Map<string | number, (message: JSONRPCMessage,) => void>();
    client.onmessage = (message,) => {
      if ("id" in message && message.id !== undefined) {
        const resolve = pending.get(message.id,);
        if (resolve !== undefined) {
          pending.delete(message.id,);
          resolve(message,);
        }
      }
    };

    const server = buildMcpServer(deps,);
    await server.connect(serverTransport,);

    const responses: unknown[] = [];

    for (const entry of entries) {
      const parsedMessage = JSONRPCMessageSchema.safeParse(entry,);
      if (!parsedMessage.success) {
        responses.push(errorEnvelope(extractId(entry,), ErrorCode.InvalidRequest, "Invalid Request",),);
        continue;
      }

      const message = parsedMessage.data;
      if (isJSONRPCRequest(message,)) {
        // The in-memory transport delivers synchronously, so the resolver
        // must be registered BEFORE send; the response resolves it during
        // dispatch.
        const { promise, resolve: resolveResponse, reject, } = Promise.withResolvers<JSONRPCMessage>();
        const deadline = setTimeout(
          () => reject(new Error("mcp response deadline exceeded",),),
          RESPONSE_DEADLINE_MS,
        );

        pending.set(message.id, (resolved,) => {
          clearTimeout(deadline,);
          resolveResponse(resolved,);
        },);

        await client.send(message,);
        responses.push(await promise,);
      } else if (isJSONRPCNotification(message,)) {
        await client.send(message,);
      }
    }

    await client.close();

    if (responses.length === 0) {
      return { status: 202, body: null, };
    }

    return { status: 200, body: isBatch ? responses : responses[0], };
  }
}
