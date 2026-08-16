// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Health / list-models dispatchers (Anthropic) ─────────
//
// Threaded with an explicit `state` handle, mirroring the openai-compatible
// provider's dispatcher structure.

import type { ModelInfo, } from "../types";
import { fetchRaw, handleErrorResponse, } from "./http";
import type { AnthropicModelsResponse, AnthropicState, } from "./types";

export async function listModelsDispatch(state: AnthropicState,): Promise<ModelInfo[]> {
  const url = new URL(`${state.baseUrl}/v1/models`,);
  const response = await fetchRaw(state, url.href, undefined, undefined,);

  if (!response.ok) {
    await handleErrorResponse(response,);
  }

  const data = (await response.json()) as AnthropicModelsResponse;
  return data.data
    ? Array.from(data.data, (m,) => ({
      id: m.id,
      raw: m,
    }),)
    : [];
}

export async function healthCheckDispatch(state: AnthropicState,): Promise<{
  status: "ok" | "degraded" | "down";
  model?: string;
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const models = await listModelsDispatch(state,);
    const latencyMs = Date.now() - start;
    return {
      status: models.length > 0 ? "ok" : "degraded",
      model: models[0]?.id,
      latencyMs,
    };
  } catch (error) {
    return {
      status: "down",
      error: (error as Error).message,
      latencyMs: Date.now() - start,
    };
  }
}
