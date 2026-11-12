// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 418

/**
 * sd.cpp setup store — operator-entered sd.cpp instances persisted in
 * `system_config` and materialized onto the generation failover path.
 *
 * Mirrors the server-provider store pattern (server-provider-store.ts):
 * operator input is validated before anything is stored, the route probe-gates
 * the save on live reachability, and list responses never carry key material —
 * only a `hasApiKey` flag. Rows live under `sdcpp.<name>.config` (descriptor
 * JSON) and `sdcpp.<name>.apiKey` (sealed automatically by setConfig — the key
 * matches the repo secret-classification pattern).
 */

import type { Kysely, } from "kysely";
import { deleteConfig, setConfig, } from "../../admin/config";
import type { ImageProviderConfig, ImageProviderDefaults, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { safeJsonParse, safeJsonStringify, } from "../../utils";
import { isMetadataTarget, validateProviderUrl, } from "../../utils/url-validation";

/** Prefix of the `system_config` keys that hold an sd.cpp setup descriptor. */
const DESCRIPTOR_KEY_PREFIX = "sdcpp.";

/** Suffix of the `system_config` keys that hold an sd.cpp setup descriptor. */
const DESCRIPTOR_KEY_SUFFIX = ".config";

/** Suffix of the `system_config` keys that hold an sd.cpp API key. Matches
 * SECRET_KEY_PATTERN (`api.?key`), so setConfig seals it at rest. */
const SECRET_KEY_SUFFIX = ".apiKey";

/** Provider instance names are slug-ish: letters, digits, dot, dash, underscore. */
const SDCPP_SETUP_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** Fallback generation defaults — mirrors the boot auto-discovery shape. */
const SDCPP_DEFAULTS: ImageProviderDefaults = {
  width: 512,
  height: 512,
  steps: 20,
  cfgScale: 7,
  sampler: "euler",
};

/** Default connection timeout for a stored instance (ms). */
const SDCPP_TIMEOUT_MS = 30_000;

/** Default generation deadline for a stored instance (ms). */
const SDCPP_GENERATION_TIMEOUT_MS = 120_000;

/** Public descriptor of a stored sd.cpp setup — never carries key material. */
export interface SdCppSetupDescriptor {
  /** Unique instance name. */
  readonly name: string;
  /** Human-readable label. */
  readonly label: string;
  /** sd.cpp server base URL. */
  readonly baseUrl: string;
  /** What the instance is for. */
  readonly purpose: "generate" | "edit" | "both";
  /** Generation defaults. */
  readonly defaults: ImageProviderDefaults;
  /** Whether a sealed API key is stored — never the key itself. */
  readonly hasApiKey: boolean;
}

/** The persisted descriptor shape (the JSON under `sdcpp.<name>.config`). */
interface StoredSdCppSetup {
  name?: unknown;
  label?: unknown;
  baseUrl?: unknown;
  purpose?: unknown;
  defaults?: unknown;
  storedAt?: unknown;
}

/** Raised when operator input for an sd.cpp setup is rejected. */
export class SdCppSetupValidationError extends Error {
  /** The offending field, when the rejection is about one input. */
  readonly field?: string;

  constructor(message: string, field?: string,) {
    super(message,);
    this.name = "SdCppSetupValidationError";
    this.field = field;
  }
}

/** Input for {@link saveSdCppSetup}. */
export interface SaveSdCppSetupInput {
  /** Unique instance name. */
  readonly name: string;
  /** Human-readable label (defaults to the name). */
  readonly label?: string;
  /** sd.cpp server base URL. */
  readonly baseUrl: string;
  /** What the instance is for (default "both"). */
  readonly purpose?: "generate" | "edit" | "both";
  /** Generation defaults; omitted fields fall back to {@link SDCPP_DEFAULTS}. */
  readonly defaults?: Partial<ImageProviderDefaults>;
  /** API key for reverse-proxy-fronted servers; empty string clears a stored key. */
  readonly apiKey?: string;
}

/**
 * @param name - provider instance name
 * @returns the `system_config` key holding the JSON descriptor
 */
export function sdCppDescriptorKey(name: string,): string {
  return `${DESCRIPTOR_KEY_PREFIX}${name}${DESCRIPTOR_KEY_SUFFIX}`;
}

/**
 * @param name - provider instance name
 * @returns the `system_config` key holding the (sealed) API key
 */
export function sdCppSecretKey(name: string,): string {
  return `${DESCRIPTOR_KEY_PREFIX}${name}${SECRET_KEY_SUFFIX}`;
}

/**
 * Validate one generation-defaults field against its range.
 * @param field - defaults field name
 * @param value - operator-supplied value
 * @returns the validated value
 * @throws {SdCppSetupValidationError} when the value is out of range
 */
function assertDefaultField<K extends keyof ImageProviderDefaults,>(
  field: K,
  value: ImageProviderDefaults[K],
): ImageProviderDefaults[K] {
  if (field === "cfgScale") {
    if (typeof value !== "number" || !Number.isFinite(value,) || value <= 0) {
      throw new SdCppSetupValidationError("defaults.cfgScale must be a positive number", "defaults.cfgScale",);
    }

    return value;
  }

  if (field === "negativePrompt" || field === "sampler" || field === "scheduler") {
    if (typeof value !== "string" || value.length === 0) {
      throw new SdCppSetupValidationError(`defaults.${field} must be a non-empty string`, `defaults.${field}`,);
    }

    return value;
  }

  if (typeof value !== "number" || !Number.isInteger(value,) || value <= 0) {
    throw new SdCppSetupValidationError(`defaults.${field} must be a positive integer`, `defaults.${field}`,);
  }

  return value;
}

/**
 * Validate an operator-entered sd.cpp setup before anything is stored.
 * @param input - the operator payload
 * @returns the normalized descriptor fields (label, purpose, defaults)
 * @throws {SdCppSetupValidationError} when the name, base URL, purpose or defaults are invalid
 */
function assertValidSetupInput(
  input: SaveSdCppSetupInput,
): { label: string; purpose: "generate" | "edit" | "both"; defaults: ImageProviderDefaults } {
  if (!SDCPP_SETUP_NAME_PATTERN.test(input.name,)) {
    throw new SdCppSetupValidationError(
      "name must be 1-64 slug characters (letters, digits, dot, dash, underscore) and start with a letter or digit",
      "name",
    );
  }

  const validatedUrl = validateProviderUrl(input.baseUrl,);
  if (!validatedUrl.ok) {
    throw new SdCppSetupValidationError(`baseUrl rejected: ${validatedUrl.error}`, "baseUrl",);
  }

  // The sync URL validator does not resolve DNS, so a literal link-local or
  // cloud-metadata host passes it — reject those here (no stored provider may
  // point at metadata endpoints).
  if (isMetadataTarget(new URL(input.baseUrl,).hostname,)) {
    throw new SdCppSetupValidationError("baseUrl must not point at a link-local or cloud-metadata target", "baseUrl",);
  }

  const purpose = input.purpose ?? "both";
  if (purpose !== "generate" && purpose !== "edit" && purpose !== "both") {
    throw new SdCppSetupValidationError(`purpose must be "generate", "edit" or "both"`, "purpose",);
  }

  const supplied = input.defaults ?? {};
  const defaults: ImageProviderDefaults = {
    width: supplied.width !== undefined ? assertDefaultField("width", supplied.width,) : SDCPP_DEFAULTS.width,
    height: supplied.height !== undefined ? assertDefaultField("height", supplied.height,) : SDCPP_DEFAULTS.height,
    steps: supplied.steps !== undefined ? assertDefaultField("steps", supplied.steps,) : SDCPP_DEFAULTS.steps,
    cfgScale: supplied.cfgScale !== undefined
      ? assertDefaultField("cfgScale", supplied.cfgScale,)
      : SDCPP_DEFAULTS.cfgScale,
    sampler: supplied.sampler !== undefined ? assertDefaultField("sampler", supplied.sampler,) : SDCPP_DEFAULTS.sampler,
    ...(supplied.negativePrompt !== undefined
      ? { negativePrompt: assertDefaultField("negativePrompt", supplied.negativePrompt,), }
      : {}),
  };

  return { label: input.label ?? input.name, purpose, defaults, };
}

/**
 * Parse a persisted descriptor row.
 * @param value - the raw `system_config` value of a `sdcpp.<name>.config` key
 * @returns the stored setup, or null when the row is malformed
 */
export function parseStoredSdCppSetup(value: string,): Omit<SdCppSetupDescriptor, "hasApiKey"> | null {
  const parsed = safeJsonParse<StoredSdCppSetup>(value,);
  if (!parsed.ok) { return null; }
  const stored = parsed.value;
  if (
    typeof stored.name !== "string" ||
    typeof stored.label !== "string" ||
    typeof stored.baseUrl !== "string" ||
    (stored.purpose !== "generate" && stored.purpose !== "edit" && stored.purpose !== "both") ||
    typeof stored.defaults !== "object" ||
    stored.defaults === null
  ) {
    return null;
  }

  const defaults = stored.defaults as Partial<ImageProviderDefaults>;
  if (
    typeof defaults.width !== "number" ||
    typeof defaults.height !== "number" ||
    typeof defaults.steps !== "number" ||
    typeof defaults.cfgScale !== "number" ||
    typeof defaults.sampler !== "string"
  ) {
    return null;
  }

  return {
    name: stored.name,
    label: stored.label,
    baseUrl: stored.baseUrl,
    purpose: stored.purpose,
    defaults: {
      width: defaults.width,
      height: defaults.height,
      steps: defaults.steps,
      cfgScale: defaults.cfgScale,
      sampler: defaults.sampler,
      ...(typeof defaults.negativePrompt === "string" ? { negativePrompt: defaults.negativePrompt, } : {}),
    },
  };
}

/** One raw `sdcpp.*` system_config row. */
interface SdCppConfigRow {
  key: string;
  value: string;
}

/**
 * Read every raw `sdcpp.*` row in one indexed query. Descriptor values are
 * non-secret plain JSON; secret rows are only probed for presence, never
 * opened, so no key material is decrypted here.
 * @param db - Kysely database handle
 * @returns the matching rows
 */
async function readSdCppRows(db: Kysely<DB>,): Promise<SdCppConfigRow[]> {
  return await db
    .selectFrom("system_config",)
    .select(["key", "value",],)
    .where("key", "like", `${DESCRIPTOR_KEY_PREFIX}%`,)
    .execute();
}

/**
 * List every stored sd.cpp setup. Key material is never returned — each
 * descriptor reports only whether a sealed API key exists.
 * @param db - Kysely database handle
 * @returns descriptors ordered by name
 */
export async function listSdCppSetups(db: Kysely<DB>,): Promise<SdCppSetupDescriptor[]> {
  const rows = await readSdCppRows(db,);
  const secretKeys = new Set(rows.map((row,) => row.key).filter((key,) => key.endsWith(SECRET_KEY_SUFFIX,)),);
  const descriptors: SdCppSetupDescriptor[] = [];
  for (const row of rows) {
    if (!row.key.endsWith(DESCRIPTOR_KEY_SUFFIX,)) { continue; }
    const stored = parseStoredSdCppSetup(row.value,);
    if (!stored) {
      continue;
    }

    const secretKey = sdCppSecretKey(stored.name,);
    descriptors.push({ ...stored, hasApiKey: secretKeys.has(secretKey,), },);
  }

  descriptors.sort((a, b,) => a.name.localeCompare(b.name,));
  return descriptors;
}

/**
 * Persist an operator-entered sd.cpp setup. Callers probe-gate the save on
 * reachability — this store only validates and stores. An empty `apiKey`
 * clears a previously stored key; an undefined one keeps it.
 * @param db - Kysely database handle
 * @param input - the validated-by-caller payload
 * @returns the stored descriptor
 * @throws {SdCppSetupValidationError} when name, baseUrl, purpose or defaults are invalid
 */
export async function saveSdCppSetup(
  db: Kysely<DB>,
  input: SaveSdCppSetupInput,
): Promise<SdCppSetupDescriptor> {
  const normalized = assertValidSetupInput(input,);
  const serialized = safeJsonStringify({
    name: input.name,
    label: normalized.label,
    baseUrl: input.baseUrl,
    purpose: normalized.purpose,
    defaults: normalized.defaults,
    storedAt: new Date().toISOString(),
  },);

  await setConfig(db, sdCppDescriptorKey(input.name,), serialized.ok ? serialized.value : "{}",);
  if (input.apiKey !== undefined) {
    if (input.apiKey === "") {
      await deleteConfig(db, sdCppSecretKey(input.name,),);
    } else {
      await setConfig(db, sdCppSecretKey(input.name,), input.apiKey,);
    }
  }

  const rows = await readSdCppRows(db,);
  return {
    name: input.name,
    label: normalized.label,
    baseUrl: input.baseUrl,
    purpose: normalized.purpose,
    defaults: normalized.defaults,
    hasApiKey: rows.some((row,) => row.key === sdCppSecretKey(input.name,)),
  };
}

/**
 * Delete a stored sd.cpp setup and its sealed API key.
 * @param db - Kysely database handle
 * @param name - the instance name to remove
 * @throws {SdCppSetupValidationError} when no descriptor row exists under that name
 */
export async function deleteSdCppSetup(db: Kysely<DB>, name: string,): Promise<void> {
  const rows = await readSdCppRows(db,);
  if (!rows.some((row,) => row.key === sdCppDescriptorKey(name,))) {
    throw new SdCppSetupValidationError(`no stored sd.cpp setup named "${name}"`, "name",);
  }

  await deleteConfig(db, sdCppDescriptorKey(name,),);
  await deleteConfig(db, sdCppSecretKey(name,),);
}

/**
 * Stored sd.cpp setups converted straight to provider configs — the
 * generation-path merge (no `hasApiKey` resolution, no sorting).
 * @param db - Kysely database handle
 * @returns provider configs for every well-formed stored descriptor
 */
export async function listStoredSdCppProviders(db: Kysely<DB>,): Promise<ImageProviderConfig[]> {
  const rows = await readSdCppRows(db,);
  const providers: ImageProviderConfig[] = [];
  for (const row of rows) {
    if (!row.key.endsWith(DESCRIPTOR_KEY_SUFFIX,)) { continue; }
    const stored = parseStoredSdCppSetup(row.value,);
    if (stored) { providers.push(sdCppSetupToProviderConfig(stored,),); }
  }

  return providers;
}

/**
 * Convert a stored descriptor into an image provider config the engine can
 * dispatch on.
 * @param descriptor - a stored setup descriptor
 * @returns the provider config (apiFamily "sdcpp")
 */
export function sdCppSetupToProviderConfig(
  descriptor: Omit<SdCppSetupDescriptor, "hasApiKey">,
): ImageProviderConfig {
  return {
    name: descriptor.name,
    label: descriptor.label,
    baseUrl: descriptor.baseUrl,
    apiFamily: "sdcpp",
    purpose: descriptor.purpose,
    defaults: descriptor.defaults,
    timeout: SDCPP_TIMEOUT_MS,
    generationTimeout: SDCPP_GENERATION_TIMEOUT_MS,
  };
}

/**
 * Merge stored sd.cpp setups into a configured provider list: a stored setup
 * replaces a config-file provider with the same name (operator intent wins),
 * the rest are appended in config order. The result feeds the generation
 * failover candidates so a saved instance is live without a restart.
 * @param configured - providers from the config file (may be undefined)
 * @param stored - provider configs converted from stored descriptors
 * @returns the merged list
 */
export function mergeSdCppSetups(
  configured: ImageProviderConfig[] | undefined,
  stored: ImageProviderConfig[],
): ImageProviderConfig[] {
  const storedByName = new Map(stored.map((provider,) => [provider.name, provider,] as const),);
  const merged: ImageProviderConfig[] = [];
  for (const provider of configured ?? []) {
    merged.push(storedByName.get(provider.name,) ?? provider,);
  }

  const configuredNames = new Set((configured ?? []).map((provider,) => provider.name),);
  for (const provider of stored) {
    if (!configuredNames.has(provider.name,)) { merged.push(provider,); }
  }

  return merged;
}
