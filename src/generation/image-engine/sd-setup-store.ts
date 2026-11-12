// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 320

/**
 * SD setup store — the family-generic engine behind the operator-entered
 * local image-engine instances (sd.cpp, ComfyUI) persisted in `system_config`
 * and materialized onto the generation failover path.
 *
 * One engine, two family bindings (`sdcpp-setup.ts`, `comfyui-setup.ts`):
 * operator input is validated before anything is stored, the routes probe-gate
 * each save on live reachability, and list responses never carry key material
 * — only a `hasApiKey` flag. Rows live under `<family>.<name>.config`
 * (descriptor JSON) and `<family>.<name>.apiKey` (sealed automatically by
 * setConfig — the key matches the repo secret-classification pattern).
 */

import type { Kysely, } from "kysely";
import { deleteConfig, setConfig, } from "../../admin/config";
import type { ImageProviderConfig, ImageProviderDefaults, } from "../../config/schema";
import type { ImageApiFamily, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { safeJsonParse, safeJsonStringify, } from "../../utils";
import { isMetadataTarget, validateProviderUrl, } from "../../utils/url-validation";

/** Local image-engine families that support a stored-setup surface. */
export type SdSetupFamily = Extract<ImageApiFamily, "sdcpp" | "comfyui">;

/** `system_config` key prefix per family. */
const DESCRIPTOR_KEY_PREFIX: Record<SdSetupFamily, string> = {
  comfyui: "comfyui.",
  sdcpp: "sdcpp.",
};

/** Suffix of the `system_config` keys that hold a setup descriptor. */
const DESCRIPTOR_KEY_SUFFIX = ".config";

/** Suffix of the `system_config` keys that hold an API key. Matches
 * SECRET_KEY_PATTERN (`api.?key`), so setConfig seals it at rest. */
const SECRET_KEY_SUFFIX = ".apiKey";

/** Provider instance names are slug-ish: letters, digits, dot, dash, underscore. */
const SD_SETUP_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** Fallback generation defaults — mirrors the boot auto-discovery shape. */
const SD_SETUP_DEFAULTS: ImageProviderDefaults = {
  width: 512,
  height: 512,
  steps: 20,
  cfgScale: 7,
  sampler: "euler",
};

/** Default connection timeout for a stored instance (ms). */
export const SD_SETUP_TIMEOUT_MS = 30_000;

/** Default generation deadline for a stored instance (ms). */
export const SD_SETUP_GENERATION_TIMEOUT_MS = 120_000;

/** Base shape of a stored setup descriptor — the JSON under `<family>.<name>.config`. */
interface StoredSdSetup {
  name?: unknown;
  label?: unknown;
  baseUrl?: unknown;
  purpose?: unknown;
  defaults?: unknown;
  workflow?: unknown;
  storedAt?: unknown;
}

/** Public descriptor of a stored setup — never carries key material. */
export interface SdSetupDescriptorBase {
  /** Unique instance name. */
  readonly name: string;
  /** Human-readable label. */
  readonly label: string;
  /** Server base URL. */
  readonly baseUrl: string;
  /** What the instance is for. */
  readonly purpose: "generate" | "edit" | "both";
  /** Generation defaults. */
  readonly defaults: ImageProviderDefaults;
  /** Whether a sealed API key is stored — never the key itself. */
  readonly hasApiKey: boolean;
}

/** A parsed stored descriptor before the hasApiKey hydration. */
export type ParsedSdSetup = Omit<SdSetupDescriptorBase, "hasApiKey"> & { workflow?: string };

/** Input for {@link saveSdSetup}. */
export interface SaveSdSetupInput {
  /** Unique instance name. */
  readonly name: string;
  /** Human-readable label (defaults to the name). */
  readonly label?: string;
  /** Server base URL. */
  readonly baseUrl: string;
  /** What the instance is for (default "both"). */
  readonly purpose?: "generate" | "edit" | "both";
  /** Generation defaults; omitted fields fall back to the family defaults. */
  readonly defaults?: Partial<ImageProviderDefaults>;
  /** ComfyUI workflow name (filename without extension); ComfyUI setups only. */
  readonly workflow?: string;
  /** API key for reverse-proxy-fronted servers; empty string clears a stored key. */
  readonly apiKey?: string;
}

/** Raised when operator input for a stored setup is rejected. */
export class SdSetupValidationError extends Error {
  /** The offending field, when the rejection is about one input. */
  readonly field?: string;

  constructor(message: string, field?: string,) {
    super(message,);
    this.name = "SdSetupValidationError";
    this.field = field;
  }
}

/**
 * @param family - the image-engine family the setup belongs to
 * @param name - provider instance name
 * @returns the `system_config` key holding the JSON descriptor
 */
export function sdDescriptorKey(family: SdSetupFamily, name: string,): string {
  return `${DESCRIPTOR_KEY_PREFIX[family]}${name}${DESCRIPTOR_KEY_SUFFIX}`;
}

/**
 * @param family - the image-engine family the setup belongs to
 * @param name - provider instance name
 * @returns the `system_config` key holding the (sealed) API key
 */
export function sdSecretKey(family: SdSetupFamily, name: string,): string {
  return `${DESCRIPTOR_KEY_PREFIX[family]}${name}${SECRET_KEY_SUFFIX}`;
}

/**
 * Validate one generation-defaults field against its range.
 * @param field - defaults field name
 * @param value - operator-supplied value
 * @returns the validated value
 * @throws {SdSetupValidationError} when the value is out of range
 */
function assertDefaultField<K extends keyof ImageProviderDefaults,>(
  field: K,
  value: ImageProviderDefaults[K],
): ImageProviderDefaults[K] {
  if (field === "cfgScale") {
    if (typeof value !== "number" || !Number.isFinite(value,) || value <= 0) {
      throw new SdSetupValidationError("defaults.cfgScale must be a positive number", "defaults.cfgScale",);
    }

    return value;
  }

  if (field === "negativePrompt" || field === "sampler" || field === "scheduler") {
    if (typeof value !== "string" || value.length === 0) {
      throw new SdSetupValidationError(`defaults.${field} must be a non-empty string`, `defaults.${field}`,);
    }

    return value;
  }

  if (typeof value !== "number" || !Number.isInteger(value,) || value <= 0) {
    throw new SdSetupValidationError(`defaults.${field} must be a positive integer`, `defaults.${field}`,);
  }

  return value;
}

/**
 * Validate an operator-entered setup before anything is stored.
 * @param input - the operator payload
 * @returns the normalized descriptor fields (label, purpose, defaults)
 * @throws {SdSetupValidationError} when the name, base URL, purpose, workflow or defaults are invalid
 */
function assertValidSetupInput(
  input: SaveSdSetupInput,
): { label: string; purpose: "generate" | "edit" | "both"; defaults: ImageProviderDefaults } {
  if (!SD_SETUP_NAME_PATTERN.test(input.name,)) {
    throw new SdSetupValidationError(
      "name must be 1-64 slug characters (letters, digits, dot, dash, underscore) and start with a letter or digit",
      "name",
    );
  }

  const validatedUrl = validateProviderUrl(input.baseUrl,);
  if (!validatedUrl.ok) {
    throw new SdSetupValidationError(`baseUrl rejected: ${validatedUrl.error}`, "baseUrl",);
  }

  // The sync URL validator does not resolve DNS, so a literal link-local or
  // cloud-metadata host passes it — reject those here (no stored provider may
  // point at metadata endpoints).
  if (isMetadataTarget(new URL(input.baseUrl,).hostname,)) {
    throw new SdSetupValidationError("baseUrl must not point at a link-local or cloud-metadata target", "baseUrl",);
  }

  const purpose = input.purpose ?? "both";
  if (purpose !== "generate" && purpose !== "edit" && purpose !== "both") {
    throw new SdSetupValidationError(`purpose must be "generate", "edit" or "both"`, "purpose",);
  }

  if (
    input.workflow !== undefined &&
    (typeof input.workflow !== "string" || input.workflow.length === 0 || input.workflow.length > 200)
  ) {
    throw new SdSetupValidationError(
      "workflow must be a non-empty string of at most 200 characters",
      "workflow",
    );
  }

  const supplied = input.defaults ?? {};
  const defaults: ImageProviderDefaults = {
    width: supplied.width !== undefined ? assertDefaultField("width", supplied.width,) : SD_SETUP_DEFAULTS.width,
    height: supplied.height !== undefined ? assertDefaultField("height", supplied.height,) : SD_SETUP_DEFAULTS.height,
    steps: supplied.steps !== undefined ? assertDefaultField("steps", supplied.steps,) : SD_SETUP_DEFAULTS.steps,
    cfgScale: supplied.cfgScale !== undefined
      ? assertDefaultField("cfgScale", supplied.cfgScale,)
      : SD_SETUP_DEFAULTS.cfgScale,
    sampler: supplied.sampler !== undefined
      ? assertDefaultField("sampler", supplied.sampler,)
      : SD_SETUP_DEFAULTS.sampler,
    ...(supplied.negativePrompt !== undefined
      ? { negativePrompt: assertDefaultField("negativePrompt", supplied.negativePrompt,), }
      : {}),
  };

  return { label: input.label ?? input.name, purpose, defaults, };
}

/**
 * Parse a persisted descriptor row.
 * @param value - the raw `system_config` value of a `<family>.<name>.config` key
 * @returns the stored setup (without hasApiKey), or null when the row is malformed
 */
export function parseStoredSdSetup(value: string,): ParsedSdSetup | null {
  const parsed = safeJsonParse<StoredSdSetup>(value,);
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
    ...(typeof stored.workflow === "string" && stored.workflow.length > 0 ? { workflow: stored.workflow, } : {}),
  };
}

