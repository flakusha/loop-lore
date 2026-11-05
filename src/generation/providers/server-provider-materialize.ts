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

    // The key names the instance; a descriptor whose name disagrees with its
    // own key can never be addressed by name, so it is malformed too.
    const keyName = row.key.slice(DESCRIPTOR_KEY_PREFIX.length, row.key.length - DESCRIPTOR_KEY_SUFFIX.length,);
    if (stored.name !== keyName) {
      warnProviderStore("Skipping provider descriptor whose name does not match its key", {
        key: row.key,
        name: stored.name,
      },);

      continue;
    }

    providers.push(stored,);
  }

  return providers.sort((a, b,) => a.name.localeCompare(b.name,));
}

/** A constructed provider plus the instance config it was built from. */
export interface PreparedProvider {
  /** The instance config merged into the live provider list. */
  instance: ProviderInstanceConfig;
  /** The constructed provider, ready to register. */
  provider: OpenAiCompatibleProvider;
}

/** Outcome of a materialization attempt. */
export type MaterializeResult =
  | { ok: true; value: OpenAiCompatibleProvider }
  | { ok: false; error: string };

/**
 * Build the provider for a stored descriptor WITHOUT registering it.
 *
 * Construction validates the base URL against the approved hosts, so an
 * unusable descriptor fails here — before anything is persisted or registered.
 * @param provider - the stored descriptor
 * @param apiKey - the opened API key, or undefined when none is stored
 * @throws {ProviderError} When the provider configuration is rejected.
 */
export function prepareProvider(
  provider: StoredServerProvider,
  apiKey: string | undefined,
): PreparedProvider {
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

  return { instance, provider: new OpenAiCompatibleProvider(instance,), };
}

/**
 * Register a prepared provider and merge its config into the live list.
 *
 * The registry keeps the FIRST instance for a name, so an update must
 * unregister before registering.
 * @param config - live config; the instance is merged into it
 * @param name - the provider instance name
 * @param prepared - the constructed provider and its instance config
 */
export function activateProvider(
  config: Config,
  name: string,
  prepared: PreparedProvider,
): void {
  unregisterProvider(name,);
  registerProvider(name, prepared.provider,);
  circuitBreaker.register(name,);

  const instances = config.generation.providers.openaiCompatible;
  const index = instances.findIndex((entry,) => entry.name === name);
  if (index >= 0) {
    instances[index] = prepared.instance;
  } else {
    instances.push(prepared.instance,);
  }
}

/**
 * Build the registry instance for a stored provider and register it.
 * @param config - live config; the instance is merged into it
 * @param provider - the stored descriptor
 * @param apiKey - the opened API key, or undefined when none is stored
 * @returns the registered provider, or the reason it could not be built
 */
export function materializeInstance(
  config: Config,
  provider: StoredServerProvider,
  apiKey: string | undefined,
): MaterializeResult {
  let prepared: PreparedProvider;
  try {
    prepared = prepareProvider(provider, apiKey,);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error,);
    warnProviderStore("Skipping provider — construction failed", {
      name: provider.name,
      error: reason,
    },);

    return { ok: false, error: reason, };
  }

  activateProvider(config, provider.name, prepared,);
  return { ok: true, value: prepared.provider, };
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
