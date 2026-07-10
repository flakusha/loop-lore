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
import type { LLMProvider } from "./types";
import { OpenAiCompatibleProvider } from "./openai-compatible";
// DEAD CODE: Import new providers when implemented
// import { BedrockProvider } from "./bedrock";
// import { GoogleProvider } from "./google";
// import { AnthropicProvider } from "./anthropic";
// import { OllamaNativeProvider } from "./ollama-native";

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

export async function resolveProvider({ provider, model, userId, config, db }: ResolveProviderOpts): Promise<ResolvedProvider> {
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
      resolvedProviderName = instances[0].name;
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
  // DEAD CODE: Bedrock provider initialization (uncomment when implemented)
  // if (config.generation.providers.bedrock && !getProvider(config.generation.providers.bedrock.name)) {
  //   const provider = new BedrockProvider(config.generation.providers.bedrock);
  //   registerProvider(config.generation.providers.bedrock.name, provider);
  // }
  // DEAD CODE: Google provider initialization
  // if (config.generation.providers.google && !getProvider(config.generation.providers.google.name)) {
  //   // const provider = new GoogleProvider(config.generation.providers.google);
  //   // registerProvider(config.generation.providers.google.name, provider);
  // }
}
