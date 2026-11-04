// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness admin settings store (TASK-harness-provider-tos-usage-class-matrix
 * + TASK-harness-tos-acknowledgement-frontend-confirmation).
 *
 * The admin harness panel reads `harness.acp` through this store instead of
 * the file config alone, mirroring `src/nsfw/runtime-config.ts`:
 *
 * - the FILE layer (`harness.acp` in config.yaml/toml) seeds the store at
 *   boot (`initHarnessAdminSettings` from server start);
 * - the OVERRIDE layer (two `system_config` rows written by the admin
 *   harness settings endpoint via `setConfig`) re-applies at startup and on
 *   every save, so an admin toggle survives restarts and a config-file
 *   reload cannot undo it;
 * - reads always see the effective view: override when present, else file.
 *   An unseeded store reads as the code defaults (disabled, no profiles),
 *   so tests stay deterministic without touching ambient config files.
 *
 * The dispatch guard keeps reading `cfg.tosGrayzoneAcknowledged` from the
 * profile config unchanged; this module only models what the admin surface
 * shows and persists. No restart-required classification: the store is
 * updated directly on save (same contract as admin-nsfw.ts).
 */

import type { Kysely, } from "kysely";
import { getConfigValue, setConfig, } from "../../admin/config";
import type { AcpProfileConfig, HarnessAcpConfig, } from "../../config/schema/harness";
import { validateAcpProfiles, } from "../../config/sections/harness";
import type { DB, } from "../../db/schema";
import { safeJsonParse, safeJsonStringify, } from "../../utils";

/** system_config key holding the ACP master switch ("true"/"false"). */
export const HARNESS_SETTINGS_ENABLED_KEY = "harness.acp.enabled";

/**
 * system_config key holding the per-profile ToS greyzone acknowledgements
 * as a JSON object: `{ "<profile name>": true }`. Only `true` is meaningful;
 * anything else reads as "not acknowledged".
 */
export const HARNESS_SETTINGS_ACKS_KEY = "harness.acp.tos_acknowledgements";

/** One configured profile as the admin settings surface sees it. */
export interface HarnessProfileSettingsView {
  name: string;
  /** The profile's `harness` flavor, defaulted to `"omp"` when omitted. */
  flavor: string;
  tosGrayzoneAcknowledged: boolean;
}

/** Effective harness admin settings (override layer wins over the file). */
export interface HarnessAdminSettingsView {
  enabled: boolean;
  profiles: HarnessProfileSettingsView[];
}

interface HarnessSettingsStoreState {
  seeded: boolean;
  file: HarnessAcpConfig;
  enabledOverride: boolean | null;
  acks: Record<string, boolean>;
}

/** Singleton store — mirrors NsfwRuntimeConfigStore (no module-level drift). */
class HarnessAdminSettingsStore {
  private state: HarnessSettingsStoreState = {
    seeded: false,
    file: { enabled: false, profiles: [], },
    enabledOverride: null,
    acks: {},
  };

  /** Seed the file layer (idempotent; later calls refresh the file view). */
  init(file: HarnessAcpConfig,): void {
    this.state.seeded = true;
    this.state.file = file;
  }

  /** Apply an admin save to the override layer. */
  update(patch: { enabled?: boolean; acks?: Record<string, boolean> },): void {
    if (patch.enabled !== undefined) { this.state.enabledOverride = patch.enabled; }
    if (patch.acks !== undefined) { this.state.acks = { ...patch.acks, }; }
  }

  /** Effective view: override when present, else the file layer. */
  get(): HarnessAdminSettingsView {
    return {
      enabled: this.state.enabledOverride ?? this.state.file.enabled,
      profiles: this.state.file.profiles.map((p,) => this.profileView(p,)),
    };
  }

  /** Raw file layer (config-shaped), for save paths that must re-validate the real profiles. */
  getFile(): HarnessAcpConfig {
    return this.state.file;
  }

  /** Whether the file layer has been seeded (boot availability check). */
  isSeeded(): boolean {
    return this.state.seeded;
  }

  /** Reset to unseeded defaults. Dev/test only. */
  reset(): void {
    this.state = {
      seeded: false,
      file: { enabled: false, profiles: [], },
      enabledOverride: null,
      acks: {},
    };
  }

  /** A profile is acknowledged when the file flag OR the override says so. */
  private profileView(p: AcpProfileConfig,): HarnessProfileSettingsView {
    return {
      name: p.name,
      flavor: p.harness ?? "omp",
      tosGrayzoneAcknowledged: p.tosGrayzoneAcknowledged === true || this.state.acks[p.name] === true,
    };
  }
}

export const harnessAdminSettings = new HarnessAdminSettingsStore();

/**
 * Seed the store's file layer from the loaded `harness.acp` config. Called
 * once during server start.
 * @param acp - the file-config `harness.acp` section
 * @returns {void}
 */
export function initHarnessAdminSettings(acp: HarnessAcpConfig,): void {
  harnessAdminSettings.init(acp,);
}

/**
 * Read the effective (file + admin override) harness admin settings.
 * @returns {HarnessAdminSettingsView} the effective view.
 */
export function getHarnessAdminSettings(): HarnessAdminSettingsView {
  return harnessAdminSettings.get();
}

/**
 * Whether the admin settings store has been seeded with the file layer
 * (`initHarnessAdminSettings`, server boot). Dispatch-time availability
 * check for the no-downgrade fallback: while false, consumers fall back to
 * the raw file config — the store's unavailability never widens access
 * (BUG-admin-settings-overrides-never-reach-the-harness-dispatch-gu).
 * @returns true once the file layer is seeded.
 */
