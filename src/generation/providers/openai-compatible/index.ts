// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/providers/openai-compatible/index.ts
//
// OpenAI-compatible provider — covers llama.cpp, vLLM, Ollama (OpenAI mode),
// LM Studio, tabbyAPI, SGLang, OpenRouter, Together AI, Groq, Fireworks AI.
// See .plan/epics/epic-provider-plugin-ecosystem.md for full API mapping.
//
// `OpenAiCompatibleProvider` extends the shared `BaseProvider`; the
// provider-specific bits live in sibling dispatcher modules.

import type { ProviderInstanceConfig, } from "../../../config/schema";
import type { ProviderCapabilities, } from "../types";
import { BaseProvider, type BaseProviderDispatchers, } from "../base";
import { completeDispatch, streamDispatch, } from "./core";
import { healthCheckDispatch, listModelsDispatch, } from "./operations";
import type { OpenAiCompatibleState, } from "./types";

const CAPABILITIES: ProviderCapabilities = {
  type: "openai-compatible",
  label: "OpenAI Compatible",
  text: true,
  image: false,
  embeddings: false,
  streaming: true,
  tools: true,
  thinking: true,
};

const DISPATCHERS: BaseProviderDispatchers<OpenAiCompatibleState> = {
  complete: completeDispatch,
  stream: streamDispatch,
  healthCheck: healthCheckDispatch,
  listModels: listModelsDispatch,
};

/** */
export class OpenAiCompatibleProvider extends BaseProvider<OpenAiCompatibleState> {
  /**
   * @param config
   */
  constructor(config: ProviderInstanceConfig) {
    super(config, {
      capabilities: CAPABILITIES,
      dispatchers: DISPATCHERS,
    });
  }
}
