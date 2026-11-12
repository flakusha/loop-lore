// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI setup store — operator-entered ComfyUI instances persisted in
 * `system_config` and materialized onto the generation failover path.
 *
 * Thin family binding over the shared engine (`sd-setup-store.ts`), mirroring
 * the sd.cpp surface: the routes probe-gate each save on live reachability
 * (`GET /system_stats`), and list responses never carry key material — only a
 * `hasApiKey` flag (the key seals an optional Bearer credential for
 * reverse-proxy-fronted engines, the same auth seam the ComfyUI client and
 * the video path already use). Rows live under `comfyui.<name>.config`
 * (descriptor JSON) and `comfyui.<name>.apiKey` (sealed automatically by
 * setConfig).
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
  SdSetupValidationError,
  sdStoredSetupToProviderConfig,
} from "./sd-setup-store";

/** Public descriptor of a stored ComfyUI setup — never carries key material. */
export interface ComfyUISetupDescriptor extends SdSetupDescriptorBase {
  /** ComfyUI workflow name (filename without extension), when pinned. */
  readonly workflow?: string;
}

/** Input for {@link saveComfyUISetup}. */
export type SaveComfyUISetupInput = SaveSdSetupInput;

/** Raised when operator input for a ComfyUI setup is rejected. */
export { SdSetupValidationError, };

/**
 * @param name - provider instance name
 * @returns the `system_config` key holding the JSON descriptor
 */
export function comfyUIDescriptorKey(name: string,): string {
  return sdDescriptorKey("comfyui", name,);
}

/**
 * @param name - provider instance name
 * @returns the `system_config` key holding the (sealed) API key
 */
export function comfyUISecretKey(name: string,): string {
  return sdSecretKey("comfyui", name,);
}

/**
 * Parse a persisted descriptor row.
 * @param value - the raw `system_config` value of a `comfyui.<name>.config` key
 * @returns the stored setup (without hasApiKey), or null when the row is malformed
 */
export function parseStoredComfyUISetup(value: string,): Omit<ComfyUISetupDescriptor, "hasApiKey"> | null {
  return parseStoredSdSetup(value,);
}

/**
 * List every stored ComfyUI setup. Key material is never returned — each
 * descriptor reports only whether a sealed API key exists.
 * @param db - Kysely database handle
 * @returns descriptors ordered by name
 */
export async function listComfyUISetups(db: Kysely<DB>,): Promise<ComfyUISetupDescriptor[]> {
  return await listSdSetups(db, "comfyui",);
}

/**
 * Persist an operator-entered ComfyUI setup. Callers probe-gate the save on
 * live reachability — this store only validates and stores. An empty `apiKey`
 * clears a previously stored key; an undefined one keeps it.
 * @param db - Kysely database handle
 * @param input - the validated-by-caller payload
 * @returns the stored descriptor
 * @throws {SdSetupValidationError} when name, baseUrl, purpose, workflow or defaults are invalid
 */
export async function saveComfyUISetup(
  db: Kysely<DB>,
  input: SaveComfyUISetupInput,
): Promise<ComfyUISetupDescriptor> {
  return await saveSdSetup(db, "comfyui", input,);
}

/**
 * Delete a stored ComfyUI setup and its sealed API key.
 * @param db - Kysely database handle
 * @param name - the instance name to remove
 * @throws {SdSetupValidationError} when no descriptor row exists under that name
 */
export async function deleteComfyUISetup(db: Kysely<DB>, name: string,): Promise<void> {
  await deleteSdSetup(db, "comfyui", name,);
}

/**
 * Stored ComfyUI setups converted straight to provider configs — the
 * generation-path merge (no `hasApiKey` resolution, no sorting).
 * @param db - Kysely database handle
 * @returns provider configs for every well-formed stored descriptor
 */
export async function listStoredComfyUIProviders(db: Kysely<DB>,): Promise<ImageProviderConfig[]> {
  return await listStoredSdSetupProviders(db, "comfyui",);
}

/**
 * Convert a stored descriptor into an image provider config the engine can
 * dispatch on.
 * @param descriptor - a stored setup descriptor
 * @returns the provider config (apiFamily "comfyui")
 */
export function comfyUISetupToProviderConfig(
  descriptor: Omit<ComfyUISetupDescriptor, "hasApiKey">,
): ImageProviderConfig {
  return sdStoredSetupToProviderConfig("comfyui", descriptor,);
}

/**
 * Merge stored ComfyUI setups into a configured provider list: a stored setup
 * replaces a config-file provider with the same name (operator intent wins),
 * the rest are appended in config order.
 * @param configured - providers from the config file (may be undefined)
 * @param stored - provider configs converted from stored descriptors
 * @returns the merged list
 */
export function mergeComfyUISetups(
  configured: ImageProviderConfig[] | undefined,
  stored: ImageProviderConfig[],
): ImageProviderConfig[] {
  return mergeSdSetups(configured, stored,);
}
