// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Core generation dispatchers (LibreTranslate) ──────────
//
// Threaded with an explicit `state` handle, mirroring the anthropic
// provider's dispatcher structure. LibreTranslate has no chat/streaming
// surface: complete() is a translation shim (user content = text, response
// content = translated text, system prompts ignored — `source: "auto"`
// defers to the instance's detection), and stream() is unsupported.

import { extractTranslateText, } from "../translate-shim";
import type { GenerateRequest, GenerateResponse, } from "../types";
import { ProviderError, } from "../types";
import { fetchWithRetry, } from "./http";
import type { LibreTranslateResponse, LibreTranslateState, } from "./types";

/**
 * @param state
 * @param req
 * @throws {ProviderError} When no target language or no text is present
 * @returns {Promise<GenerateResponse>}
 */
export async function completeDispatch(
  state: LibreTranslateState,
  req: GenerateRequest,
): Promise<GenerateResponse> {
  const requested = req.model || state.defaultModel;
  if (!requested) {
    throw new ProviderError(
      "LibreTranslate requires a target language (request model)",
      undefined,
      400,
      false,
    );
  }

  const text = extractTranslateText(req,);
  if (!text) {
    throw new ProviderError(
      "LibreTranslate requires user message text",
      undefined,
      400,
      false,
    );
  }

  const url = `${state.baseUrl}/translate`;
  const data = (await fetchWithRetry(
    state,
    url,
    { q: text, source: "auto", target: requested, format: "text", },
    req.signal,
    req.apiKey,
  )) as LibreTranslateResponse;

  return {
    content: data.translatedText ?? "",
    finishReason: "stop",
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, },
  };
}

/**
 * LibreTranslate offers no streaming surface.
 * @param state
 * @param _req
 * @throws {ProviderError} Always — streaming is unsupported (501)
 * @returns {Promise<GenerateResponse>}
 */
export async function streamDispatch(
  state: LibreTranslateState,
  _req: GenerateRequest,
): Promise<GenerateResponse> {
  throw new ProviderError(
    `Provider ${state.baseUrl} (libretranslate) does not support streaming`,
    undefined,
    501,
    false,
  );
}