/** One raw `<family>.*` system_config row. */
interface SdConfigRow {
  key: string;
  value: string;
}

/**
 * Read every raw `<family>.*` row in one indexed query. Descriptor values are
 * non-secret plain JSON; secret rows are only probed for presence, never
 * opened, so no key material is decrypted here.
 * @param db - Kysely database handle
 * @param family - the image-engine family to read
 * @returns the matching rows
 */
async function readSdSetupRows(db: Kysely<DB>, family: SdSetupFamily,): Promise<SdConfigRow[]> {
  return await db
    .selectFrom("system_config",)
    .select(["key", "value",],)
    .where("key", "like", `${DESCRIPTOR_KEY_PREFIX[family]}%`,)
    .execute();
}

/**
 * @param stored - a parsed stored descriptor
 * @param secretKeys - every `<family>.*.apiKey` key present in system_config
 * @returns the hydrated descriptor
 */
function hasSecret(stored: ParsedSdSetup, secretKeys: Set<string>, family: SdSetupFamily,): SdSetupDescriptorBase {
  return { ...stored, hasApiKey: secretKeys.has(sdSecretKey(family, stored.name,),), };
}

/**
 * List every stored setup of one family. Key material is never returned —
 * each descriptor reports only whether a sealed API key exists.
 * @param db - Kysely database handle
 * @param family - the image-engine family to list
 * @returns descriptors ordered by name
 */
