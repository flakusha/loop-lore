// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Configured provider instances — the single source of truth for "which
 * provider names exist" and "may a user supply their own API key".
 *
 * The provider registry (initializeProviders) dispatches to the
 * openaiCompatible instances, the anthropic instance and the ollamaNative
 * instance. Providers without a registry implementation (e.g. bedrock) are
 * rejected at config load, so every name listed here is dispatchable.
 */

import type { Config, } from "../../config/schema";

/** A configured provider instance, reduced to what BYO key handling needs. */
export interface ProviderInstance {
  /** Provider instance name, as registered in the provider registry. */
  name: string;
  /** Whether a user may supply their own API key for this instance. */
  allowUserApiKey: boolean;
}

/**
 * Every provider instance the registry can dispatch to, in config order.
 * @param config
 * @returns the configured instances
 */
export function listProviderInstances(config: Config,): ProviderInstance[] {
  const providers = config.generation?.providers;
  const instances: ProviderInstance[] = [];

  for (const instance of providers?.openaiCompatible ?? []) {
    instances.push({ name: instance.name, allowUserApiKey: instance.allowUserApiKey !== false, },);
  }

  const anthropic = providers?.anthropic;
  if (anthropic) {
    instances.push({ name: anthropic.name, allowUserApiKey: anthropic.allowUserApiKey !== false, },);
  }

  const ollamaNative = providers?.ollamaNative;
  if (ollamaNative) {
    instances.push({ name: ollamaNative.name, allowUserApiKey: ollamaNative.allowUserApiKey !== false, },);
  }

  const deepl = providers?.deepl;
  if (deepl) {
    instances.push({ name: deepl.name, allowUserApiKey: deepl.allowUserApiKey !== false, },);
  }

  const libretranslate = providers?.libretranslate;
  if (libretranslate) {
    instances.push({ name: libretranslate.name, allowUserApiKey: libretranslate.allowUserApiKey !== false, },);
  }

  const googleTranslate = providers?.googleTranslate;
  if (googleTranslate) {
    instances.push({ name: googleTranslate.name, allowUserApiKey: googleTranslate.allowUserApiKey !== false, },);
  }

  return instances;
}

/**
 * Every configured IMAGE provider instance (`generation.providers.sd`), in
 * config order — the BYO-key surface for remote image backends.
 *
 * Deliberately separate from {@link listProviderInstances}: that list also
 * feeds the admin provider-store name-collision check, which must not change
 * semantics because image providers became BYO-keyable.
 * @param config
 * @returns the configured image instances
 */
export function listSdProviderInstances(config: Config,): ProviderInstance[] {
  const sd = config.generation?.providers?.sd;

  return (sd ?? []).map((instance,) => ({
    name: instance.name,
    allowUserApiKey: instance.allowUserApiKey !== false,
  }));
}

/**
 * Find a configured image provider instance by name.
 * @param config
 * @param name
 * @returns the instance, or undefined when the name is not configured
 */
export function findSdProviderInstance(config: Config, name: string,): ProviderInstance | undefined {
  return listSdProviderInstances(config,).find((instance,) => instance.name === name);
}

/**
 * Find a configured provider instance by name.
 * @param config
 * @param name
 * @returns the instance, or undefined when the name is not configured
 */
export function findProviderInstance(config: Config, name: string,): ProviderInstance | undefined {
  return listProviderInstances(config,).find((instance,) => instance.name === name);
}