export function isHarnessAdminSettingsSeeded(): boolean {
  return harnessAdminSettings.isSeeded();
}

/**
 * Read the raw file-layer `harness.acp` config the store was seeded with —
 * the save path re-validates against these real profiles (the shaped view
 * drops command/tiers on purpose).
 * @returns {HarnessAcpConfig} the file config.
 */
export function getHarnessAdminFileConfig(): HarnessAcpConfig {
  return harnessAdminSettings.getFile();
}

/**
 * Overlay the persisted admin overrides from `system_config` onto the store.
 * Called once during server start so a saved toggle survives restart.
 * Malformed rows are ignored (defaults keep flowing), mirroring
 * `applyStoredNsfwConfig`.
 * @param db - database handle
 * @returns {Promise<void>}
 */
export async function applyStoredHarnessSettings(db: Kysely<DB>,): Promise<void> {
  const patch: { enabled?: boolean; acks?: Record<string, boolean> } = {};

  const enabledRaw = await getConfigValue(db, HARNESS_SETTINGS_ENABLED_KEY,);
  if (enabledRaw === "true") { patch.enabled = true; }
  if (enabledRaw === "false") { patch.enabled = false; }

  const acksRaw = await getConfigValue(db, HARNESS_SETTINGS_ACKS_KEY,);
  if (acksRaw !== undefined) {
    const parsed = safeJsonParse<unknown>(acksRaw,);
    if (parsed.ok && isBooleanRecord(parsed.value,)) { patch.acks = parsed.value; }
  }

  if (patch.enabled !== undefined || patch.acks !== undefined) {
    harnessAdminSettings.update(patch,);
  }
}

/** Reset the store to unseeded defaults. Dev/test only. */
export function resetHarnessAdminSettings(): void {
  harnessAdminSettings.reset();
}

/** Description stamped onto the two harness system_config rows. */
const ENABLED_DESCRIPTION = "Enable the ACP harness integration (admin harness panel)";
const ACKS_DESCRIPTION = "Per-profile harness ToS greyzone acknowledgements (JSON object)";

/**
 * Persist an admin settings patch through the existing config save path
 * (`setConfig` into `system_config`) — the mechanism every admin section
 * uses — after round-tripping the acknowledgement values through
 * `validateAcpProfiles`. The acknowledgements map REPLACES the stored map,
 * so re-confirming is idempotent and an omitted field changes nothing.
 * @param db - database handle
 * @param patch - enabled flag and/or per-profile acknowledgement values
 * @returns {Promise<HarnessAdminSettingsView>} the effective view after the save.
 * @throws {Error} When an acknowledgement names an unknown profile or the
 * merged profile list fails `validateAcpProfiles` — nothing persists.
 */
export async function saveHarnessAdminSettings(
  db: Kysely<DB>,
  patch: { enabled?: boolean; acknowledgements?: Record<string, unknown> },
): Promise<HarnessAdminSettingsView> {
  const file = getHarnessAdminFileConfig();
  const knownNames = new Set(file.profiles.map((p,) => p.name),);

  if (patch.acknowledgements !== undefined) {
    for (const name of Object.keys(patch.acknowledgements,)) {
      if (!knownNames.has(name,)) {
        throw new Error(`harness.acp.tos_acknowledgements: no configured profile named "${name}"`,);
      }
    }

    const acks = patch.acknowledgements;

    // Round-trip gate: inject the RAW acknowledgement values into the file
    // profiles and run the section validator. `enabled` is forced TRUE —
    // the validator skips profile checks while the switch is off, but the
    // dispatch guard consults the ack exactly when the integration is on,
    // so a non-boolean must throw here, before anything is written.
    const merged: HarnessAcpConfig = {
      enabled: true,
      profiles: file.profiles.map((p,) => {
        if (!(p.name in acks)) { return p as AcpProfileConfig; }
        return { ...p, tosGrayzoneAcknowledged: acks[p.name], } as AcpProfileConfig;
      },),
    };

    validateAcpProfiles(merged,);
    const acksJson = safeJsonStringify(acks,);
    if (!acksJson.ok) {
      throw new Error("harness.acp.tos_acknowledgements: values are not JSON-serializable",);
    }

    await setConfig(db, HARNESS_SETTINGS_ACKS_KEY, acksJson.value, ACKS_DESCRIPTION,);
  }

  if (patch.enabled !== undefined) {
    await setConfig(db, HARNESS_SETTINGS_ENABLED_KEY, String(patch.enabled,), ENABLED_DESCRIPTION,);
  }

  harnessAdminSettings.update({
    enabled: patch.enabled,
    acks: patch.acknowledgements === undefined ? undefined : normalizeAcks(patch.acknowledgements,),
  },);

  return harnessAdminSettings.get();
}

/**
 * @param acks - validated acknowledgement values
 * @returns the boolean view of the map (inputs are pre-narrowed by the route;
 * validateAcpProfiles has already rejected non-booleans via the merge).
 */
function normalizeAcks(acks: Record<string, unknown>,): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [name, value,] of Object.entries(acks,)) {
    if (typeof value === "boolean") { out[name] = value; }
  }

  return out;
}

/**
 * @param value - parsed JSON value
 * @returns true when the value is a record whose values are all booleans.
 */
function isBooleanRecord(value: unknown,): value is Record<string, boolean> {
  if (typeof value !== "object" || value === null || Array.isArray(value,)) { return false; }
  return Object.values(value,).every((v,) => typeof v === "boolean");
}