export async function listSdSetups(db: Kysely<DB>, family: SdSetupFamily,): Promise<SdSetupDescriptorBase[]> {
  const rows = await readSdSetupRows(db, family,);
  const secretKeys = new Set(rows.map((row,) => row.key).filter((key,) => key.endsWith(SECRET_KEY_SUFFIX,)),);
  const descriptors: SdSetupDescriptorBase[] = [];
  for (const row of rows) {
    if (!row.key.endsWith(DESCRIPTOR_KEY_SUFFIX,)) { continue; }
    const stored = parseStoredSdSetup(row.value,);
    if (stored) { descriptors.push(hasSecret(stored, secretKeys, family,),); }
  }

  descriptors.sort((a, b,) => a.name.localeCompare(b.name,));
  return descriptors;
}

/**
 * Persist an operator-entered setup. Callers probe-gate the save on live
 * reachability — this store only validates and stores. An empty `apiKey`
 * clears a previously stored key; an undefined one keeps it.
 * @param db - Kysely database handle
 * @param family - the image-engine family the setup belongs to
 * @param input - the validated-by-caller payload
 * @returns the stored descriptor, including the hasApiKey flag
 * @throws {SdSetupValidationError} when name, baseUrl, purpose, workflow or defaults are invalid
 */
export async function saveSdSetup(
  db: Kysely<DB>,
  family: SdSetupFamily,
  input: SaveSdSetupInput,
): Promise<SdSetupDescriptorBase & { workflow?: string }> {
  const normalized = assertValidSetupInput(input,);
  const serialized = safeJsonStringify({
    name: input.name,
    label: normalized.label,
    baseUrl: input.baseUrl,
    purpose: normalized.purpose,
    defaults: normalized.defaults,
    ...(input.workflow !== undefined ? { workflow: input.workflow, } : {}),
    storedAt: new Date().toISOString(),
  },);

  await setConfig(db, sdDescriptorKey(family, input.name,), serialized.ok ? serialized.value : "{}",);
  if (input.apiKey !== undefined) {
    if (input.apiKey === "") {
      await deleteConfig(db, sdSecretKey(family, input.name,),);
    } else {
      await setConfig(db, sdSecretKey(family, input.name,), input.apiKey,);
    }
  }

  const rows = await readSdSetupRows(db, family,);
  return {
    name: input.name,
    label: normalized.label,
    baseUrl: input.baseUrl,
    purpose: normalized.purpose,
    defaults: normalized.defaults,
    ...(input.workflow !== undefined ? { workflow: input.workflow, } : {}),
    hasApiKey: rows.some((row,) => row.key === sdSecretKey(family, input.name,)),
  };
}

