// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/providers/ollama-native/index.ts
//
// Ollama native API provider (`/api/chat`, `/api/embed`, `/api/tags`,
// `/api/version`). Unlike the OpenAI-compatible mode (which talks to
// Ollama's `/v1` shim), this targets Ollama's own native endpoints.
// See .plan/epics/epic-provider-plugin-ecosystem.md.

import type { ProviderInstanceConfig, } from "../../../config/schema";
import { BaseProvider, type BaseProviderDispatchers, } from "../base";
import type { ProviderCapabilities, } from "../types";
import { completeDispatch, streamDispatch, } from "./core";
import { embedDispatch, healthCheckDispatch, listModelsDispatch, } from "./operations";
import type { OllamaNativeState, } from "./types";

const CAPABILITIES: ProviderCapabilities = {
  type: "ollama",
  label: "Ollama Native",
  text: true,
  image: false,
  embeddings: true,
  streaming: true,
  tools: true,
  thinking: false,
};

const DISPATCHERS: BaseProviderDispatchers<OllamaNativeState> = {
  complete: completeDispatch,
  stream: streamDispatch,
  healthCheck: healthCheckDispatch,
  listModels: listModelsDispatch,
  embed: embedDispatch,
};

/** */
export class OllamaNativeProvider extends BaseProvider<OllamaNativeState> {
  /**
   * @param config
   */
  constructor(config: ProviderInstanceConfig,) {
    super(config, {
      capabilities: CAPABILITIES,
      dispatchers: DISPATCHERS,
    },);
  }
}
