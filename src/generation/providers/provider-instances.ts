// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Configured provider instances — the single source of truth for "which
 * provider names exist" and "may a user supply their own API key".
 *
 * The provider registry (initializeProviders) dispatches to the
 * openaiCompatible instances, the anthropic instance and the ollamaNative
 * instance; bedrock is configured but has no provider implementation yet.
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
 * Find a configured provider instance by name — the registry-backed kinds
 * plus the configured bedrock instance.
 * @param config
 * @param name
 * @returns the instance, or undefined when the name is not configured
 */
export function findProviderInstance(config: Config, name: string,): ProviderInstance | undefined {
  const bedrock = config.generation?.providers?.bedrock;
  return listProviderInstances(config,).find((instance,) => instance.name === name) ??
    (bedrock?.name === name
      ? { name: bedrock.name, allowUserApiKey: bedrock.allowUserApiKey !== false, }
      : undefined);
}
