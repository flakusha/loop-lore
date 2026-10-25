// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-provider BYO (bring-your-own) API key resolution.
 *
 * A resolver is built once per request and called with the name of the
 * provider about to be dispatched, so a key stored for provider A is never
 * handed to provider B during failover.
 */

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { decryptValue, } from "../../crypto";
import { getDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { findProviderInstance, } from "./provider-instances";
import type { UserApiKeyResolver, } from "./types";

/**
 * Thrown when a stored BYO key exists but cannot be decrypted (rotated or
 * wrong `byoKey.encryptionKey`, corrupt row).
 *
 * BUG-byo-decrypt-failure-silently-falls-back-to-server-key: the previous
 * warn-log-and-undefined fallback let the request proceed on the SERVER key
 * while the user believed their own key was billed. The typed failure now
 * aborts the request before any vendor call (`resolveProvider` awaits the
 * resolver during option resolution, and `callWithFailover` awaits it outside
 * the per-attempt try, so the throw propagates without failover).
 */
export class ByoKeyDecryptError extends Error {
  constructor(provider: string, userId: string,) {
    super(
      `BYO API key for provider "${provider}" could not be decrypted ` +
        `(user ${userId}) — re-save your key; the request was NOT dispatched ` +
        "on the server key",
    );

    this.name = "ByoKeyDecryptError";
  }
}

/**
 * Whether a stored user key may be used against this provider instance.
 * Only an explicit `false` denies: an instance absent from config (partial
 * configs in tests, `callAux` forwarding a stub) keeps the historical default.
 * @param config
 * @param providerName
 * @returns {boolean}
 */
function userKeyAllowed(config: Config, providerName: string,): boolean {
  return findProviderInstance(config, providerName,)?.allowUserApiKey !== false;
}

/**
 * Build a BYO key resolver bound to one user + config.
 *
 * Returns undefined whenever the key must not be used: BYO disabled, no
 * encryption key, a provider with `allowUserApiKey: false`, or no stored key.
 * A stored key that FAILS to decrypt throws {@link ByoKeyDecryptError} —
 * warn-logged here, then surfaced so the request is never billed to the
 * server key (BUG-byo-decrypt-failure-silently-falls-back-to-server-key).
 * @throws {ByoKeyDecryptError} when a stored key exists but decryption fails
 * @param opts
 * @param opts.userId
 * @param opts.config
 * @param opts.db
 * @returns {UserApiKeyResolver}
 */
export function userApiKeyResolver(opts: {
  userId?: string;
  config: Config;
  db?: Kysely<DB>;
},): UserApiKeyResolver {
  const { userId, config, db, } = opts;

  return async (providerName: string,) => {
    if (!userId || !config.byoKey?.enabled || !config.byoKey?.encryptionKey) { return undefined; }
    if (!userKeyAllowed(config, providerName,)) { return undefined; }

    const database = db ?? getDatabase();
    try {
      const row = await database
        .selectFrom("user_api_keys",)
        .selectAll()
        .where("user_id", "=", userId,)
        .where("provider_name", "=", providerName,)
        .executeTakeFirst();

      if (!row) { return undefined; }
      return await decryptValue(row.api_key_encrypted, config.byoKey.encryptionKey,);
    } catch (error) {
      // Fatal for the request — log provider + userId (never key material),
      // then surface the typed failure instead of billing the server key.
      const reason = error instanceof Error ? error.message : String(error,);
      getLogger().warn("BYO API key decrypt failed — aborting request instead of falling back to server key", {
        provider: providerName,
        userId,
        error: reason,
      },);

      throw new ByoKeyDecryptError(providerName, userId,);
    }
  };
}
