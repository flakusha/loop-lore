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
import { PluginStatus, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonStringifyOr, } from "../utils";
import { parseStoredPluginConfig, } from "./config-merge";
import type { PluginOrigin, } from "./types";

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
 * Persist a plugin's config override, preserving any existing row status.
 *
 * A config write never decides approval. It may have to create the row itself
 * (the loader's own insert is best-effort and can fail), so a brand-new row is
 * given the same origin default the loader would have written rather than an
 * invented state — a `core` plugin whose row went missing stays active. An
 * existing row keeps whatever the admin decided.
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
  await db
    .insertInto("plugin_state",)
    .values({
      name,
      status,
      enabled_at: status === PluginStatus.Active ? new Date().toISOString() : null,
      config_json: configJson,
    },)
    .onConflict((oc,) => oc.column("name",).doUpdateSet({ config_json: configJson, },))
    .execute();
}
