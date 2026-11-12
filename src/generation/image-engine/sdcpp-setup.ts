// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * sd.cpp setup store — operator-entered sd.cpp instances persisted in
 * `system_config` and materialized onto the generation failover path.
 *
 * Thin family binding over the shared engine (`sd-setup-store.ts`): the
 * routes probe-gate each save on live reachability, and list responses never
 * carry key material — only a `hasApiKey` flag. Rows live under
 * `sdcpp.<name>.config` (descriptor JSON) and `sdcpp.<name>.apiKey` (sealed
 * automatically by setConfig — the key matches the repo secret-classification
 * pattern).
 */

import type { Kysely, } from "kysely";
import type { ImageProviderConfig, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import {
  deleteSdSetup,
  listSdSetups,
  listStoredSdSetupProviders,
  mergeSdSetups,
  parseStoredSdSetup,
  saveSdSetup,
  type SaveSdSetupInput,
  sdDescriptorKey,
  sdSecretKey,
  type SdSetupDescriptorBase,
  sdStoredSetupToProviderConfig,
} from "./sd-setup-store";

/** Public descriptor of a stored sd.cpp setup — never carries key material. */
export type SdCppSetupDescriptor = SdSetupDescriptorBase;

/** Input for {@link saveSdCppSetup}. */
export type SaveSdCppSetupInput = Omit<SaveSdSetupInput, "workflow">;

/** Raised when operator input for an sd.cpp setup is rejected. Same class as
 * the shared engine's — re-exported under the family name for callers. */
export { SdSetupValidationError as SdCppSetupValidationError, } from "./sd-setup-store";

/**
 * @param name - provider instance name
 * @returns the `system_config` key holding the JSON descriptor
 */
export function sdCppDescriptorKey(name: string,): string {
  return sdDescriptorKey("sdcpp", name,);
}

/**
 * @param name - provider instance name
 * @returns the `system_config` key holding the (sealed) API key
 */
export function sdCppSecretKey(name: string,): string {
  return sdSecretKey("sdcpp", name,);
}

/**
 * Parse a persisted descriptor row.
 * @param value - the raw `system_config` value of a `sdcpp.<name>.config` key
 * @returns the stored setup (without hasApiKey), or null when the row is malformed
 */
export function parseStoredSdCppSetup(value: string,): Omit<SdCppSetupDescriptor, "hasApiKey"> | null {
  return parseStoredSdSetup(value,);
}

/**
 * List every stored sd.cpp setup. Key material is never returned — each
 * descriptor reports only whether a sealed API key exists.
 * @param db - Kysely database handle
 * @returns descriptors ordered by name
 */
export async function listSdCppSetups(db: Kysely<DB>,): Promise<SdCppSetupDescriptor[]> {
  return await listSdSetups(db, "sdcpp",);
}

/**
 * Persist an operator-entered sd.cpp setup. Callers probe-gate the save on
 * live reachability — this store only validates and stores. An empty `apiKey`
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
  return await saveSdSetup(db, "sdcpp", input,);
}

/**
 * Delete a stored sd.cpp setup and its sealed API key.
 * @param db - Kysely database handle
 * @param name - the instance name to remove
 * @throws {SdCppSetupValidationError} when no descriptor row exists under that name
 */
export async function deleteSdCppSetup(db: Kysely<DB>, name: string,): Promise<void> {
  await deleteSdSetup(db, "sdcpp", name,);
}

/**
 * Stored sd.cpp setups converted straight to provider configs — the
 * generation-path merge (no `hasApiKey` resolution, no sorting).
 * @param db - Kysely database handle
 * @returns provider configs for every well-formed stored descriptor
 */
export async function listStoredSdCppProviders(db: Kysely<DB>,): Promise<ImageProviderConfig[]> {
  return await listStoredSdSetupProviders(db, "sdcpp",);
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
  return sdStoredSetupToProviderConfig("sdcpp", descriptor,);
}

/**
 * Merge stored sd.cpp setups into a configured provider list: a stored setup
 * replaces a config-file provider with the same name (operator intent wins),
 * the rest are appended in config order.
 * @param configured - providers from the config file (may be undefined)
 * @param stored - provider configs converted from stored descriptors
 * @returns the merged list
 */
export function mergeSdCppSetups(
  configured: ImageProviderConfig[] | undefined,
  stored: ImageProviderConfig[],
): ImageProviderConfig[] {
  return mergeSdSetups(configured, stored,);
}
