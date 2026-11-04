// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Server provider descriptors — the persisted, non-secret shape of an
 * operator-entered provider instance.
 *
 * A descriptor lives in `system_config` under `provider.<name>.config` as
 * JSON; the API key lives beside it under `provider.<name>.apiKey` and is
 * sealed by `setConfig` (secret-classified key). Pure module — no DB, no
 * registry access.
 */

import { safeJsonParse, } from "../../utils";
import { validateProviderUrl, } from "../../utils/url-validation";

/** Provider instance names are slug-ish: letters, digits, dot, dash, underscore. */
export const SERVER_PROVIDER_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** Prefix of the `system_config` keys that hold a provider descriptor. */
export const DESCRIPTOR_KEY_PREFIX = "provider.";

/** Suffix of the `system_config` keys that hold a provider descriptor. */
export const DESCRIPTOR_KEY_SUFFIX = ".config";

/**
 * @param name - provider instance name
 * @returns the `system_config` key holding the JSON descriptor
 */
export function serverProviderDescriptorKey(name: string,): string {
  return `${DESCRIPTOR_KEY_PREFIX}${name}${DESCRIPTOR_KEY_SUFFIX}`;
}

/**
 * @param name - provider instance name
 * @returns the `system_config` key holding the (sealed) API key
 */
export function serverProviderSecretKey(name: string,): string {
  return `${DESCRIPTOR_KEY_PREFIX}${name}.apiKey`;
}

/** Public descriptor of a stored provider instance — never carries key material. */
export interface ServerProviderDescriptor {
  name: string;
  label: string;
  baseUrl: string;
  model: string;
  /** Hosts the operator approved for this instance (SSRF validator allowlist). */
  allowedHosts: string[];
  /** Whether a sealed API key is stored for this instance. */
  hasApiKey: boolean;
}

/** The persisted descriptor — the JSON stored under `provider.<name>.config`. */
export interface StoredServerProvider {
  name: string;
  label: string;
  baseUrl: string;
  model: string;
  allowedHosts: string[];
  timeout: number;
  retries: number;
  allowUserApiKey: boolean;
  setDefault: boolean;
}

/** Raised when operator input for a provider instance is rejected. */
export class ServerProviderValidationError extends Error {
  /**
   * @param message - operator-facing reason
   */
  constructor(message: string,) {
    super(message,);
    this.name = "ServerProviderValidationError";
  }
}

/**
 * Validate a provider instance name.
 * @param name - the requested name
 * @throws {ServerProviderValidationError} When the name is not slug-ish.
 */
export function assertValidServerProviderName(name: string,): void {
  if (!SERVER_PROVIDER_NAME_PATTERN.test(name,)) {
    throw new ServerProviderValidationError(
      `Invalid provider name "${name}" — use letters, digits, dot, dash or underscore (max 64 characters).`,
    );
  }
}

/**
 * Validate the base URL and resolve the operator-approved hosts.
 *
 * An explicit `allowedHosts` list is the operator's approval; when it is
 * omitted the URL's own host is approved (the operator typed that host).
 * @param baseUrl - the endpoint to validate
 * @param allowedHosts - explicit host approval, or undefined to derive it
 * @throws {ServerProviderValidationError} When the URL is unparsable, is not
 *   http(s), or is not permitted by the validator.
 * @returns the approved hosts to persist with the descriptor
 */
export function resolveApprovedHosts(baseUrl: string, allowedHosts?: string[],): string[] {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl,);
  } catch {
    throw new ServerProviderValidationError(`Invalid provider URL: "${baseUrl}".`,);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ServerProviderValidationError(`Provider URL must use http or https: "${baseUrl}".`,);
  }

  if (!parsed.hostname) {
    throw new ServerProviderValidationError(`Provider URL has no host: "${baseUrl}".`,);
  }

  const hosts = allowedHosts ?? [parsed.hostname,];
  const validated = validateProviderUrl(baseUrl, { allowlist: hosts, },);
  if (!validated.ok) {
    throw new ServerProviderValidationError(`Provider URL rejected: ${validated.error}`,);
  }

  return hosts;
}

/**
 * Parse a persisted descriptor row.
 * @param value - the raw `system_config` value of a `provider.*.config` key
 * @returns the descriptor, or null when the row is malformed
 */
export function parseStoredServerProvider(value: string,): StoredServerProvider | null {
  const parsed = safeJsonParse<unknown>(value,);
  if (!parsed.ok) { return null; }
  if (!parsed.value || typeof parsed.value !== "object") { return null; }
  const row = parsed.value as Record<string, unknown>;
  if (
    typeof row.name !== "string" ||
    typeof row.baseUrl !== "string" ||
    typeof row.model !== "string"
  ) {
    return null;
  }

  return {
    name: row.name,
    label: typeof row.label === "string" ? row.label : row.name,
    baseUrl: row.baseUrl,
    model: row.model,
    allowedHosts: Array.isArray(row.allowedHosts,)
      ? row.allowedHosts.filter((host,): host is string => typeof host === "string")
      : [],
    timeout: typeof row.timeout === "number" ? row.timeout : 30_000,
    retries: typeof row.retries === "number" ? row.retries : 3,
    allowUserApiKey: row.allowUserApiKey !== false,
    setDefault: row.setDefault === true,
  };
}
