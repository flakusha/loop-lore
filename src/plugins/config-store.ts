// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stored plugin config access (FEAT-051).
 *
 * Owns the `plugin_state.config_json` read/write pair so the loader and the
 * admin config routes share one storage boundary. Reads are best-effort:
 * a missing row, a DB error, or malformed JSON all fall back to `{}` so a
 * bad row can never block plugin load.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonStringifyOr, } from "../utils";
import { parseStoredPluginConfig, } from "./config-merge";

/**
 * Read a plugin's stored config override.
 * @param db - Kysely handle.
 * @param name - Plugin name.
 * @returns Parsed stored config, or `{}` when absent/unreadable.
 */
export async function readStoredPluginConfig(
  db: Kysely<DB>,
  name: string,
): Promise<Record<string, unknown>> {
  try {
    const row = await db
      .selectFrom("plugin_state",)
      .select(["config_json",],)
      .where("name", "=", name,)
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
 * Persist a plugin's config override, preserving any existing row status.
 * @param db - Kysely handle.
 * @param name - Plugin name.
 * @param stored - Config object to store.
 * @throws When the write fails (caller surfaces the error).
 */
export async function writeStoredPluginConfig(
  db: Kysely<DB>,
  name: string,
  stored: Record<string, unknown>,
): Promise<void> {
  const configJson = jsonStringifyOr(stored,);
  await db
    .insertInto("plugin_state",)
    .values({ name, status: "active", config_json: configJson, },)
    .onConflict((oc,) => oc.column("name",).doUpdateSet({ config_json: configJson, },))
    .execute();
}
