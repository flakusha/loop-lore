// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Internal state + response payload types for the DeepL provider.

/** Private runtime state threaded through the dispatcher modules. */
export interface DeepLState {
  baseUrl: string;
  apiKey: string | undefined;
  defaultModel: string;
  timeout: number;
  retries: number;
  headers: Record<string, string>;
}

/** One entry of the `POST /v2/translate` response. */
export interface DeepLTranslation {
  detected_source_language?: string;
  text: string;
}

/** Non-streaming `POST /v2/translate` response. */
export interface DeepLTranslateResponse {
  translations: DeepLTranslation[];
}

/** One entry of the `GET /v2/languages` catalog. */
export type DeepLLanguage = {
  language: string;
  name: string;
  supports_formality?: boolean;
};
