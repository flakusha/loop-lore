// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stored plugin config access (FEAT-051).
 *
 * Owns the `plugin_state.config_json` read/write pair so the loader and the
 * admin config routes share one storage boundary. Both are scoped by
 * (name, origin): a row earned by one origin is invisible to another. Reads
 * are best-effort: a missing row, a DB error, or malformed JSON all fall back
 * to `{}` so a bad row can never block plugin load.
 */

import type { Kysely, } from "kysely";
import { PluginStatus, } from "../../../../src/db/enums";
import type { DB, } from "../../../../src/db/schema";
import { getLogger, } from "../../../../src/logger";
import { jsonStringifyOr, } from "../../../../src/utils";
import { parseStoredPluginConfig, } from "./config-merge";
import type { PluginOrigin, } from "./types";

/**
 * Read a plugin's stored config override.
 * @param db - Kysely handle.
 * @param name - Plugin name.
 * @param origin - Origin of the loaded plugin; foreign-origin rows never match.
 * @returns Parsed stored config, or `{}` when absent/unreadable.
 */
export async function readStoredPluginConfig(
  db: Kysely<DB>,
  name: string,
  origin: PluginOrigin,
): Promise<Record<string, unknown>> {
  try {
    const row = await db
      .selectFrom("plugin_state",)
      .select(["config_json",],)
      .where("name", "=", name,)
      .where("origin", "=", origin,)
      .executeTakeFirst();

    return parseStoredPluginConfig(row?.config_json,);
  } catch (error) {
    getLogger().warn({
      message: "Failed to read stored plugin config; using defaults",
      plugin: name,
      error: String(error,),
    },);

    return {};
  }
}

/**
 * The approval state a plugin gets when no admin decision exists yet.
 *
 * Single definition of the origin-scoped rule: only `core` self-approves,
 * `community`/`local` land pending. The loader (`persistPluginState`) and every
 * `plugin_state` row this module creates share it, so the two cannot drift.
 * @param origin - Origin the plugin was loaded from.
 * @returns The status a plugin of that origin gets absent an admin decision.
 */
export function defaultPluginStatus(origin: PluginOrigin,): PluginStatus {
  return origin === "core" ? PluginStatus.Active : PluginStatus.Disabled;
}

/**
 * Persist a plugin's config override on its own (name, origin) row.
 *
 * A config write never decides approval. A brand-new row gets the origin
 * default the loader would have written; an existing row keeps the admin's
 * status. Rows are keyed by (name, origin), so a same-named row from another
 * origin is a different row that this write cannot re-point or re-approve.
 * @param db - Kysely handle.
 * @param name - Plugin name.
 * @param stored - Config object to store.
 * @param origin - Origin of the loaded plugin; decides the default only.
 * @throws When the write fails (caller surfaces the error).
 */
export async function writeStoredPluginConfig(
  db: Kysely<DB>,
  name: string,
  stored: Record<string, unknown>,
  origin: PluginOrigin,
): Promise<void> {
  const configJson = jsonStringifyOr(stored,);
  const status = defaultPluginStatus(origin,);
  const enabledAt = status === PluginStatus.Active ? new Date().toISOString() : null;
  await db
    .insertInto("plugin_state",)
    .values({
      name,
      origin,
      status,
      enabled_at: enabledAt,
      config_json: configJson,
    },)
    .onConflict((oc,) =>
      oc.columns(["name", "origin",],).doUpdateSet({ config_json: configJson, },),
    )
    .execute();
}
