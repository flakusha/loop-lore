// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/providers/base.ts
//
// Shared base class for LLM providers that follow the standard "validate
// URL → build state → delegate to dispatchers" shape. Each concrete
// provider supplies only what differs: capabilities, optional default
// baseUrl, dispatcher bindings, and (optionally) embed support.
//
// Replaces the duplicated 80-line class skeleton previously repeated in
// every `src/generation/providers/<name>/index.ts`. See
// `.plan/tickets/TASK-refactor-llm-provider-adapters-onto-shared-base-factory.md`.

import type { ProviderInstanceConfig, } from "../../config/schema";
import { validateProviderUrl, } from "../../utils/url-validation";
import type {
  GenerateRequest,
  GenerateResponse,
  LLMProvider,
  ModelInfo,
  ProviderCapabilities,
  StreamHandler,
} from "./types";
import { ProviderError, } from "./types";

/**
 * Runtime state shared by every HTTP provider. Each concrete provider's
 * `<X>State` type is structurally compatible with this — it adds whatever
 * provider-specific fields the dispatchers need.
 */
export interface BaseProviderState {
  baseUrl: string;
  apiKey: string | undefined;
  defaultModel: string;
  timeout: number;
  retries: number;
  headers: Record<string, string>;
}

/**
 * Bindings the base class delegates to. Each provider wires these to its
 * own dispatcher modules.
 */
export interface BaseProviderDispatchers<S extends BaseProviderState,> {
  complete(state: S, req: GenerateRequest,): Promise<GenerateResponse>;
  stream(state: S, req: GenerateRequest, handler: StreamHandler,): Promise<GenerateResponse>;
  healthCheck(state: S,): Promise<{
    status: "ok" | "degraded" | "down";
    model?: string;
    latencyMs?: number;
    error?: string;
  }>;
  listModels(state: S,): Promise<ModelInfo[]>;
  embed?(state: S, input: string | string[], model: string,): Promise<number[][]>;
}

/**
 * Factory options for `BaseProvider`. Providers hand these to the base to
 * construct their class with no boilerplate.
 */
export interface BaseProviderOptions<S extends BaseProviderState,> {
  capabilities: ProviderCapabilities;
  /** Default base URL used when `config.baseUrl` is empty. */
  defaultBaseUrl?: string;
  /** Dispatcher bindings to delegate method calls to. */
  dispatchers: BaseProviderDispatchers<S>;
  /** Optional type-narrowed factory for the concrete state shape. */
  buildState?: (base: BaseProviderState,) => S;
}

/**
 * Subclass entry point. Usage:
 *
 * ```ts
 * export class AnthropicProvider extends BaseProvider<AnthropicState> {
 *   constructor(config: ProviderInstanceConfig) {
 *     super(config, {
 *       capabilities: CAPABILITIES,
 *       defaultBaseUrl: "https://api.anthropic.com",
 *       dispatchers: {
 *         complete: completeDispatch,
 *         stream: streamDispatch,
 *         healthCheck: healthCheckDispatch,
 *         listModels: listModelsDispatch,
 *       },
 *     });
 *   }
 * }
 * ```
 */
export abstract class BaseProvider<S extends BaseProviderState = BaseProviderState,> implements LLMProvider {
  protected readonly state: S;
  readonly capabilities: ProviderCapabilities;
  private readonly dispatchers: BaseProviderDispatchers<S>;

  protected constructor(config: ProviderInstanceConfig, options: BaseProviderOptions<S>,) {
    const rawBase = options.defaultBaseUrl && !config.baseUrl
      ? options.defaultBaseUrl
      : config.baseUrl;
    const baseUrl = rawBase.replace(/\/+$/, "",);
    const validated = validateProviderUrl(baseUrl,);
    if (!validated.ok) {
      throw new ProviderError(
        `Invalid provider URL (${config.name}): ${validated.error}`,
        undefined,
        400,
        false,
      );
    }
    const base: BaseProviderState = {
      baseUrl,
      apiKey: config.apiKey,
      defaultModel: config.model,
      timeout: config.timeout,
      retries: config.retries,
      headers: config.headers ?? {},
    };
    this.state = options.buildState ? options.buildState(base,) : (base as S);
    this.capabilities = options.capabilities;
    this.dispatchers = options.dispatchers;
  }

  async complete(req: GenerateRequest,): Promise<GenerateResponse> {
    return this.dispatchers.complete(this.state, req,);
  }

  async stream(req: GenerateRequest, handler: StreamHandler,): Promise<GenerateResponse> {
    return this.dispatchers.stream(this.state, req, handler,);
  }

  async healthCheck(): Promise<{
    status: "ok" | "degraded" | "down";
    model?: string;
    latencyMs?: number;
    error?: string;
  }> {
    return this.dispatchers.healthCheck(this.state,);
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.dispatchers.listModels(this.state,);
  }

  async embed(input: string | string[],): Promise<number[][]> {
    if (!this.dispatchers.embed) {
      throw new ProviderError(
        `Provider ${this.capabilities.type} does not support embeddings`,
        undefined,
        501,
        false,
      );
    }
    return this.dispatchers.embed(this.state, input, this.state.defaultModel,);
  }
}
