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
import {
  assertValidSetupInput,
  SD_SETUP_GENERATION_TIMEOUT_MS,
  SD_SETUP_TIMEOUT_MS,
  SdSetupValidationError,
} from "./sd-setup-validation";
import type {
  ParsedSdSetup,
  SaveSdSetupInput,
  SdSetupDescriptorBase,
  StoredSdSetup,
} from "./sd-setup-validation";

/** Local image-engine families that support a stored-setup surface. */
export type SdSetupFamily = Extract<ImageApiFamily, "sdcpp" | "comfyui">;

// Validation (error class + input assertions + shared shapes) lives in the
// sibling module; re-exported here so the family bindings keep a single
// import site.
export { SdSetupValidationError, } from "./sd-setup-validation";
export type {
  ParsedSdSetup,
  SaveSdSetupInput,
  SdSetupDescriptorBase,
  StoredSdSetup,
} from "./sd-setup-validation";

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
