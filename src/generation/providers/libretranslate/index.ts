// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/providers/libretranslate/index.ts
//
// LibreTranslate translation API provider (`POST /translate`). Talks to any
// instance via config `generation.providers.libretranslate.baseUrl`; the
// optional `apiKey` is sent as the `api_key` body field. See
// .plan/epics/epic-provider-plugin-ecosystem.md.

import type { LibreTranslateProviderConfig, } from "../../../config/schema";
import { BaseProvider, type BaseProviderDispatchers, } from "../base";
import type { ProviderCapabilities, } from "../types";
import { completeDispatch, streamDispatch, } from "./core";
import { healthCheckDispatch, listModelsDispatch, } from "./operations";
import type { LibreTranslateState, } from "./types";

const CAPABILITIES: ProviderCapabilities = {
  type: "libretranslate",
  label: "LibreTranslate",
  text: true,
  image: false,
  embeddings: false,
  streaming: false,
  tools: false,
  thinking: false,
};

const DISPATCHERS: BaseProviderDispatchers<LibreTranslateState> = {
  complete: completeDispatch,
  stream: streamDispatch,
  healthCheck: healthCheckDispatch,
  listModels: listModelsDispatch,
};

/** */
export class LibreTranslateProvider extends BaseProvider<LibreTranslateState> {
  /**
   * @param config
   */
  constructor(config: LibreTranslateProviderConfig,) {
    super(
      {
        name: config.name,
        label: config.label,
        baseUrl: config.baseUrl,
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
