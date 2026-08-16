// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/providers/anthropic/index.ts
//
// Anthropic native Messages API provider (`/v1/messages`). Auth via
// `x-api-key` (set in config `generation.providers.anthropic.apiKey`).
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
import { healthCheckDispatch, listModelsDispatch, } from "./operations";
import type { AnthropicState, } from "./types";

// ── Capabilities ──────────────────────────────────────────

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

// ── Provider class ────────────────────────────────────────

export class AnthropicProvider implements LLMProvider {
  private readonly state: AnthropicState;
  readonly capabilities = CAPABILITIES;

  constructor(config: ProviderInstanceConfig,) {
    const baseUrl = (config.baseUrl || "https://api.anthropic.com").replace(/\/+$/, "",);
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
