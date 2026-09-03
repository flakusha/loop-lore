// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/providers/anthropic/index.ts
//
// Anthropic native Messages API provider (`/v1/messages`). Auth via
// `x-api-key` (set in config `generation.providers.anthropic.apiKey`).
// See .plan/epics/epic-provider-plugin-ecosystem.md.

import type { ProviderInstanceConfig, } from "../../../config/schema";
import type { ProviderCapabilities, } from "../types";
import { BaseProvider, type BaseProviderDispatchers, } from "../base";
import { completeDispatch, streamDispatch, } from "./core";
import { healthCheckDispatch, listModelsDispatch, } from "./operations";
import type { AnthropicState, } from "./types";

const CAPABILITIES: ProviderCapabilities = {
  type: "anthropic",
  label: "Anthropic",
  text: true,
  image: true,
  embeddings: false,
  streaming: true,
  tools: true,
  thinking: true,
};

const DISPATCHERS: BaseProviderDispatchers<AnthropicState> = {
  complete: completeDispatch,
  stream: streamDispatch,
  healthCheck: healthCheckDispatch,
  listModels: listModelsDispatch,
};

/** */
export class AnthropicProvider extends BaseProvider<AnthropicState> {
  /**
   * @param config
   */
  constructor(config: ProviderInstanceConfig) {
    super(config, {
      capabilities: CAPABILITIES,
      defaultBaseUrl: "https://api.anthropic.com",
      dispatchers: DISPATCHERS,
    });
  }
}
