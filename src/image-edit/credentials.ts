// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Image-edit credential resolution (BYOK coverage).
 *
 * The edit path dispatches through the sd provider list (`purpose: edit`), so
 * the credential is resolved per that instance's NAME: the user's stored key
 * when present and allowed, otherwise undefined (the provider then falls back
 * to its own operator key — or none, for stock ComfyUI). A stored key that
 * fails to decrypt throws {@link ByoKeyDecryptError}: the request aborts
 * before any backend call, so a corrupt row can never silently bill the
 * operator credential.
 *
 * @module credentials
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import { pickSdProvider, } from "../config/schema";
import type { DB, } from "../db/schema";
import { ByoKeyDecryptError, userApiKeyResolver, } from "../generation/providers/user-api-key";

/**
 * Resolve the credential for the image-edit backend instance.
 * @param opts - authenticated user, config and database for the run
 * @returns the user's stored key, or undefined for the operator-key fallback
 * @throws {ByoKeyDecryptError} when a stored key exists but decryption fails
 */
export async function resolveEditApiKey(opts: {
  userId?: string;
  config: Config;
  db: Kysely<DB>;
},): Promise<string | undefined> {
  const sdConfig = pickSdProvider(opts.config.generation.providers.sd, "edit",);
  if (!sdConfig) { return undefined; }

  return userApiKeyResolver({
    userId: opts.userId,
    config: opts.config,
    db: opts.db,
  },)(sdConfig.name,);
}
