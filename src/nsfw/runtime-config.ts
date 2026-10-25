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
  private file: NsfwRuntimeConfig = { ...DEFAULTS, };
  private override: Partial<NsfwRuntimeConfig> = {};

  /**
   * @param config
   */
  init(config: NsfwRuntimeConfig,): void {
    this.file = { ...DEFAULTS, ...config, };
    this.override = {};
  }

  /** */
  /**
   * @returns {NsfwConfig}
   */
  get(): NsfwRuntimeConfig {
    return { ...this.file, ...this.override, };
  }

  /**
   * Admin override: persisted in `system_config`, re-applied at startup. It is
   * kept apart from the file layer so a config-file reload cannot undo it.
   * @param partial
   */
  update(partial: Partial<NsfwRuntimeConfig>,): void {
    this.override = { ...this.override, ...partial, };
  }

  /**
   * Config-file value: never touches the admin override.
   * @param partial
   */
  updateFile(partial: Partial<NsfwRuntimeConfig>,): void {
    this.file = { ...this.file, ...partial, };
  }
}

export const nsfwRuntimeConfig = new NsfwRuntimeConfigStore();

/**
 * Seed the runtime config from file config. Called once during server start.
 * @param config
 * @returns {void}
 */
export function initNsfwRuntimeConfig(config: NsfwRuntimeConfig,): void {
  nsfwRuntimeConfig.init(config,);
}

/**
 * Read the current (possibly admin-overridden) runtime NSFW config.
 * @returns {NsfwConfig}
 */
export function getRuntimeNsfwConfig(): NsfwRuntimeConfig {
  return nsfwRuntimeConfig.get();
}

/**
 * Effective NSFW config for enforcement.
 *
 * The route layer is handed the boot-time file `Config`, but the admin
 * kill-switch lives in the runtime store — reading the file value alone
 * ignores a live admin toggle (the store carries both the admin override
 * and the live file value). Merge the two sources: NSFW is allowed only
 * when the file config AND the runtime store allow it, and the minimum
 * age comes from the runtime store (it carries the admin threshold).
 * @param fileConfig
 * @returns {NsfwConfig}
 */
export function effectiveNsfwConfig(fileConfig: NsfwConfig,): NsfwConfig {
  const runtime = getRuntimeNsfwConfig();
  return {
    ...fileConfig,
    allowNsfw: fileConfig.allowNsfw && runtime.allowNsfw,
    nsfwMinAge: runtime.nsfwMinAge,
  };
}

/**
 * Apply a partial update to the live runtime NSFW config.
 * This is the ADMIN path: the value is persisted in `system_config` and
 * re-applied at startup, so it lives in the override layer and survives a
 * config-file reload.
 * @param partial
 * @returns {void}
 */
export function updateRuntimeNsfwConfig(partial: Partial<NsfwRuntimeConfig>,): void {
  nsfwRuntimeConfig.update(partial,);
}

/**
 * Apply a partial update that came from the CONFIG FILE (a hot reload). It
 * only touches the file layer, so an admin override is preserved.
 * @param partial
 * @returns {void}
 */
export function updateRuntimeNsfwFileConfig(partial: Partial<NsfwRuntimeConfig>,): void {
  nsfwRuntimeConfig.updateFile(partial,);
}

/**
 * Reset the runtime store to the code defaults. Dev/test only — re-seeds the
 * module-level singleton after a mutation (e.g. `PUT /api/admin/nsfw` during a
 * test run) so cross-file pollution doesn't leak into later test files when
 * the suite runs without `--isolate`.
 * @returns {void}
 */
export function resetNsfwRuntimeConfig(): void {
  initNsfwRuntimeConfig({ ...DEFAULTS, },);
}

/**
 * Overlay any persisted admin overrides from `system_config` onto the runtime
 * store. Called once during server start, after the DB is available, so a
 * value saved via the admin panel survives a restart.
 * @param db
 * @returns {Promise<void>}
 */
export async function applyStoredNsfwConfig(db: Kysely<DB>,): Promise<void> {
  // Dotted paths, matching HOT_APPLY_PATHS and the keys admin-nsfw.ts writes.
  // The legacy `nsfw_allow` / `nsfw_min_age` rows are intentionally NOT read:
  // nothing writes them any more, and reading them would silently shadow the
  // live config with a value no admin surface can update.
  const allowRaw = await getConfigValue(db, "nsfw.allowNsfw",);
  const minAgeRaw = await getConfigValue(db, "nsfw.nsfwMinAge",);

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
