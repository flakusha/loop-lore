// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/providers/google-translate/index.ts
//
// Google Cloud Translation v2 provider (`POST /language/translate/v2`).
// Auth via the `key` query parameter (set in config
// `generation.providers.googleTranslate.apiKey`). See
// .plan/epics/epic-provider-plugin-ecosystem.md.

import type { GoogleTranslateProviderConfig, } from "../../../config/schema";
import { BaseProvider, type BaseProviderDispatchers, } from "../base";
import type { ProviderCapabilities, } from "../types";
import { completeDispatch, streamDispatch, } from "./core";
import { healthCheckDispatch, listModelsDispatch, } from "./operations";
import type { GoogleTranslateState, } from "./types";

const DEFAULT_BASE_URL = "https://translation.googleapis.com";

const CAPABILITIES: ProviderCapabilities = {
  type: "google-translate",
  label: "Google Translate",
  text: true,
  image: false,
  embeddings: false,
  streaming: false,
  tools: false,
  thinking: false,
};

const DISPATCHERS: BaseProviderDispatchers<GoogleTranslateState> = {
  complete: completeDispatch,
  stream: streamDispatch,
  healthCheck: healthCheckDispatch,
  listModels: listModelsDispatch,
};

/** */
export class GoogleTranslateProvider extends BaseProvider<GoogleTranslateState> {
  /**
   * @param config
   */
  constructor(config: GoogleTranslateProviderConfig,) {
    super(
      {
        name: config.name,
        label: config.label,
        baseUrl: DEFAULT_BASE_URL,
        apiKey: config.apiKey,
        model: config.model,
        timeout: config.timeout,
        retries: config.retries,
        allowUserApiKey: config.allowUserApiKey,
        models: {},
      },
      {
        capabilities: CAPABILITIES,
        dispatchers: DISPATCHERS,
        buildState: (base,) => ({
          baseUrl: base.baseUrl,
          apiKey: base.apiKey,
          defaultModel: base.defaultModel,
          timeout: base.timeout,
          retries: base.retries,
          headers: base.headers,
        }),
      },
    );
  }
}
