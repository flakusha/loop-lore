// SPDX-License-Identifier: Apache-2.0

/**
 * Shared input validation for the plugin tree.
 *
 * Plugin routes are raw `Request` handlers, so nothing validates their bodies
 * for them. Each plugin therefore owns a per-resource schema module (one DTO
 * per endpoint) that parses through these helpers: the body shape, the ranges
 * and the allowed values are checked once, at the boundary, before any side
 * effect — instead of a check per handler that drifts from its twin.
 */

import { Value, } from "@sinclair/typebox/value";
import type { Static, TSchema, } from "@sinclair/typebox";

/** A validated payload, or the reason the payload was rejected. */
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Check a payload against a resource schema.
 *
 * @param schema - the resource schema
 * @param payload - the untrusted value
 * @param messages - per-field message overrides, keyed by field name
 * @returns The typed value, or the first error as a readable message.
 */
export function parseSchema<T extends TSchema>(
  schema: T,
  payload: unknown,
  messages: Record<string, string> = {},
): ParseResult<Static<T>> {
  if (Value.Check(schema, payload)) {
    return { ok: true, value: payload as Static<T> };
  }
  const errors = [...Value.Errors(schema, payload)];
  for (const error of errors) {
    const field = error.path.replace(/^\//, "");
    if (field && messages[field]) {
      return { ok: false, error: messages[field] };
    }
  }
  const first = errors[0];
  if (!first) {
    return { ok: false, error: "invalid request body" };
  }
  const field = first.path.replace(/^\//, "");
  return { ok: false, error: `${field || "body"}: ${first.message}` };
}

/**
 * Read a JSON body off a request.
 *
 * An empty body is not an error (the endpoints that take no required field
 * treat it as "no fields"), but a body that is not JSON is.
 *
 * @param request - the incoming request
 * @returns The parsed body (undefined for an empty body), or an error message.
 */
export async function readJsonBody(request: Request): Promise<ParseResult<unknown>> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }
  if (text.trim() === "") {
    return { ok: true, value: undefined };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }
}
