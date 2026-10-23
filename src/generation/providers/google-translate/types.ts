// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Internal state + response payload types for the Google Translate provider.

/** Private runtime state threaded through the dispatcher modules. */
export interface GoogleTranslateState {
  baseUrl: string;
  apiKey: string | undefined;
  defaultModel: string;
  timeout: number;
  retries: number;
  headers: Record<string, string>;
}

/** One entry of the v2 translate response. */
export interface GoogleTranslation {
  translatedText: string;
  detectedSourceLanguage?: string;
}

/** Non-streaming `POST /language/translate/v2` response. */
export interface GoogleTranslateResponse {
  data: { translations: GoogleTranslation[] };
}

/** One entry of the v2 languages catalog. */
export type GoogleLanguage = {
  language: string;
  name?: string;
};
