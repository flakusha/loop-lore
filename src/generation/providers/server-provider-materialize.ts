// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Server provider materialization — turning stored descriptors into live
 * registry instances.
 *
 * Internal to the server provider store (see server-provider-store.ts for the
 * public API).
 */

import type { Kysely, } from "kysely";
import { getAllConfig, } from "../../admin/config";
import type { Config, ProviderInstanceConfig, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { circuitBreaker, } from "./circuit-breaker";
import { OpenAiCompatibleProvider, } from "./openai-compatible";
import { registerProvider, unregisterProvider, } from "./registry";
import {
  DESCRIPTOR_KEY_PREFIX,
  DESCRIPTOR_KEY_SUFFIX,
  parseStoredServerProvider,
  type StoredServerProvider,
} from "./server-provider-descriptor";

/**
 * Warn through the structured logger when one is installed.
 * @param message - what went wrong
 * @param meta - structured context
 */
export function warnProviderStore(message: string, meta: Record<string, unknown>,): void {
  try {
    getLogger().child({ module: "server-provider-store", },).warn(message, meta,);
  } catch {
    // No root logger installed — the operation still succeeds.
  }
}

/**
 * Read every stored descriptor row. Malformed rows are skipped, not thrown.
 * @param db
 * @returns the stored providers, ordered by name
 */
export async function readStoredProviders(db: Kysely<DB>,): Promise<StoredServerProvider[]> {
  const rows = await getAllConfig(db,);
  const providers: StoredServerProvider[] = [];

  for (const row of rows) {
    if (!row.key.startsWith(DESCRIPTOR_KEY_PREFIX,) || !row.key.endsWith(DESCRIPTOR_KEY_SUFFIX,)) {
      continue;
    }

    const stored = parseStoredServerProvider(row.value,);
    if (!stored) {
      warnProviderStore("Skipping malformed provider descriptor", { key: row.key, },);
      continue;
    }

    providers.push(stored,);
  }

  return providers.sort((a, b,) => a.name.localeCompare(b.name,));
}

/**
 * Build the registry instance for a stored provider and register it.
 *
 * The registry keeps the FIRST instance for a name, so an update must
 * unregister before registering.
 * @param config - live config; the instance is merged into it
 * @param provider - the stored descriptor
 * @param apiKey - the opened API key, or undefined when none is stored
 * @returns true when the provider was registered
 */
export function materializeInstance(
  config: Config,
  provider: StoredServerProvider,
  apiKey: string | undefined,
): boolean {
  const instance: ProviderInstanceConfig = {
    name: provider.name,
    label: provider.label,
    baseUrl: provider.baseUrl,
    model: provider.model,
    apiKey,
    timeout: provider.timeout,
    retries: provider.retries,
    allowUserApiKey: provider.allowUserApiKey,
    models: {},
    allowedHosts: provider.allowedHosts,
  };

  let created: OpenAiCompatibleProvider;
  try {
    created = new OpenAiCompatibleProvider(instance,);
  } catch (error) {
    warnProviderStore("Skipping provider — construction failed", {
      name: provider.name,
      error: error instanceof Error ? error.message : String(error,),
    },);

    return false;
  }

  unregisterProvider(provider.name,);
  registerProvider(provider.name, created,);
  circuitBreaker.register(provider.name,);

  const instances = config.generation.providers.openaiCompatible;
  const index = instances.findIndex((entry,) => entry.name === provider.name);
  if (index >= 0) {
    instances[index] = instance;
  } else {
    instances.push(instance,);
  }

  return true;
}

/**
 * Prune a provider instance from the live config list.
 * @param config - live config
 * @param name - the provider instance name
 */
export function removeServerProviderInstance(config: Config, name: string,): void {
  const instances = config.generation.providers.openaiCompatible;
  const index = instances.findIndex((entry,) => entry.name === name);
  if (index >= 0) {
    instances.splice(index, 1,);
  }

  if (config.generation.defaultProvider === name) {
    config.generation.defaultProvider = "";
    delete config.generation.defaultModels[name];
  }
}
