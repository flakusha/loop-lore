// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Shared complete() shim helper for the dedicated translation providers
// (deepl / libretranslate / google-translate).
//
// These APIs have no chat surface: a GenerateRequest is mapped to
// "translate this text into the request's model (target language)". The
// system prompt (the LLM translation instruction) is intentionally IGNORED
// — MT endpoints take text + target only, and the source language is left
// to the provider's detection.

import type { GenerateRequest, } from "./types";

/**
 * Extract the text to translate: the LAST user message's content.
 * @param req
 * @returns {string}
 */
export function extractTranslateText(req: GenerateRequest,): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const message = req.messages[i];
    if (message !== undefined && message.role === "user") { return message.content; }
  }

  return "";
}
