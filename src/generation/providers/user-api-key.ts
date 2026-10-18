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
import type { UserApiKeyResolver, } from "./types";

/**
 * Whether a stored user key may be used against this provider instance.
 * Only an explicit `false` denies: an instance absent from config (partial
 * configs in tests, `callAux` forwarding a stub) keeps the historical default.
 * @param config
 * @param providerName
 * @returns {boolean}
 */
function userKeyAllowed(config: Config, providerName: string,): boolean {
  const providers = config.generation?.providers;
  const instance = providers?.openaiCompatible.find((entry,) => entry.name === providerName) ??
    (providers?.anthropic?.name === providerName ? providers.anthropic : undefined) ??
    (providers?.ollamaNative?.name === providerName ? providers.ollamaNative : undefined) ??
    (providers?.bedrock?.name === providerName ? providers.bedrock : undefined);

  return instance?.allowUserApiKey !== false;
}

/**
 * Build a BYO key resolver bound to one user + config.
 *
 * Returns undefined whenever the key must not be used: BYO disabled, no
 * encryption key, a provider with `allowUserApiKey: false`, or no stored key.
 * A decrypt/lookup failure logs and degrades to the server key — never throws.
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
      // Non-fatal fallback — log provider + userId (never key material).
      const reason = error instanceof Error ? error.message : String(error,);
      getLogger().warn("BYO API key decrypt failed — falling back to server key", {
        provider: providerName,
        userId,
        error: reason,
      },);

      return undefined;
    }
  };
}
