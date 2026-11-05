// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 310

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
import { circuitBreaker, } from "./circuit-breaker";
import { listProviderInstances, } from "./provider-instances";
import { getProvider, unregisterProvider, } from "./registry";
import { auditProviderStore, } from "./server-provider-audit";
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
  activateProvider,
  materializeInstance,
  type PreparedProvider,
  prepareProvider,
  readStoredProviders,
  removeServerProviderInstance,
  warnProviderStore,
} from "./server-provider-materialize";

export {
  serverProviderDescriptorKey,
  serverProviderSecretKey,
  ServerProviderValidationError,
} from "./server-provider-descriptor";
export type { ServerProviderDescriptor, ServerProviderState, } from "./server-provider-descriptor";

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
 * whether a sealed key exists for the instance and whether it is live.
 * @param db
 * @returns the stored descriptors, ordered by name
 */
export async function listServerProviders(db: Kysely<DB>,): Promise<ServerProviderDescriptor[]> {
  const stored = await readStoredProviders(db,);
  const descriptors: ServerProviderDescriptor[] = [];

  for (const provider of stored) {
    const apiKey = await getConfigValue(db, serverProviderSecretKey(provider.name,),);
    const live = getProvider(provider.name,) !== undefined;
    descriptors.push({
      name: provider.name,
      label: provider.label,
      baseUrl: provider.baseUrl,
      model: provider.model,
      allowedHosts: provider.allowedHosts,
      hasApiKey: apiKey !== undefined && apiKey !== "",
      state: live ? "live" : "error",
      error: live ? undefined : inactiveReason(provider,),
    },);
  }

  return descriptors;
}

/**
 * Why a stored provider is not live.
 * @param provider - the stored descriptor
 * @returns the rejection reason, or a generic registry message
 */
function inactiveReason(provider: StoredServerProvider,): string {
  try {
    resolveApprovedHosts(provider.baseUrl, provider.allowedHosts,);
  } catch (error) {
    return error instanceof Error ? error.message : String(error,);
  }

  return "Provider is not registered in the provider registry.";
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
  /** Make this instance the server default. Omitted on update — the stored intent is kept. */
  setDefault?: boolean;
  timeout?: number;
  retries?: number;
  allowUserApiKey?: boolean;
  /** Live config the materialized instance is merged into. */
  config: Config;
  /** The admin who made the change — recorded in the audit trail. */
  actor?: string;
}

/**
 * Persist an operator-entered provider instance and make it live.
 *
 * The descriptor and the (sealed) API key are written in ONE transaction — a
 * partial write leaves neither row. The instance is registered in the provider
 * registry immediately — no restart, no config file edit. The name identifies
 * exactly one instance: saving an existing name updates it in place.
 * @param db
 * @param input
 * @throws {ServerProviderValidationError} When the name, base URL or host
 *   approval is invalid, the name collides with another provider, or the
 *   instance cannot be activated.
 * @returns the stored descriptor — never the key
 */
export async function saveServerProvider(
  db: Kysely<DB>,
  input: SaveServerProviderInput,
): Promise<ServerProviderDescriptor> {
  assertValidServerProviderName(input.name,);

  const stored = await readStoredProviders(db,);
  const previous = stored.find((provider,) => provider.name === input.name);
  const isUpdate = previous !== undefined;

  // A stored provider may only replace the instance it owns — a name that the
  // registry or the config file already uses would hijack that provider.
  if (!isUpdate) { assertNameIsFree(input.name, input.config,); }

  // The instance becomes the server default when the operator asked for it, or
  // when it is the only provider and no default is configured yet — the
  // first-run case the wizard exists for. An update keeps the stored intent.
  const isFirstProvider = !isUpdate && input.config.generation.providers.openaiCompatible.length === 0;
  const becomesDefault = input.setDefault ??
    (isUpdate ? previous?.setDefault === true : isFirstProvider && !input.config.generation.defaultProvider);

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

  // An omitted key on an update keeps the previously stored (sealed) key; an
  // explicit empty key clears it.
  const storedKey = await getConfigValue(db, serverProviderSecretKey(input.name,),);
  const apiKey = input.apiKey !== undefined ? input.apiKey : (storedKey ?? "");

  // Build the provider BEFORE persisting: an instance that cannot be
  // activated must not leave a stored row behind.
  const prepared = buildProvider(record, apiKey,);

  await db.transaction().execute(async (trx,) => {
    await setConfig(trx, serverProviderDescriptorKey(input.name,), encoded.value, "Server provider instance",);
    await setConfig(trx, serverProviderSecretKey(input.name,), apiKey, "Server provider API key",);
  },);

  activateProvider(input.config, record.name, prepared,);
  // A successful update re-probes a provider whose circuit had opened.
  circuitBreaker.reset(record.name,);

  await applyDefault(db, input.config, record,);
  await auditProviderStore(db, "saved", record, input.actor,);

  return {
    name: record.name,
    label: record.label,
    baseUrl: record.baseUrl,
    model: record.model,
    allowedHosts: record.allowedHosts,
    hasApiKey: apiKey !== "",
    state: "live",
  };
}

