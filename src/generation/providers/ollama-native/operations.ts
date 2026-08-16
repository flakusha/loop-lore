// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Health / list-models / embed dispatchers (Ollama native) ─────
//
// Threaded with an explicit `state` handle, mirroring the openai-compatible
// provider's dispatcher structure.

import type { ModelInfo, } from "../types";
import { fetchRaw, handleErrorResponse, } from "./http";
import type { OllamaEmbedResponse, OllamaNativeState, OllamaTagsResponse, OllamaVersionResponse, } from "./types";

export async function listModelsDispatch(state: OllamaNativeState,): Promise<ModelInfo[]> {
  const url = new URL(`${state.baseUrl}/api/tags`,);
  const response = await fetchRaw(state, url.href, undefined, undefined,);

  if (!response.ok) {
    await handleErrorResponse(response,);
  }

  const data = (await response.json()) as OllamaTagsResponse;
  return data.models
    ? Array.from(data.models, (m,) => ({
      id: m.name ?? m.model ?? "",
      paramSize: m.details?.parameter_size,
      raw: m,
    }),)
    : [];
}

export async function healthCheckDispatch(state: OllamaNativeState,): Promise<{
  status: "ok" | "degraded" | "down";
  model?: string;
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const url = new URL(`${state.baseUrl}/api/version`,);
    const response = await fetchRaw(state, url.href, undefined, undefined,);

    if (!response.ok) {
      await handleErrorResponse(response,);
    }
    const data = (await response.json()) as OllamaVersionResponse;
    const latencyMs = Date.now() - start;

    let models: ModelInfo[] = [];
    try {
      models = await listModelsDispatch(state,);
    } catch {
      /* degraded — version reachable but tags listing failed */
    }

    return {
      status: models.length > 0 ? "ok" : "degraded",
      model: models[0]?.id,
      latencyMs,
      ...(!data.version && { error: "no version reported", }),
    };
  } catch (error) {
    return {
      status: "down",
      error: (error as Error).message,
      latencyMs: Date.now() - start,
    };
  }
}

export async function embedDispatch(
  state: OllamaNativeState,
  input: string | string[],
  model: string,
): Promise<number[][]> {
  const url = new URL(`${state.baseUrl}/api/embed`,);
  const response = await fetchRaw(state, url.href, {
    model,
    input: Array.isArray(input,) ? input : [input,],
  }, undefined,);

  if (!response.ok) {
    await handleErrorResponse(response,);
  }

  const data = (await response.json()) as OllamaEmbedResponse;
  const embeddings = data.embeddings ?? [];
  return Array.isArray(input,) ? embeddings : (embeddings[0] ? [embeddings[0],] : []);
}
