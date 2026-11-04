// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Server provider store — operator-entered provider instances persisted in
 * `system_config` and materialized into the live provider registry.
 *
 * Fresh installs boot with zero providers. This store lets an operator add
 * one from the admin surface without editing a config file: the descriptor is
 * stored as JSON under `provider.<name>.config`, the API key is stored SEALED
 * under `provider.<name>.apiKey`, and the instance is registered in the
 * provider registry so `resolveProvider` and the provider HTTP layer dispatch
 * to it.
 */

import type { Kysely, } from "kysely";
import { deleteConfig, getConfigValue, setConfig, } from "../../admin/config";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { safeJsonStringify, } from "../../utils";
import { getProvider, unregisterProvider, } from "./registry";
import {
  assertValidServerProviderName,
  resolveApprovedHosts,
  type ServerProviderDescriptor,
  serverProviderDescriptorKey,
  serverProviderSecretKey,
  ServerProviderValidationError,
  type StoredServerProvider,
} from "./server-provider-descriptor";
import {
  materializeInstance,
  readStoredProviders,
} from "./server-provider-materialize";

export {
  serverProviderDescriptorKey,
  serverProviderSecretKey,
  ServerProviderValidationError,
} from "./server-provider-descriptor";
export type { ServerProviderDescriptor, } from "./server-provider-descriptor";
export { removeServerProviderInstance, } from "./server-provider-materialize";

/** Default connection timeout for a materialized instance. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Default retry count for a materialized instance. */
const DEFAULT_RETRIES = 3;

/** `system_config` key holding the default provider name. */
const DEFAULT_PROVIDER_KEY = "default_provider";

/** `system_config` key holding the default model id. */
const DEFAULT_MODEL_KEY = "default_model";

/**
 * List every stored provider instance. Key material is never returned — only
 * whether a sealed key exists for the instance.
 * @param db
 * @returns the stored descriptors, ordered by name
 */
export async function listServerProviders(db: Kysely<DB>,): Promise<ServerProviderDescriptor[]> {
  const stored = await readStoredProviders(db,);
  const descriptors: ServerProviderDescriptor[] = [];

  for (const provider of stored) {
    const hasApiKey = (await getConfigValue(db, serverProviderSecretKey(provider.name,),)) !== undefined;
    descriptors.push({
      name: provider.name,
      label: provider.label,
      baseUrl: provider.baseUrl,
      model: provider.model,
      allowedHosts: provider.allowedHosts,
      hasApiKey,
    },);
  }

  return descriptors;
}

/** Input for {@link saveServerProvider}. */
export interface SaveServerProviderInput {
  name: string;
  label: string;
  baseUrl: string;
  model: string;
  /** Operator-entered API key. Omitted on update — the stored key is kept. */
  apiKey?: string;
  /** Explicit host approval. Omitted — the base URL's own host is approved. */
  allowedHosts?: string[];
  /** Make this instance the server default. */
  setDefault?: boolean;
  timeout?: number;
  retries?: number;
  allowUserApiKey?: boolean;
  /** Live config the materialized instance is merged into. */
  config: Config;
}

/**
 * Persist an operator-entered provider instance and make it live.
 *
 * The descriptor is stored as JSON, the API key (when supplied) is stored
 * SEALED by `setConfig`, and the instance is registered in the provider
 * registry immediately — no restart, no config file edit. The name identifies
 * exactly one instance: saving an existing name updates it in place.
 * @param db
 * @param input
 * @throws {ServerProviderValidationError} When the name, base URL or host
 *   approval is invalid, or the name collides with a configured provider.
 * @returns the stored descriptor — never the key
 */