/**
 * Reject a name that another provider already owns.
 * @param name - the requested provider name
 * @param config - live config
 * @throws {ServerProviderValidationError} When the name is taken.
 */
function assertNameIsFree(name: string, config: Config,): void {
  const registered = getProvider(name,) !== undefined;
  const configured = listProviderInstances(config,).some((instance,) => instance.name === name);
  if (registered || configured) {
    throw new ServerProviderValidationError(
      `Provider name "${name}" is already used by another provider.`,
    );
  }
}

/**
 * Build the provider instance for a stored descriptor.
 * @param record - the descriptor to persist
 * @param apiKey - the API key to use, empty when none is stored
 * @throws {ServerProviderValidationError} When the instance cannot be built.
 */
function buildProvider(record: StoredServerProvider, apiKey: string,): PreparedProvider {
  try {
    return prepareProvider(record, apiKey || undefined,);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error,);
    throw new ServerProviderValidationError(`Provider could not be activated: ${reason}`,);
  }
}

/**
 * Keep the live default and the persisted default rows in sync.
 *
 * A provider that is the current default keeps it — and the persisted
 * `default_provider` / `default_model` rows are refreshed so the live default
 * and the stored default never drift apart.
 * @param db
 * @param config - live config
 * @param record - the descriptor that was just saved
 */
async function applyDefault(
  db: Kysely<DB>,
  config: Config,
  record: StoredServerProvider,
): Promise<void> {
  const persistedDefault = await getConfigValue(db, DEFAULT_PROVIDER_KEY,);
  const isCurrentDefault = config.generation.defaultProvider === record.name || persistedDefault === record.name;

  if (record.setDefault) { config.generation.defaultProvider = record.name; }
  if (!record.setDefault && !isCurrentDefault) { return; }

  config.generation.defaultModels[record.name] = record.model;
  await setConfig(db, DEFAULT_PROVIDER_KEY, record.name, "Default LLM provider",);
  await setConfig(db, DEFAULT_MODEL_KEY, record.model, "Default LLM model",);
}

/** Input for {@link deleteServerProvider}. */
export interface DeleteServerProviderInput {
  /** The provider instance name. */
  name: string;
  /** Live config; the instance is pruned from it. */
  config: Config;
  /** The admin who made the change — recorded in the audit trail. */
  actor?: string;
}

/**
 * Delete a stored provider instance and unregister it from the registry.
 *
 * The registry entry, the config-file instance and the stored rows all go —
 * the caller cannot forget the config-file part.
 * @param db
 * @param input
 * @throws {ServerProviderValidationError} When the name is invalid or unknown.
 */
export async function deleteServerProvider(db: Kysely<DB>, input: DeleteServerProviderInput,): Promise<void> {
  assertValidServerProviderName(input.name,);

  const stored = await readStoredProviders(db,);
  const provider = stored.find((entry,) => entry.name === input.name);
  if (!provider) {
    throw new ServerProviderValidationError(`Unknown provider: ${input.name}`,);
  }

  await db.transaction().execute(async (trx,) => {
    await deleteConfig(trx, serverProviderDescriptorKey(input.name,),);
    await deleteConfig(trx, serverProviderSecretKey(input.name,),);
  },);

  // A default pointing at the deleted provider would dangle — drop it.
  if ((await getConfigValue(db, DEFAULT_PROVIDER_KEY,)) === input.name) {
    await deleteConfig(db, DEFAULT_PROVIDER_KEY,);
    await deleteConfig(db, DEFAULT_MODEL_KEY,);
  }

  unregisterProvider(input.name,);
  removeServerProviderInstance(input.config, input.name,);
  await auditProviderStore(db, "deleted", provider, input.actor,);
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
 * Every stored descriptor is re-validated at boot: a descriptor whose host is
 * not permitted, or whose key row is missing, is skipped with a warning — a
 * row written through the generic system-config path never bypasses the
 * validator, and boot must never crash on a stored provider.
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
    const apiKey = await materializableKey(db, provider,);
    if (apiKey === undefined) { continue; }

    const result = materializeInstance(config, provider, apiKey || undefined,);
    if (!result.ok) { continue; }
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

/**
 * The stored key of a descriptor that may be materialized at boot.
 *
 * A descriptor without a key row is incomplete, and a descriptor whose host
 * approval no longer holds is rejected — both are skipped with a warning
 * instead of crashing the boot.
 * @param db
 * @param provider - the stored descriptor
 * @returns the stored key, or undefined when the descriptor must be skipped
 */
async function materializableKey(db: Kysely<DB>, provider: StoredServerProvider,): Promise<string | undefined> {
  const apiKey = await getConfigValue(db, serverProviderSecretKey(provider.name,),);
  if (apiKey === undefined) {
    warnProviderStore("Skipping provider — its descriptor has no stored key", { name: provider.name, },);
    return undefined;
  }

  try {
    resolveApprovedHosts(provider.baseUrl, provider.allowedHosts,);
  } catch (error) {
    warnProviderStore("Skipping provider — stored descriptor rejected", {
      name: provider.name,
      error: error instanceof Error ? error.message : String(error,),
    },);

    return undefined;
  }

  return apiKey;
}
