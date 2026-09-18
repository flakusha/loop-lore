// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * System Config Service
 *
 * CRUD for the system_config key-value table.
 * Seeds defaults at startup.
 * Admin panel reads/writes runtime configuration here.
 */

import { load as yamlLoad, } from "js-yaml";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { SECRET_KEY_PATTERN, } from "./config-keys";
/**
 * Logger instance for this module.
 * @returns Child logger scoped to "system-config".
 */
function log() {
  return getLogger().child({ module: "system-config", },);
}

/** A single system_config row. */
export interface ConfigEntry {
  key: string;
  value: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}
export {
  decorateConfigEntry,
  PER_CHAT_OVERRIDABLE_KEYS,
  REQUIRES_RESTART_KEYS,
  SECRET_KEY_PATTERN,
} from "./config-keys";
/**
 * Return all system config entries ordered by key.
 * @param db - Database instance.
 * @returns All config entries.
 */
export async function getAllConfig(db: Kysely<DB>,): Promise<ConfigEntry[]> {
  return db.selectFrom("system_config",).selectAll().orderBy("key",).execute();
}

/**
 * Return a single config entry by key, or undefined if missing.
 * @param db - Database instance.
 * @param key - Config key.
 * @returns The config entry, or undefined.
 */
export async function getConfig(db: Kysely<DB>, key: string,): Promise<ConfigEntry | undefined> {
  return db.selectFrom("system_config",).selectAll().where("key", "=", key,).executeTakeFirst();
}

/**
 * Return the raw string value for a key, or undefined if missing.
 * @param db - Database instance.
 * @param key - Config key.
 * @returns The value, or undefined.
 */
export async function getConfigValue(db: Kysely<DB>, key: string,): Promise<string | undefined> {
  const row = await db.selectFrom("system_config",).select("value",).where("key", "=", key,).executeTakeFirst();
  return row?.value;
}

/**
 * Insert or update a config entry.
 * Updates updated_at on conflict.
 * @param db - Database instance.
 * @param key - Config key.
 * @param value - Value to store.
 * @param description - Optional human-readable description.
 */
export async function setConfig(
  db: Kysely<DB>,
  key: string,
  value: string,
  description?: string,
): Promise<void> {
  await db
    .insertInto("system_config",)
    .values({ key, value, description: description ?? null, },)
    .onConflict((oc,) =>
      oc
        .column("key",)
        .doUpdateSet({ value, description: description ?? null, updated_at: new Date().toISOString(), },)
    )
    .execute();
}

/**
 * Delete a config entry by key.
 * @param db - Database instance.
 * @param key - Config key.
 */
export async function deleteConfig(db: Kysely<DB>, key: string,): Promise<void> {
  await db.deleteFrom("system_config",).where("key", "=", key,).execute();
}

/**
 * Seed default config values from the app config. Skips existing keys.
 * Missing config sections degrade gracefully: keys sourced from them are skipped.
 * @param db - Database instance.
 * @param config - App config to source defaults from.
 */
export async function seedDefaults(db: Kysely<DB>, config: Config,): Promise<void> {
  const defaults: { key: string; value: string; description: string }[] = [];

  // Graceful degradation (mirrors resolveModelRole in model-roles.ts):
  // skip keys sourced from config sections that are missing. Non-config
  // defaults always seed.
  if (config?.auth) {
    defaults.push(
      {
        key: "registration_open",
        value: String(config.auth.registrationOpen,),
        description: "Allow new user registration",
      },
      {
        key: "session_timeout_hours",
        value: String(config.auth.sessionTimeoutHours,),
        description: "Idle session expiry in hours",
      },
      {
        key: "max_sessions_per_user",
        value: String(config.auth.maxSessionsPerUser,),
        description: "Concurrent session limit",
      },
    );
  }

  if (config?.assets) {
    defaults.push({
      key: "max_upload_size_bytes",
      value: String(config.assets.maxFileSize,),
      description: "Per-file upload size limit in bytes",
    },);
  }

  defaults.push({ key: "log_retention_days", value: "90", description: "Audit log retention in days", },);

  if (config?.generation?.defaultProvider) {
    defaults.push(
      {
        key: "default_provider",
        value: config.generation.defaultProvider,
        description: "Default LLM provider",
      },
      {
        key: "default_model",
        value: config.generation.defaultModels?.[config.generation.defaultProvider] ?? "",
        description: "Default LLM model",
      },
    );
  }

  defaults.push(
    { key: "auto_moderation", value: "false", description: "Enable auto-moderation rules", },
    { key: "profanity_filter", value: "false", description: "Enable profanity filter", },
    { key: "spam_detection", value: "false", description: "Enable spam detection", },
    { key: "max_flags_before_hide", value: "3", description: "Auto-hide content after N flags", },
  );

  for (const d of defaults) {
    const existing = await getConfig(db, d.key,);
    if (!existing) {
      try {
        await setConfig(db, d.key, d.value, d.description,);
      } catch (error) {
        log().warn("Failed to seed config default", { key: d.key, error: (error as Error).message, },);
      }
    }
  }

  log().info("System config defaults seeded", { count: defaults.length, },);
}

/** Per-key result for an import operation. */
export interface ImportEntryResult {
  key: string;
  action: "added" | "changed" | "skipped" | "conflict";
  error?: string;
}

/**
 * Import system_config rows from a YAML or TOML payload produced by the
 * matching export endpoint.
 *
 * - Parses the entire payload, then persists each key via {@link setConfig}.
 * - Secret-pattern keys are read (so the operation can succeed atomically) but
 *   never echoed back in the diff — the import response masks them with
 *   `***REDACTED***` even on success.
 * - Returns one {@link ImportEntryResult} per parsed key, in input order.
 *
 * @param db - Database instance.
 * @param text - Raw YAML/TOML payload.
 * @param format - Payload format.
 * @returns One {@link ImportEntryResult} per parsed key, in input order.
 * @throws if the payload does not parse as the requested format, or if the
 *   parsed root is not a `{ system_config: { … } }` object.
 */
export async function importConfigFromText(
  db: Kysely<DB>,
  text: string,
  format: "yaml" | "toml",
): Promise<ImportEntryResult[]> {
  const parsed: unknown = format === "yaml" ? yamlLoad(text,) : Bun.TOML.parse(text,);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed,)) {
    throw new Error(`Import payload must be a mapping, got ${typeof parsed}`,);
  }
  const root = parsed as { system_config?: unknown };
  const entries = root.system_config;
  if (typeof entries !== "object" || entries === null || Array.isArray(entries,)) {
    throw new Error("Import payload must contain a `system_config` mapping",);
  }
  const results: ImportEntryResult[] = [];
  for (const [key, raw,] of Object.entries(entries as Record<string, unknown>,)) {
    if (typeof raw !== "string") {
      results.push({ key, action: "skipped", error: `value is ${typeof raw}, expected string`, },);
      continue;
    }
    if (SECRET_KEY_PATTERN.test(key,)) {
      results.push({ key, action: "skipped", },);
      continue;
    }
    const existing = await getConfig(db, key,);
    try {
      await setConfig(db, key, raw, existing?.description ?? undefined,);
      results.push({ key, action: existing ? "changed" : "added", },);
    } catch (error) {
      results.push({ key, action: "conflict", error: (error as Error).message, },);
    }
  }
  return results;
}
