// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/providers/openai-compatible/index.ts
//
// OpenAI-compatible provider — covers llama.cpp, vLLM, Ollama (OpenAI mode),
// LM Studio, tabbyAPI, SGLang, OpenRouter, Together AI, Groq, Fireworks AI.
// See .plan/epics/epic-provider-plugin-ecosystem.md for full API mapping.
//
// `OpenAiCompatibleProvider` stays a class so its methods remain on the
// prototype; the method bodies live in sibling dispatcher modules, each
// threaded with an explicit `state` handle (http.ts, core.ts, operations.ts).

import type { ProviderInstanceConfig, } from "../../../config/schema";
import { validateProviderUrl, } from "../../../utils/url-validation";
import type {
  GenerateRequest,
  GenerateResponse,
  LLMProvider,
  ModelInfo,
  ProviderCapabilities,
  StreamHandler,
} from "../types";
import { ProviderError, } from "../types";
import { completeDispatch, streamDispatch, } from "./core";
import { healthCheckDispatch, listModelsDispatch, } from "./operations";
import type { OpenAiCompatibleState, } from "./types";

// ── Capabilities ──────────────────────────────────────────

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

// ── Provider class ────────────────────────────────────────

export class OpenAiCompatibleProvider implements LLMProvider {
  private readonly state: OpenAiCompatibleState;
  readonly capabilities = CAPABILITIES;

  constructor(config: ProviderInstanceConfig,) {
    const baseUrl = config.baseUrl.replace(/\/+$/, "",);
    const validated = validateProviderUrl(baseUrl,);
    if (!validated.ok) {
      throw new ProviderError(
        `Invalid provider URL (${config.name}): ${validated.error}`,
        undefined,
        400,
        false,
      );
    }
    this.state = {
      baseUrl,
      apiKey: config.apiKey,
      defaultModel: config.model,
      timeout: config.timeout,
      retries: config.retries,
      headers: config.headers ?? {},
    };
  }

  // ── Core generation ────────────────────────────────────

  async complete(req: GenerateRequest,): Promise<GenerateResponse> {
    return completeDispatch(this.state, req,);
  }

  async stream(req: GenerateRequest, handler: StreamHandler,): Promise<GenerateResponse> {
    return streamDispatch(this.state, req, handler,);
  }

  // ── Health check ───────────────────────────────────────

  async healthCheck(): Promise<{
    status: "ok" | "degraded" | "down";
    model?: string;
    latencyMs?: number;
    error?: string;
  }> {
    return healthCheckDispatch(this.state,);
  }

  // ── List models ────────────────────────────────────────

  async listModels(): Promise<ModelInfo[]> {
    return listModelsDispatch(this.state,);
  }
}
