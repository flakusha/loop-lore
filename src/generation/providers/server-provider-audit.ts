// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Provider store audit trail.
 *
 * The admin write paths of this repo record their mutations in `log_entries`
 * (see `src/routes/admin/system-config.ts`); the provider store mutates
 * provider configuration and secret material, so it records the same way.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { safeJsonStringify, } from "../../utils";
import type { StoredServerProvider, } from "./server-provider-descriptor";
import { warnProviderStore, } from "./server-provider-materialize";

/**
 * Record a provider store mutation in the audit trail.
 *
 * The trail is best-effort — a failing audit row never fails the write.
 * @param db - the database the row is written to
 * @param action - what happened to the instance
 * @param provider - the descriptor the action applied to
 * @param actor - the admin who made the change, when known
 */
export async function auditProviderStore(
  db: Kysely<DB>,
  action: "saved" | "deleted",
  provider: StoredServerProvider,
  actor?: string,
): Promise<void> {
  const meta = safeJsonStringify({
    name: provider.name,
    baseUrl: provider.baseUrl,
    model: provider.model,
    allowedHosts: provider.allowedHosts,
  },);

  try {
    await db
      .insertInto("log_entries",)
      .values({
        id: crypto.randomUUID(),
        level: 6,
        timestamp: Date.now(),
        time: new Date().toISOString(),
        message: `Provider instance "${provider.name}" ${action}`,
        module: "server-provider-store",
        action: `server-provider.${action}`,
        event_type: "admin",
        entity_type: "system",
        entity_id: provider.name,
        user_id: actor ?? null,
        meta: meta.ok ? meta.value : null,
      },)
      .execute();
  } catch (error) {
    warnProviderStore("Could not write the provider store audit row", {
      name: provider.name,
      action,
      error: error instanceof Error ? error.message : String(error,),
    },);
  }
}
