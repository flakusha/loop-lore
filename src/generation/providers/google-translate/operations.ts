// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Health / list-models dispatchers (Google Translate) ───
//
// Threaded with an explicit `state` handle, mirroring the anthropic
// provider's dispatcher structure. The "model catalog" is the v2 language
// catalog (`GET /language/translate/v2/languages`, anchored to English
// names).

import type { ModelInfo, } from "../types";
import { fetchRaw, handleErrorResponse, } from "./http";
import type { GoogleLanguage, GoogleTranslateState, } from "./types";

/**
 * @param state
 * @returns {Promise<ModelInfo[]>}
 */
export async function listModelsDispatch(state: GoogleTranslateState,): Promise<ModelInfo[]> {
  const response = await fetchRaw(
    state,
    "/language/translate/v2/languages?target=en",
    undefined,
    undefined,
  );

  if (!response.ok) {
    await handleErrorResponse(response,);
  }

  const data = (await response.json()) as { data?: { languages?: GoogleLanguage[] } };
  const languages = data.data?.languages;
  return Array.isArray(languages,)
    ? Array.from(languages, (l,) => ({ id: l.language, raw: l, }),)
    : [];
}

/**
 * @param state
 * @returns {Promise<{ status: "ok" | "degraded" | "down"; model?: string | undefined; latencyMs?: number | undefined; error?: string | undefined; }>}
 */
export async function healthCheckDispatch(state: GoogleTranslateState,): Promise<{
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
