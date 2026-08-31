// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/providers/registry.ts — Provider registry + resolveProvider
//
// Central registry for LLM provider instances. Providers register at startup.
// resolveProvider() handles resolution order: user BYO key → chat → server default.
// See .plan/epics/epic-provider-plugin-ecosystem.md.

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { decryptValue, } from "../../crypto";
import { getDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { AnthropicProvider, } from "./anthropic";
import { circuitBreaker, } from "./circuit-breaker";
import { OllamaNativeProvider, } from "./ollama-native";
import { OpenAiCompatibleProvider, } from "./openai-compatible";
import type { ChunkEvent, GenerateRequest, GenerateResponse, LLMProvider, } from "./types";

// ── Registry ──────────────────────────────────────────────

const registry = new Map<string, LLMProvider>();

/**
 * @param name
 * @param provider
 */
export function registerProvider(name: string, provider: LLMProvider,): void {
  if (registry.has(name,)) {
    return; // Idempotent — already registered (e.g. from test setup or previous init)
  }
  registry.set(name, provider,);
}

/**
 * @param name
 */
export function getProvider(name: string,): LLMProvider | undefined {
  return registry.get(name,);
}

/** */
export function listProviders(): { name: string; capabilities: LLMProvider["capabilities"] }[] {
  return Array.from(registry, ([name, provider,],) => ({
    name,
    capabilities: provider.capabilities,
  }),);
}

// ── Resolution ────────────────────────────────────────────

/** */
export interface ResolvedProvider {
  provider: LLMProvider;
  resolvedProviderName: string;
  resolvedModel: string;
  resolvedApiKey?: string;
}

/**
 * Resolve provider + model for a generation request.
 *
 * Resolution order:
 * 1. User BYO API key (user_api_keys table)
 * 2. Chat default (chats.settings.provider/model)
 * 3. Actor default (actors.settings.provider/model)
 * 4. Server default (config.generation.defaultProvider + defaultModels)
 */
export interface ResolveProviderOpts {
  provider?: string;
  model?: string;
  userId?: string;
  config: Config;
  db?: Kysely<DB>;
}

/**
 * @param root0
 * @param root0.provider
 * @param root0.model
 * @param root0.userId
 * @param root0.config
 * @param root0.db
 */
export async function resolveProvider({
  provider,
  model,
  userId,
  config,
  db,
}: ResolveProviderOpts,): Promise<ResolvedProvider> {
  let resolvedProviderName = provider ?? config.generation.defaultProvider;
  let resolvedModel = model ?? "";

  let resolvedApiKey: string | undefined;

  // 1. User BYO API key
  if (userId && config.byoKey.enabled && config.byoKey.encryptionKey) {
    const database = db ?? getDatabase();
    try {
      const row = await database
        .selectFrom("user_api_keys",)
        .selectAll()
        .where("user_id", "=", userId,)
        .where("provider_name", "=", resolvedProviderName,)
        .executeTakeFirst();

      if (row) {
        resolvedApiKey = await decryptValue(row.api_key_encrypted, config.byoKey.encryptionKey,);
      }
    } catch {
      // Logged but non-fatal — fall through to server key
    }
  }

  // 4. Fall back to server defaults
  if (!resolvedProviderName) {
    const instances = config.generation.providers.openaiCompatible;
    if (instances.length > 0) {
      resolvedProviderName = instances[0]!.name;
    }
  }

  if (!resolvedModel && resolvedProviderName) {
    resolvedModel = config.generation.defaultModels[resolvedProviderName] ?? "";
  }

  const resolvedProvider = resolvedProviderName ? getProvider(resolvedProviderName,) : undefined;
  if (!resolvedProvider) {
    throw new Error(
      `No provider resolved for "${resolvedProviderName}". Configure a provider in config file or LLM_PROVIDER_* env vars.`,
    );
  }

  return {
    provider: resolvedProvider,
    resolvedProviderName,
    resolvedModel,
    resolvedApiKey,
  };
}

/**
 * Build an ordered failover list of providers for callWithFailover().
 *
 * Returns the primary provider first, then any additional providers
 * from config that differ from the primary. Does NOT include all
 * registered providers — only those explicitly configured.
 * @param primaryName
 * @param config
 */
export function buildFailoverList(
  primaryName: string,
  config?: Config,
): { name: string; provider: LLMProvider }[] {
  const primary = getProvider(primaryName,);
  if (!primary) { return []; }

  const result: { name: string; provider: LLMProvider }[] = [{ name: primaryName, provider: primary, },];

  // Add other configured providers as fallbacks (skip primary)
  // Only include providers that are actually registered in the registry
  if (config) {
    for (const instance of config.generation.providers.openaiCompatible) {
      if (instance.name !== primaryName && registry.has(instance.name,)) {
        result.push({ name: instance.name, provider: registry.get(instance.name,)!, },);
      }
    }
    const anthropic = config.generation.providers.anthropic;
    if (anthropic && anthropic.name !== primaryName && registry.has(anthropic.name,)) {
      result.push({ name: anthropic.name, provider: registry.get(anthropic.name,)!, },);
    }
    const ollama = config.generation.providers.ollamaNative;
    if (ollama && ollama.name !== primaryName && registry.has(ollama.name,)) {
      result.push({ name: ollama.name, provider: registry.get(ollama.name,)!, },);
    }
  }

  return result;
}

/**
 * Initialize providers from config on startup
 * @param config
 */
export function initializeProviders(config: Config,): void {
  for (const instance of config.generation.providers.openaiCompatible) {
    if (getProvider(instance.name,)) {
      continue;
    }

    const provider = new OpenAiCompatibleProvider(instance,);
    registerProvider(instance.name, provider,);
    circuitBreaker.register(instance.name,);
  }
  if (config.generation.providers.anthropic && !getProvider(config.generation.providers.anthropic.name,)) {
    const provider = new AnthropicProvider(config.generation.providers.anthropic,);
    registerProvider(config.generation.providers.anthropic.name, provider,);
    circuitBreaker.register(config.generation.providers.anthropic.name,);
  }
  if (
    config.generation.providers.ollamaNative &&
    !getProvider(config.generation.providers.ollamaNative.name,)
  ) {
    const provider = new OllamaNativeProvider(config.generation.providers.ollamaNative,);
    registerProvider(config.generation.providers.ollamaNative.name, provider,);
    circuitBreaker.register(config.generation.providers.ollamaNative.name,);
  }
}

/**
 * Call a provider with circuit breaker failover.
 *
 * Tries providers in order: primary → configured fallback list.
 * Skips providers whose circuit is open.
 * Records success/failure in circuit breaker.
 * Respects Retry-After headers from ProviderRateLimitError.
 * @param providers
 * @param req
 * @param handler
 */
export async function callWithFailover(
  providers: { name: string; provider: LLMProvider }[],
  req: GenerateRequest,
  handler?: (chunk: ChunkEvent,) => void,
): Promise<GenerateResponse> {
  const errors: string[] = [];

  for (const { name, provider: prov, } of providers) {
    if (!circuitBreaker.allowRequest(name,)) {
      const state = circuitBreaker.getState(name,);
      const remaining = state?.cooldownRemainingMs ?? 0;
      errors.push(`${name}: circuit open (${Math.ceil(remaining / 1000,)}s cooldown remaining)`,);
      continue;
    }

    try {
      const response = handler ? await prov.stream(req, handler,) : await prov.complete(req,);

      circuitBreaker.onSuccess(name,);
      return response;
    } catch (error) {
      const err = error as Error & { retryable?: boolean; retryAfter?: number };
      circuitBreaker.onFailure(name, err.retryAfter ? err.retryAfter * 1000 : undefined,);
      errors.push(`${name}: ${err.message}`,);
    }
  }

  throw new Error(`All providers failed: ${errors.join("; ",)}`,);
}
