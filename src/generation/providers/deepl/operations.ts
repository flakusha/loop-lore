// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Health / list-models dispatchers (DeepL) ──────────────
//
// Threaded with an explicit `state` handle, mirroring the anthropic
// provider's dispatcher structure. The "model catalog" is the DeepL target
// language catalog (`GET /v2/languages?type=target`).

import type { ModelInfo, } from "../types";
import { fetchRaw, handleErrorResponse, } from "./http";
import type { DeepLLanguage, DeepLState, } from "./types";

/**
 * @param state
 * @returns {Promise<ModelInfo[]>}
 */
export async function listModelsDispatch(state: DeepLState,): Promise<ModelInfo[]> {
  const url = new URL(`${state.baseUrl}/v2/languages`,);
  url.searchParams.set("type", "target",);
  const response = await fetchRaw(state, url.href, undefined, undefined,);

  if (!response.ok) {
    await handleErrorResponse(response,);
  }

  const data = (await response.json()) as DeepLLanguage[];
  return Array.isArray(data,)
    ? Array.from(data, (l,) => ({ id: l.language, raw: l, }),)
    : [];
}

/**
 * @param state
 * @returns {Promise<{ status: "ok" | "degraded" | "down"; model?: string | undefined; latencyMs?: number | undefined; error?: string | undefined; }>}
 */
export async function healthCheckDispatch(state: DeepLState,): Promise<{
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
