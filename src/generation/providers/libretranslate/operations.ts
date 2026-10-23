// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Health / list-models dispatchers (LibreTranslate) ─────
//
// Threaded with an explicit `state` handle, mirroring the anthropic
// provider's dispatcher structure. The "model catalog" is the instance's
// language catalog (`GET /languages`).

import type { ModelInfo, } from "../types";
import { fetchRaw, handleErrorResponse, } from "./http";
import type { LibreTranslateLanguage, LibreTranslateState, } from "./types";

/**
 * @param state
 * @returns {Promise<ModelInfo[]>}
 */
export async function listModelsDispatch(state: LibreTranslateState,): Promise<ModelInfo[]> {
  const url = new URL(`${state.baseUrl}/languages`,);
  const response = await fetchRaw(state, url.href, undefined, undefined,);

  if (!response.ok) {
    await handleErrorResponse(response,);
  }

  const data = (await response.json()) as LibreTranslateLanguage[];
  return Array.isArray(data,)
    ? Array.from(data, (l,) => ({ id: l.code, raw: l, }),)
    : [];
}

/**
 * @param state
 * @returns {Promise<{ status: "ok" | "degraded" | "down"; model?: string | undefined; latencyMs?: number | undefined; error?: string | undefined; }>}
 */
export async function healthCheckDispatch(state: LibreTranslateState,): Promise<{
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
