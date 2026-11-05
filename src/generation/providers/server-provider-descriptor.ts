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

import { isIP, } from "node:net";
import { safeJsonParse, } from "../../utils";
import { isMetadataTarget, validateProviderUrl, } from "../../utils/url-validation";

/** Provider instance names are slug-ish: letters, digits, dot, dash, underscore. */
const SERVER_PROVIDER_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** Prefix of the `system_config` keys that hold a provider descriptor. */
const DESCRIPTOR_KEY_PREFIX = "provider.";

/** Suffix of the `system_config` keys that hold a provider descriptor. */
const DESCRIPTOR_KEY_SUFFIX = ".config";

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

/**
 * @param key - a `system_config` key
 * @returns the provider instance name the key holds a descriptor for, or null
 *   when the key is not a descriptor key
 */
export function descriptorNameFromKey(key: string,): string | null {
  if (!key.startsWith(DESCRIPTOR_KEY_PREFIX,) || !key.endsWith(DESCRIPTOR_KEY_SUFFIX,)) { return null; }

  const name = key.slice(DESCRIPTOR_KEY_PREFIX.length, key.length - DESCRIPTOR_KEY_SUFFIX.length,);
  return name === "" ? null : name;
}

/** Whether a stored provider instance is live in the provider registry. */
export type ServerProviderState = "live" | "error";

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
  /** Whether the instance is live in the provider registry. */
  state: ServerProviderState;
  /** Why the instance is not live — present only in the "error" state. */
  error?: string;
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
 * Validate one operator-approved host entry.
 *
 * An entry is a bare hostname: no scheme, no path, no port, no userinfo. A
 * wildcard may cover a domain ("*.example.com") but never a bare TLD
 * ("*.com") — that would approve the whole internet.
 * @param host - the operator-supplied entry
 * @throws {ServerProviderValidationError} When the entry is not a bare hostname.
 */
function assertValidAllowedHost(host: string,): void {
  if (host === "" || host !== host.trim()) {
    throw new ServerProviderValidationError(`Invalid allowed host "${host}" — use a bare hostname.`,);
  }

  if (host.includes("://",) || host.includes("/",) || host.includes("@",) || host.includes(" ",)) {
    throw new ServerProviderValidationError(
      `Invalid allowed host "${host}" — use a bare hostname without scheme, path, port or userinfo.`,
    );
  }

  if (host === "*") {
    throw new ServerProviderValidationError(`Invalid allowed host "*" — a host approval must name a host.`,);
  }

  if (host.startsWith("[",)) {
    assertIpv6AllowedHost(host,);
    return;
  }

  if (host.includes(":",)) {
    throw new ServerProviderValidationError(
      `Invalid allowed host "${host}" — a port is not part of a host approval.`,
    );
  }

  assertDomainAllowedHost(host,);
}

/**
 * @param host - an IPv6-literal host approval
 * @throws {ServerProviderValidationError} When the literal is malformed.
 */
function assertIpv6AllowedHost(host: string,): void {
  if (!host.endsWith("]",) || isIP(host.slice(1, -1,),) !== 6) {
    throw new ServerProviderValidationError(`Invalid allowed host "${host}" — expected an IPv6 literal.`,);
  }
}

/**
 * @param host - a domain-shaped host approval (optionally "*.domain")
 * @throws {ServerProviderValidationError} When the shape is not a hostname.
 */
function assertDomainAllowedHost(host: string,): void {
  const wildcard = host.startsWith("*.",);
  const domain = wildcard ? host.slice(2,) : host;
  if (wildcard && !domain.includes(".",)) {
    throw new ServerProviderValidationError(
      `Invalid allowed host "${host}" — a wildcard must cover a domain, not a bare TLD.`,
    );
  }

  for (const label of domain.split(".",)) {
    if (!isHostnameLabel(label,)) {
      throw new ServerProviderValidationError(
        `Invalid allowed host "${host}" — "${label}" is not a hostname label.`,
      );
    }
  }
}

/**
 * @param label - one dot-separated hostname label
 * @returns true when the label is a valid hostname label
 */
function isHostnameLabel(label: string,): boolean {
  if (!label || label.length > 63) { return false; }
  if (label.startsWith("-",) || label.endsWith("-",)) { return false; }

  for (const ch of label) {
    const isDigit = ch >= "0" && ch <= "9";
    const isLetter = (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
    if (!isDigit && !isLetter && ch !== "-") { return false; }
  }

  return true;
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
  for (const host of hosts) {
    assertValidAllowedHost(host,);
    if (isMetadataTarget(host,)) {
      throw new ServerProviderValidationError(
        `Provider host "${host}" is a link-local or cloud-metadata target and is never allowed.`,
      );
    }
  }

  if (isMetadataTarget(parsed.hostname,)) {
    throw new ServerProviderValidationError(
      `Provider URL rejected: "${parsed.hostname}" is a link-local or cloud-metadata target.`,
    );
  }

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
