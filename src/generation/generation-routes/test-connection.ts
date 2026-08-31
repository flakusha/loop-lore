// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Config, } from "../../config/schema";
import { jsonError, jsonResponse, } from "../../routes/http-utils";
import { getProvider, } from "../providers/registry";

// ── Route: Test connection (validator) ────────────────────

/**
 * @param body
 */
function validateTestConnection(body: unknown,): { provider: string } | null {
  if (!body || typeof body !== "object") { return null; }
  const b = body as Record<string, unknown>;
  if (typeof b.provider !== "string" || !b.provider) { return null; }
  return { provider: b.provider, };
}

// ── Route: Test connection ────────────────────────────────────

/**
 * POST /api/generation/test-connection
 *
 * Test connectivity to a provider. Body:
 *   { provider: string, model?: string }
 * @param body
 * @param _config
 */
export async function handleTestConnection(body: unknown, _config?: Config,): Promise<Response> {
  const input = validateTestConnection(body,);

  if (!input) {
    return jsonError({ message: "provider is required", status: 400, },);
  }

  const { provider: providerName, } = input;

  const provider = getProvider(providerName,);
  if (!provider) {
    return jsonError({ message: `Provider "${providerName}" not found`, status: 404, },);
  }

  try {
    const result = await provider.healthCheck();
    return jsonResponse({
      ok: result.status === "ok",
      status: result.status,
      model: result.model,
      latencyMs: result.latencyMs,
      error: result.error,
    },);
  } catch (error) {
    return jsonResponse({
      ok: false,
      status: "error",
      error: (error as Error).message,
    },);
  }
}
