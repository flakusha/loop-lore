// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Runtime Config Store
 *
 * Mirrors the AgeGateConfigStore pattern: a module-level singleton holding
 * the live NSFW config consumed by generation hooks. The admin panel updates
 * it at runtime (and persists to `system_config`), so the global allow/min-age
 * toggle takes effect immediately without a server restart, and survives
 * restarts because the persisted value is re-applied at startup.
 */
import type { Kysely, } from "kysely";
import { getConfigValue, } from "../admin/config";
import type { NsfwConfig, } from "../config/schema";
import type { DB, } from "../db/schema";

/** Admin-editable subset of `NsfwConfig`. */
export type NsfwRuntimeConfig = NsfwConfig;

const DEFAULTS: NsfwRuntimeConfig = {
  allowNsfw: true,
  nsfwMinAge: 18,
  defaultNsfwScope: "chat",
  consentRequired: true,
  auditLogging: true,
  useLlmClassifier: false,
};

/** Singleton store — prevents module-level mutable state issues. */
class NsfwRuntimeConfigStore {
  private config: NsfwRuntimeConfig = { ...DEFAULTS, };

  init(config: NsfwRuntimeConfig,): void {
    this.config = { ...DEFAULTS, ...config, };
  }

  get(): NsfwRuntimeConfig {
    return { ...this.config, };
  }

  update(partial: Partial<NsfwRuntimeConfig>,): void {
    this.config = { ...this.config, ...partial, };
  }
}

export const nsfwRuntimeConfig = new NsfwRuntimeConfigStore();

/** Seed the runtime config from file config. Called once during server start. */
export function initNsfwRuntimeConfig(config: NsfwRuntimeConfig,): void {
  nsfwRuntimeConfig.init(config,);
}

/** Read the current (possibly admin-overridden) runtime NSFW config. */
export function getRuntimeNsfwConfig(): NsfwRuntimeConfig {
  return nsfwRuntimeConfig.get();
}

/** Apply a partial update to the live runtime NSFW config. */
export function updateRuntimeNsfwConfig(partial: Partial<NsfwRuntimeConfig>,): void {
  nsfwRuntimeConfig.update(partial,);
}

/**
 * Overlay any persisted admin overrides from `system_config` onto the runtime
 * store. Called once during server start, after the DB is available, so a
 * value saved via the admin panel survives a restart.
 */
export async function applyStoredNsfwConfig(db: Kysely<DB>,): Promise<void> {
  const allowRaw = await getConfigValue(db, "nsfw_allow",);
  const minAgeRaw = await getConfigValue(db, "nsfw_min_age",);

  const patch: Partial<NsfwRuntimeConfig> = {};

  if (allowRaw !== undefined) {
    let parsed: boolean | undefined;
    if (allowRaw === "true") { parsed = true; }
    else if (allowRaw === "false") { parsed = false; }
    if (parsed !== undefined) { patch.allowNsfw = parsed; }
  }
  if (minAgeRaw !== undefined) {
    const parsed = Number(minAgeRaw,);
    if (Number.isFinite(parsed,) && parsed >= 1 && parsed <= 150) { patch.nsfwMinAge = parsed; }
  }

  if (Object.keys(patch,).length > 0) {
    nsfwRuntimeConfig.update(patch,);
  }
}
