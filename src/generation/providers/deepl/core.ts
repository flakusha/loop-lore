// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Core generation dispatchers (DeepL) ───────────────────
//
// Threaded with an explicit `state` handle, mirroring the anthropic
// provider's dispatcher structure. DeepL has no chat/streaming surface:
// complete() is a translation shim (user content = text, response content
// = translated text, system prompts ignored — source language is left to
// DeepL's detection), and stream() is unsupported.

import { extractTranslateText, } from "../translate-shim";
import type { GenerateRequest, GenerateResponse, } from "../types";
import { ProviderError, } from "../types";
import { fetchWithRetry, } from "./http";
import type { DeepLState, DeepLTranslateResponse, } from "./types";

/**
 * Normalize a language code into DeepL's `target_lang` form (uppercase,
 * region qualified — e.g. "en-us" → "EN-US", "de" → "DE").
 * @param code
 * @returns {string}
 */
export function normalizeDeepLTarget(code: string,): string {
  return code.trim().toUpperCase();
}

/**
 * @param state
 * @param req
 * @throws {ProviderError} When no target language or no text is present
 * @returns {Promise<GenerateResponse>}
 */
export async function completeDispatch(
  state: DeepLState,
  req: GenerateRequest,
): Promise<GenerateResponse> {
  const requested = req.model || state.defaultModel;
  if (!requested) {
    throw new ProviderError(
      "DeepL translate requires a target language (request model)",
      undefined,
      400,
      false,
    );
  }

  const text = extractTranslateText(req,);
  if (!text) {
    throw new ProviderError(
      "DeepL translate requires user message text",
      undefined,
      400,
      false,
    );
  }

  const url = `${state.baseUrl}/v2/translate`;
  const data = (await fetchWithRetry(
    state,
    url,
    { text: [text,], target_lang: normalizeDeepLTarget(requested,), },
    req.signal,
    req.apiKey,
  )) as DeepLTranslateResponse;

  const content = (data.translations ?? []).map((t,) => t.text).join("",);
  return {
    content,
    finishReason: "stop",
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, },
  };
}

/**
 * DeepL offers no streaming surface.
 * @param state
 * @param _req
 * @throws {ProviderError} Always — streaming is unsupported (501)
 * @returns {Promise<GenerateResponse>}
 */
export async function streamDispatch(
  state: DeepLState,
  _req: GenerateRequest,
): Promise<GenerateResponse> {
  throw new ProviderError(
    `Provider ${state.baseUrl} (deepl) does not support streaming`,
    undefined,
    501,
    false,
  );
}
