// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Internal state + response payload types for the LibreTranslate provider.

/** Private runtime state threaded through the dispatcher modules. */
export interface LibreTranslateState {
  baseUrl: string;
  apiKey: string | undefined;
  defaultModel: string;
  timeout: number;
  retries: number;
  headers: Record<string, string>;
}

/** Non-streaming `POST /translate` response. */
export interface LibreTranslateResponse {
  translatedText: string;
  detectedLanguage?: { confidence?: number; language?: string };
  alternatives?: string[];
}

/** One entry of the `GET /languages` catalog. */
export type LibreTranslateLanguage = {
  code: string;
  name: string;
};
