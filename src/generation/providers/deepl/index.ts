// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/providers/deepl/index.ts
//
// DeepL translation API provider (`POST /v2/translate`). Auth via the
// `DeepL-Auth-Key` header (set in config
// `generation.providers.deepl.authKey`); `freeTier` switches between the
// free (api-free.deepl.com) and pro (api.deepl.com) endpoints. See
// .plan/epics/epic-provider-plugin-ecosystem.md.

import type { DeepLProviderConfig, } from "../../../config/schema";
import { BaseProvider, type BaseProviderDispatchers, } from "../base";
import type { ProviderCapabilities, } from "../types";
import { completeDispatch, streamDispatch, } from "./core";
import { healthCheckDispatch, listModelsDispatch, } from "./operations";
import type { DeepLState, } from "./types";

const FREE_BASE_URL = "https://api-free.deepl.com";
const PRO_BASE_URL = "https://api.deepl.com";

const CAPABILITIES: ProviderCapabilities = {
  type: "deepl",
  label: "DeepL",
  text: true,
  image: false,
  embeddings: false,
  streaming: false,
  tools: false,
  thinking: false,
};

const DISPATCHERS: BaseProviderDispatchers<DeepLState> = {
  complete: completeDispatch,
  stream: streamDispatch,
  healthCheck: healthCheckDispatch,
  listModels: listModelsDispatch,
};

/** */
export class DeepLProvider extends BaseProvider<DeepLState> {
  /**
   * @param config
   */
  constructor(config: DeepLProviderConfig,) {
    super(
      {
        name: config.name,
        label: config.label,
        baseUrl: config.freeTier ? FREE_BASE_URL : PRO_BASE_URL,
        apiKey: config.authKey,
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
          apiKey: config.authKey,
          defaultModel: base.defaultModel,
          timeout: base.timeout,
          retries: base.retries,
          headers: base.headers,
        }),
      },
    );
  }
}
