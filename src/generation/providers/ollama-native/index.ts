// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/providers/ollama-native/index.ts
//
// Ollama native API provider (`/api/chat`, `/api/embed`, `/api/tags`,
// `/api/version`). Unlike the OpenAI-compatible mode (which talks to
// Ollama's `/v1` shim), this targets Ollama's own native endpoints.
// See .plan/epics/epic-provider-plugin-ecosystem.md.

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
import { embedDispatch, healthCheckDispatch, listModelsDispatch, } from "./operations";
import type { OllamaNativeState, } from "./types";

// ── Capabilities ──────────────────────────────────────────

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

// ── Provider class ────────────────────────────────────────

/** */
export class OllamaNativeProvider implements LLMProvider {
  private readonly state: OllamaNativeState;
  readonly capabilities = CAPABILITIES;

  /**
   * @param config
   */
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

  /**
   * @param req
   */
  async complete(req: GenerateRequest,): Promise<GenerateResponse> {
    return completeDispatch(this.state, req,);
  }

  /**
   * @param req
   * @param handler
   */
  async stream(req: GenerateRequest, handler: StreamHandler,): Promise<GenerateResponse> {
    return streamDispatch(this.state, req, handler,);
  }

  // ── Health check ───────────────────────────────────────

  /** */
  async healthCheck(): Promise<{
    status: "ok" | "degraded" | "down";
    model?: string;
    latencyMs?: number;
    error?: string;
  }> {
    return healthCheckDispatch(this.state,);
  }

  // ── List models ────────────────────────────────────────

  /** */
  async listModels(): Promise<ModelInfo[]> {
    return listModelsDispatch(this.state,);
  }

  // ── Embeddings ─────────────────────────────────────────

  /**
   * @param input
   */
  async embed(input: string | string[],): Promise<number[][]> {
    return embedDispatch(this.state, input, this.state.defaultModel,);
  }
}
