// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Honkbox Custom-provider config: endpoint URLs and instance options.
 *
 * Pure construction, no I/O: the `/v1`-inclusive base URLs and the
 * `OpenAiCompatibleProvider`-consumable instance config.
 */

import type { ProviderInstanceConfig, } from "../../config/schema";
import {
  normalizeHonkboxBaseUrl,
  type ProbeHonkboxOptions,
} from "./capabilities";

/** Options for {@link honkboxCustomProviderConfig}. */
export interface HonkboxCustomProviderOptions extends ProbeHonkboxOptions {
  /** Registry instance name (default `"honkbox"`). */
  readonly name?: string;
  /** Human-readable label. */
  readonly label?: string;
  /** Default chat model id. */
  readonly model: string;
  /** Connection timeout in ms (default 60_000). */
  readonly timeout?: number;
  /** Retry budget (default 2). */
  readonly retries?: number;
  /** Operator-approved remote hosts (SSRF validator). */
  readonly allowedHosts?: string[];
}

/** @param baseUrl - raw honkbox base URL, with or without a trailing `/v1`
 * @returns the `/v1`-inclusive base URL the LLM adapter appends paths to
 */
export function honkboxChatBaseUrl(baseUrl: string,): string {
  const normalized = normalizeHonkboxBaseUrl(baseUrl,);
  if (normalized.endsWith("/v1",)) { return normalized; }
  return `${normalized}/v1`;
}

/** @param baseUrl - the `/v1`-inclusive honkbox base URL
 * @returns the origin base URL the existing openai image engine expects
 */
export function honkboxImageBaseUrl(baseUrl: string,): string {
  const normalized = normalizeHonkboxBaseUrl(baseUrl,);
  return normalized.endsWith("/v1",) ? normalized.slice(0, -3,) : normalized;
}

/** Build the provider config for one honkbox Custom provider instance.
 * @param opts - endpoint, credential, model and optional tuning
 * @returns a config consumable by `OpenAiCompatibleProvider`
 */
export function honkboxCustomProviderConfig(
  opts: HonkboxCustomProviderOptions,
): ProviderInstanceConfig {
  return {
    name: opts.name ?? "honkbox",
    label: opts.label ?? "Honkbox (Custom)",
    baseUrl: honkboxChatBaseUrl(opts.baseUrl,),
    ...(opts.apiKey ? { apiKey: opts.apiKey, } : {}),
    model: opts.model,
    timeout: opts.timeout ?? 60_000,
    retries: opts.retries ?? 2,
    allowUserApiKey: true,
    ...(opts.allowedHosts ? { allowedHosts: opts.allowedHosts, } : {}),
    models: {},
  };
}
