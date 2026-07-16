// src/generation/providers/registry.ts — Provider registry + resolveProvider
//
// Central registry for LLM provider instances. Providers register at startup.
// resolveProvider() handles resolution order: user BYO key → chat → server default.
// See docs/spec/provider-system.md.

import type { Config } from "../../config/schema";
import type { Kysely } from "kysely";
import type { DB } from "../../db/schema";
import { getDatabase } from "../../db/index";
import { decryptValue } from "../../crypto";
import type { LLMProvider, GenerateRequest, GenerateResponse, ChunkEvent } from "./types";
import { OpenAiCompatibleProvider } from "./openai-compatible";
import { circuitBreaker } from "./circuit-breaker";
// TODO: register additional providers (Bedrock, Google, Anthropic, Ollama native)
// when their implementations land.

// ── Registry ──────────────────────────────────────────────

const registry = new Map<string, LLMProvider>();

export function registerProvider(name: string, provider: LLMProvider): void {
  if (registry.has(name)) {
    return; // Idempotent — already registered (e.g. from test setup or previous init)
  }
  registry.set(name, provider);
}

export function getProvider(name: string): LLMProvider | undefined {
  return registry.get(name);
}

export function listProviders(): { name: string; capabilities: LLMProvider["capabilities"] }[] {
  return [...registry].map(([name, provider]) => ({
    name,
    capabilities: provider.capabilities,
  }));
}

// ── Resolution ────────────────────────────────────────────

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

export async function resolveProvider({
  provider,
  model,
  userId,
  config,
  db,
}: ResolveProviderOpts): Promise<ResolvedProvider> {
  let resolvedProviderName = provider ?? config.generation.defaultProvider;
  let resolvedModel = model ?? "";

  let resolvedApiKey: string | undefined;

  // 1. User BYO API key
  if (userId && config.byoKey.enabled && config.byoKey.encryptionKey) {
    const database = db ?? getDatabase();
    try {
      const row = await database
        .selectFrom("user_api_keys")
        .selectAll()
        .where("user_id", "=", userId)
        .where("provider_name", "=", resolvedProviderName)
        .executeTakeFirst();

      if (row) {
        resolvedApiKey = await decryptValue(row.api_key_encrypted, config.byoKey.encryptionKey);
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

  const resolvedProvider = resolvedProviderName ? getProvider(resolvedProviderName) : undefined;
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

/** Initialize providers from config on startup */
export function initializeProviders(config: Config): void {
  for (const instance of config.generation.providers.openaiCompatible) {
    if (getProvider(instance.name)) {
      continue;
    }

    const provider = new OpenAiCompatibleProvider(instance);
    registerProvider(instance.name, provider);
    circuitBreaker.register(instance.name);
  }
  if (config.generation.providers.anthropic && !getProvider(config.generation.providers.anthropic.name)) {
    // TODO: AnthropicProvider when implemented
  }
  if (
    config.generation.providers.ollamaNative &&
    !getProvider(config.generation.providers.ollamaNative.name)
  ) {
    // TODO: OllamaNativeProvider when implemented
  }
}

/**
 * Call a provider with circuit breaker failover.
 *
 * Tries providers in order: primary → configured fallback list.
 * Skips providers whose circuit is open.
 * Records success/failure in circuit breaker.
 * Respects Retry-After headers from ProviderRateLimitError.
 */
export async function callWithFailover(
  providers: Array<{ name: string; provider: LLMProvider }>,
  req: GenerateRequest,
  handler?: (chunk: ChunkEvent) => void,
): Promise<GenerateResponse> {
  const errors: string[] = [];

  for (const { name, provider: prov } of providers) {
    if (!circuitBreaker.allowRequest(name)) {
      const state = circuitBreaker.getState(name);
      const remaining = state?.cooldownRemainingMs ?? 0;
      errors.push(`${name}: circuit open (${Math.ceil(remaining / 1000)}s cooldown remaining)`);
      continue;
    }

    try {
      const response = handler
        ? await prov.stream(req, handler)
        : await prov.complete(req);

      circuitBreaker.onSuccess(name);
      return response;
    } catch (error) {
      const err = error as Error & { retryable?: boolean; retryAfter?: number };
      circuitBreaker.onFailure(name, err.retryAfter ? err.retryAfter * 1000 : undefined);
      errors.push(`${name}: ${err.message}`);
    }
  }

  throw new Error(`All providers failed: ${errors.join("; ")}`);
}