export async function saveServerProvider(
  db: Kysely<DB>,
  input: SaveServerProviderInput,
): Promise<ServerProviderDescriptor> {
  assertValidServerProviderName(input.name,);

  const stored = await readStoredProviders(db,);
  const isUpdate = stored.some((provider,) => provider.name === input.name);
  if (!isUpdate) {
    const taken = input.config.generation.providers.openaiCompatible.some(
      (instance,) => instance.name === input.name,
    );

    if (taken) {
      throw new ServerProviderValidationError(
        `Provider name "${input.name}" is already used by a configured provider.`,
      );
    }
  }

  // The instance becomes the server default when the operator asked for it,
  // or when it is the only provider and no default is configured yet — the
  // first-run case the wizard exists for.
  const isFirstProvider = !isUpdate && input.config.generation.providers.openaiCompatible.length === 0;
  const becomesDefault = input.setDefault === true ||
    (isFirstProvider && !input.config.generation.defaultProvider);

  const allowedHosts = resolveApprovedHosts(input.baseUrl, input.allowedHosts,);
  const record: StoredServerProvider = {
    name: input.name,
    label: input.label || input.name,
    baseUrl: input.baseUrl,
    model: input.model,
    allowedHosts,
    timeout: input.timeout ?? DEFAULT_TIMEOUT_MS,
    retries: input.retries ?? DEFAULT_RETRIES,
    allowUserApiKey: input.allowUserApiKey ?? true,
    setDefault: becomesDefault,
  };

  const encoded = safeJsonStringify(record,);
  if (!encoded.ok) {
    throw new ServerProviderValidationError("Provider descriptor could not be serialized.",);
  }

  await setConfig(
    db,
    serverProviderDescriptorKey(input.name,),
    encoded.value,
    "Server provider instance",
  );

  // An omitted key on an update keeps the previously stored (sealed) key.
  if (input.apiKey) {
    await setConfig(db, serverProviderSecretKey(input.name,), input.apiKey, "Server provider API key",);
  }

  const apiKey = await getConfigValue(db, serverProviderSecretKey(input.name,),);
  materializeInstance(input.config, record, apiKey,);

  if (record.setDefault) {
    input.config.generation.defaultProvider = record.name;
    input.config.generation.defaultModels[record.name] = record.model;
    await setConfig(db, DEFAULT_PROVIDER_KEY, record.name, "Default LLM provider",);
    await setConfig(db, DEFAULT_MODEL_KEY, record.model, "Default LLM model",);
  }

  return {
    name: record.name,
    label: record.label,
    baseUrl: record.baseUrl,
    model: record.model,
    allowedHosts: record.allowedHosts,
    hasApiKey: apiKey !== undefined,
  };
}

/**
 * Delete a stored provider instance and unregister it from the registry.
 * @param db
 * @param name - the provider instance name
 * @throws {ServerProviderValidationError} When the name is invalid or unknown.
 */
export async function deleteServerProvider(db: Kysely<DB>, name: string,): Promise<void> {
  assertValidServerProviderName(name,);

  const stored = await readStoredProviders(db,);
  if (!stored.some((provider,) => provider.name === name)) {
    throw new ServerProviderValidationError(`Unknown provider: ${name}`,);
  }

  await deleteConfig(db, serverProviderDescriptorKey(name,),);
  await deleteConfig(db, serverProviderSecretKey(name,),);

  // A default pointing at the deleted provider would dangle — drop it.
  if ((await getConfigValue(db, DEFAULT_PROVIDER_KEY,)) === name) {
    await deleteConfig(db, DEFAULT_PROVIDER_KEY,);
    await deleteConfig(db, DEFAULT_MODEL_KEY,);
  }

  unregisterProvider(name,);
}

/**
 * Apply the persisted `default_provider` / `default_model` rows.
 *
 * These keys are seeded from the config file but were never read back —
 * wiring the read-back is what makes a wizard choice survive a restart.
 * @param db
 * @param config - live config
 */
export async function applyStoredServerDefaults(db: Kysely<DB>, config: Config,): Promise<void> {
  const provider = await getConfigValue(db, DEFAULT_PROVIDER_KEY,);
  if (provider && getProvider(provider,)) {
    config.generation.defaultProvider = provider;
  }

  const model = await getConfigValue(db, DEFAULT_MODEL_KEY,);
  if (model && config.generation.defaultProvider) {
    config.generation.defaultModels[config.generation.defaultProvider] = model;
  }
}

/**
 * Materialize every stored provider instance into the live registry.
 *
 * A provider whose host is not permitted is skipped with a warning — boot
 * must never crash on a stored provider.
 * @param db
 * @param config - live config; the materialized instances are merged into it
 * @returns the names that were materialized
 */
export async function materializeServerProviders(db: Kysely<DB>, config: Config,): Promise<string[]> {
  const stored = await readStoredProviders(db,);
  const materialized: string[] = [];
  const models = new Map<string, string>();
  let defaultName: string | undefined;

  for (const provider of stored) {
    const apiKey = await getConfigValue(db, serverProviderSecretKey(provider.name,),);
    if (!materializeInstance(config, provider, apiKey,)) { continue; }
    materialized.push(provider.name,);
    models.set(provider.name, provider.model,);
    if (provider.setDefault) { defaultName = provider.name; }
  }

  // A descriptor marked as the default wins over an unset default; the
  // stored `default_provider` row is applied on top of it below.
  if (defaultName) {
    config.generation.defaultProvider = defaultName;
    config.generation.defaultModels[defaultName] = models.get(defaultName,) ?? defaultName;
  }

  await applyStoredServerDefaults(db, config,);

  // A lone provider with no configured default becomes the default.
  if (!config.generation.defaultProvider && materialized.length === 1) {
    const only = materialized[0]!;
    config.generation.defaultProvider = only;
    config.generation.defaultModels[only] ??= models.get(only,) ?? only;
  }

  return materialized;
}