/**
 * Delete a stored setup and its sealed API key.
 * @param db - Kysely database handle
 * @param family - the image-engine family the setup belongs to
 * @param name - the instance name to remove
 * @throws {SdSetupValidationError} when no descriptor row exists under that name
 */
export async function deleteSdSetup(db: Kysely<DB>, family: SdSetupFamily, name: string,): Promise<void> {
  const rows = await readSdSetupRows(db, family,);
  if (!rows.some((row,) => row.key === sdDescriptorKey(family, name,))) {
    throw new SdSetupValidationError(`no stored setup named "${name}"`, "name",);
  }

  await deleteConfig(db, sdDescriptorKey(family, name,),);
  await deleteConfig(db, sdSecretKey(family, name,),);
}

/**
 * Stored setups converted straight to provider configs — the generation-path
 * merge (no `hasApiKey` resolution, no sorting).
 * @param db - Kysely database handle
 * @param family - the image-engine family to materialize
 * @returns provider configs for every well-formed stored descriptor
 */
export async function listStoredSdSetupProviders(
  db: Kysely<DB>,
  family: SdSetupFamily,
): Promise<ImageProviderConfig[]> {
  const rows = await readSdSetupRows(db, family,);
  const providers: ImageProviderConfig[] = [];
  for (const row of rows) {
    if (!row.key.endsWith(DESCRIPTOR_KEY_SUFFIX,)) { continue; }
    const stored = parseStoredSdSetup(row.value,);
    if (stored) { providers.push(sdStoredSetupToProviderConfig(family, stored,),); }
  }

  return providers;
}

/**
 * Convert a stored descriptor into an image provider config the engine can
 * dispatch on.
 * @param family - the image-engine family the setup belongs to
 * @param descriptor - a stored setup descriptor
 * @returns the provider config (apiFamily per family)
 */
export function sdStoredSetupToProviderConfig(
  family: SdSetupFamily,
  descriptor: ParsedSdSetup,
): ImageProviderConfig {
  return {
    name: descriptor.name,
    label: descriptor.label,
    baseUrl: descriptor.baseUrl,
    apiFamily: family,
    purpose: descriptor.purpose,
    defaults: descriptor.defaults,
    timeout: SD_SETUP_TIMEOUT_MS,
    generationTimeout: SD_SETUP_GENERATION_TIMEOUT_MS,
    ...(descriptor.workflow !== undefined ? { workflow: descriptor.workflow, } : {}),
  };
}

/**
 * Merge stored setups into a configured provider list: a stored setup
 * replaces a config-file provider with the same name (operator intent wins),
 * the rest are appended in config order. The result feeds the generation
 * failover candidates so a saved instance is live without a restart.
 * @param configured - providers from the config file (may be undefined)
 * @param stored - provider configs converted from stored descriptors
 * @returns the merged list
 */
export function mergeSdSetups(
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
