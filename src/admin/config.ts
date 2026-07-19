/**
 * System Config Service
 *
 * CRUD for the system_config key-value table.
 * Seeds defaults at startup.
 * Admin panel reads/writes runtime configuration here.
 */

import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";

function log() {
  return getLogger().child({ module: "system-config", },);
}

export interface ConfigEntry {
  key: string;
  value: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export async function getAllConfig(db: Kysely<DB>,): Promise<ConfigEntry[]> {
  return db.selectFrom("system_config",).selectAll().orderBy("key",).execute();
}

export async function getConfig(db: Kysely<DB>, key: string,): Promise<ConfigEntry | undefined> {
  return db.selectFrom("system_config",).selectAll().where("key", "=", key,).executeTakeFirst();
}

export async function getConfigValue(db: Kysely<DB>, key: string,): Promise<string | undefined> {
  const row = await db.selectFrom("system_config",).select("value",).where("key", "=", key,).executeTakeFirst();
  return row?.value;
}

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

export async function deleteConfig(db: Kysely<DB>, key: string,): Promise<void> {
  await db.deleteFrom("system_config",).where("key", "=", key,).execute();
}

export async function seedDefaults(db: Kysely<DB>, config: Config,): Promise<void> {
  const defaults: { key: string; value: string; description: string }[] = [
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
    {
      key: "max_upload_size_bytes",
      value: String(config.assets.maxFileSize,),
      description: "Per-file upload size limit in bytes",
    },
    { key: "log_retention_days", value: "90", description: "Audit log retention in days", },
    {
      key: "default_provider",
      value: config.generation.defaultProvider,
      description: "Default LLM provider",
    },
    {
      key: "default_model",
      value: config.generation.defaultModels[config.generation.defaultProvider] ?? "",
      description: "Default LLM model",
    },
    { key: "auto_moderation", value: "false", description: "Enable auto-moderation rules", },
    { key: "profanity_filter", value: "false", description: "Enable profanity filter", },
    { key: "spam_detection", value: "false", description: "Enable spam detection", },
    { key: "max_flags_before_hide", value: "3", description: "Auto-hide content after N flags", },
  ];

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
