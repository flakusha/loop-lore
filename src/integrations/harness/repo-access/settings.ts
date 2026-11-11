// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * repo-access/settings.ts — the repo-access tier master-switch store.
 *
 * SECURITY BOUNDARY — DANGEROUS CAPABILITY GATE. The tier executes repo
 * commands and touches repo-root paths, so the switch is:
 *  - DISABLED BY DEFAULT: the file layer defaults to `false`, an unseeded
 *    store reads as disabled, and NOTHING in the codebase ever flips it on
 *    automatically — only the operator enables it (config file
 *    `harness.repoAccess.enabled`, or the admin harness-settings override
 *    persisted to `system_config`).
 *  - OVERRIDE-WINS: the admin override layer beats the file layer once
 *    seeded, exactly like `harness.acp.enabled` (admin-settings.ts).
 *  - FAIL-CLOSED: every read collapses to `false` on absent/unknown input.
 *
 * Mirrors the HarnessAdminSettingsStore singleton style (no module-level
 * drift); kept separate from it because the ACP store is profile-shaped and
 * its `init` call sites pass `harness.acp` only.
 */
import type { Kysely, } from "kysely";
import { getConfigValue, setConfig, } from "../../../admin/config";
import { type RepoAccessConfig, } from "../../../config/schema/harness";
import type { DB, } from "../../../db/schema";

/** system_config key holding the repo-access master switch ("true"/"false"). */
export const REPO_ACCESS_SETTINGS_ENABLED_KEY = "harness.repoaccess.enabled";

/** Description stamped onto the repo-access system_config row. */
const ENABLED_DESCRIPTION =
  "Enable the RSI repo-access tier (DANGEROUS: repo-root scope + repo command execution for the internal-service principal; audited; default off)";

/** Effective repo-access settings (override layer wins over the file). */
export interface RepoAccessSettingsView {
  enabled: boolean;
}

interface RepoAccessSettingsStoreState {
  seeded: boolean;
  fileEnabled: boolean;
  enabledOverride: boolean | null;
}

/** Singleton store — mirrors HarnessAdminSettingsStore (no module-level drift). */
class RepoAccessSettingsStore {
  private state: RepoAccessSettingsStoreState = {
    seeded: false,
    fileEnabled: false,
    enabledOverride: null,
  };

  /** Seed the file layer (idempotent; later calls refresh the file view). */
  init(file?: RepoAccessConfig,): void {
    this.state.seeded = true;
    this.state.fileEnabled = file?.enabled === true;
  }

  /** Apply an admin save to the override layer. */
  update(patch: { enabled?: boolean },): void {
    if (patch.enabled !== undefined) { this.state.enabledOverride = patch.enabled; }
  }

  /** Effective view: override when present, else the file layer; unseeded = off. */
  get(): RepoAccessSettingsView {
    const effective = this.state.seeded
      ? (this.state.enabledOverride ?? this.state.fileEnabled)
      : false;

    return { enabled: effective, };
  }

  /** Whether the file layer has been seeded (boot availability check). */
  isSeeded(): boolean {
    return this.state.seeded;
  }

  /** Reset to unseeded defaults. Dev/test only. */
  reset(): void {
    this.state = { seeded: false, fileEnabled: false, enabledOverride: null, };
  }
}

export const repoAccessSettings = new RepoAccessSettingsStore();

/**
 * Seed the store's file layer from the loaded `harness.repoAccess` config.
 * Called once at server boot beside `initHarnessAdminSettings`; an absent
 * section (loadConfig omits unconfigured sections) seeds DISABLED.
 * @param repoAccess - the loaded section, when configured
 */
export function initRepoAccessSettings(repoAccess?: RepoAccessConfig,): void {
  repoAccessSettings.init(repoAccess,);
}

/**
 * Read the effective (file + admin override) repo-access settings.
 * @returns {RepoAccessSettingsView} the effective view (unseeded = disabled).
 */
export function getRepoAccessSettings(): RepoAccessSettingsView {
  return repoAccessSettings.get();
}

/**
 * Overlay the persisted admin override from `system_config` onto the store.
 * Called at boot (after the DB opens) and on every save, mirroring
 * `applyStoredHarnessSettings`.
 * @param db - database handle
 */
export async function applyStoredRepoAccessSettings(db: Kysely<DB>,): Promise<void> {
  const raw = await getConfigValue(db, REPO_ACCESS_SETTINGS_ENABLED_KEY,);
  const patch: { enabled?: boolean } = {};
  if (raw === "true") { patch.enabled = true; }
  if (raw === "false") { patch.enabled = false; }

  if (patch.enabled !== undefined) { repoAccessSettings.update(patch,); }
}

/**
 * Persist an admin patch through the existing config save path (`setConfig`
 * into `system_config`) and apply it to the override layer.
 * @param db - database handle
 * @param patch - the enabled flag to persist; omit to change nothing
 * @returns {Promise<RepoAccessSettingsView>} the effective view after the save
 */
export async function saveRepoAccessSettings(
  db: Kysely<DB>,
  patch: { enabled?: boolean },
): Promise<RepoAccessSettingsView> {
  if (patch.enabled !== undefined) {
    await setConfig(db, REPO_ACCESS_SETTINGS_ENABLED_KEY, String(patch.enabled,), ENABLED_DESCRIPTION,);
  }

  repoAccessSettings.update({ enabled: patch.enabled, },);
  return repoAccessSettings.get();
}

/** Reset the store to unseeded defaults. Dev/test only. */
export function resetRepoAccessSettings(): void {
  repoAccessSettings.reset();
}
