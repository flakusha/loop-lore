// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Core generation dispatchers (Google Translate) ────────
//
// Threaded with an explicit `state` handle, mirroring the anthropic
// provider's dispatcher structure. The v2 API has no chat/streaming
// surface: complete() is a translation shim (user content = text, response
// content = translated text, system prompts ignored — the source language
// is left to Google's detection), and stream() is unsupported.

import { extractTranslateText, } from "../translate-shim";
import type { GenerateRequest, GenerateResponse, } from "../types";
import { ProviderError, } from "../types";
import { fetchWithRetry, } from "./http";
import type { GoogleTranslateResponse, GoogleTranslateState, } from "./types";

/**
 * @param state
 * @param req
 * @throws {ProviderError} When no target language or no text is present
 * @returns {Promise<GenerateResponse>}
 */
export async function completeDispatch(
  state: GoogleTranslateState,
  req: GenerateRequest,
): Promise<GenerateResponse> {
  const requested = req.model || state.defaultModel;
  if (!requested) {
    throw new ProviderError(
      "Google Translate requires a target language (request model)",
      undefined,
      400,
      false,
    );
  }

  const text = extractTranslateText(req,);
  if (!text) {
    throw new ProviderError(
      "Google Translate requires user message text",
      undefined,
      400,
      false,
    );
  }

  const data = (await fetchWithRetry(
    state,
    "/language/translate/v2",
    { q: text, target: requested, format: "text", },
    req.signal,
    req.apiKey,
  )) as GoogleTranslateResponse;

  const content = (data.data?.translations ?? []).map((t,) => t.translatedText).join("",);
  return {
    content,
    finishReason: "stop",
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, },
  };
}

/**
 * Google Translation v2 offers no streaming surface.
 * @param state
 * @param _req
 * @throws {ProviderError} Always — streaming is unsupported (501)
 * @returns {Promise<GenerateResponse>}
 */
export async function streamDispatch(
  state: GoogleTranslateState,
  _req: GenerateRequest,
): Promise<GenerateResponse> {
  throw new ProviderError(
    `Provider ${state.baseUrl} (google-translate) does not support streaming`,
    undefined,
    501,
    false,
  );
}
