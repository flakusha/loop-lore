// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/mcp/jsonrpc.ts — minimal JSON-RPC 2.0
// envelope handling for the MCP Streamable HTTP transport.
//
// HAND-ROLLED BY SLICE DECISION: `@modelcontextprotocol/sdk` is NOT in
// package.json/bun.lock and no dependency was added (flagged to the owner;
// the epic's SDK adoption is provisional). This file implements exactly the
// envelope semantics the pinned spec (2025/2026 revision, sessions removed)
// needs: request/notification/response discrimination, batch arrays, and
// the -32700/-32600/-32601/-32602/-32603 error codes.

import { safeJsonParse, } from "../../../utils";

/** JSON-RPC protocol error codes (spec 2.0). */
export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INVALID_PARAMS = -32602;
export const RPC_INTERNAL_ERROR = -32603;

export type JsonRpcId = string | number | null;

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcErrorObject;
}

/** Handler-thrown protocol error, mapped onto an error envelope verbatim. */
export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message,);
  }
}

/**
 * Invoke one RPC method. Return the result value; throw {@link RpcError}
 * for protocol-coded failures (method not found, invalid params) or any
 * Error for an internal error.
 */
export type JsonRpcHandler = (
  method: string,
  params: unknown,
  id: JsonRpcId,
) => Promise<unknown> | unknown;

/** Build a success envelope. */
export function successResponse(id: JsonRpcId, result: unknown,): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result, };
}

/** Build an error envelope. */
export function errorResponse(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data, }), }, };
}

function isObject(value: unknown,): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value,);
}

function validId(value: unknown,): JsonRpcId {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

async function dispatchOne(
  entry: unknown,
  handle: JsonRpcHandler,
): Promise<JsonRpcResponse | null> {
  if (!isObject(entry,)) {
    return errorResponse(null, RPC_INVALID_REQUEST, "Invalid Request",);
  }

  const id = validId(entry.id,);
  const isNotification = !("id" in entry);

  if (entry.jsonrpc !== "2.0" || typeof entry.method !== "string") {
    return isNotification ? null : errorResponse(id, RPC_INVALID_REQUEST, "Invalid Request",);
  }

  try {
    const result = await handle(entry.method, entry.params, id,);
    return isNotification ? null : successResponse(id, result,);
  } catch (error) {
    if (isNotification) { return null; }

    if (error instanceof RpcError) {
      return errorResponse(id, error.code, error.message, error.data,);
    }

    return errorResponse(
      id,
      RPC_INTERNAL_ERROR,
      "Internal error",
      error instanceof Error ? error.message : String(error,),
    );
  }
}

/**
 * Parse and dispatch one JSON-RPC payload (single object or batch array).
 * @param raw - the unparsed request body text
 * @param handle - the method handler
 * @returns the response envelope(s), or null when nothing needs answering
 *   (parse failures and invalid requests ALWAYS answer; notification-only
 *   batches answer nothing)
 */
export async function dispatchJsonRpc(
  raw: string,
  handle: JsonRpcHandler,
): Promise<JsonRpcResponse[] | JsonRpcResponse | null> {
  const parsedResult = safeJsonParse<unknown>(raw,);
  if (!parsedResult.ok) {
    return errorResponse(null, RPC_PARSE_ERROR, "Parse error",);
  }

  const parsed: unknown = parsedResult.value;

  const isBatch = Array.isArray(parsed,);
  const entries: unknown[] = Array.isArray(parsed,) ? parsed : [parsed,];
  if (entries.length === 0) {
    return errorResponse(null, RPC_INVALID_REQUEST, "Invalid Request",);
  }

  const responses: JsonRpcResponse[] = [];
  for (const entry of entries) {
    const response = await dispatchOne(entry, handle,);
    if (response) { responses.push(response,); }
  }

  if (isBatch) { return responses.length > 0 ? responses : null; }
  return responses[0] ?? null;
}
