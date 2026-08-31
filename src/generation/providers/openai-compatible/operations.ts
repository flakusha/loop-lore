// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Health / list-models dispatchers ─────────────────────
//
// Extracted from the `OpenAiCompatibleProvider` class body. Threaded with an
// explicit `state` handle (the class's private fields).

import type { ModelInfo, } from "../types";
import { fetchRaw, handleErrorResponse, } from "./http";
import { modelInfoFromOpenAi, } from "./metadata";
import type { OpenAiCompatibleState, } from "./types";

/**
 * @param state
 */
export async function listModelsDispatch(state: OpenAiCompatibleState,): Promise<ModelInfo[]> {
  const url = new URL(`${state.baseUrl}/models`,);
  const response = await fetchRaw(state, url.href, undefined, undefined,);

  if (!response.ok) {
    await handleErrorResponse(response,);
  }

  const data = (await response.json()) as { data?: Record<string, unknown>[] };
  return data.data
    ? Array.from(data.data, (m,) => modelInfoFromOpenAi(m,),)
    : [];
}

/**
 * @param state
 */
export async function healthCheckDispatch(state: OpenAiCompatibleState,): Promise<{
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
