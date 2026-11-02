// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness tab settings/profiles slice — the admin settings store read side
 * (TASK-harness-provider-tos-usage-class-matrix).
 *
 * Split out of `admin-harness.ts` like `admin-harness-detail`/-files: this
 * module owns the `/api/v1/harness/settings` fetch, the per-profile row
 * shaping (usage-class badges arrive pre-formatted so markup does no
 * formatting), and — with the ToS acknowledgement ticket — the enable
 * toggle + confirmation modal state machine.
 *
 * A settings failure is classified independently of runs/stats: the panel
 * shows the settings error inline without blanking the telemetry tables.
 */
import { harnessFailure, JSON_HEADERS, log, SETTINGS_URL, } from "./admin-harness-detail";
import {
  HarnessSettingsNullable,
  HarnessSettingsResponse,
} from "./admin-harness-schema";
import { t, } from "./i18n";
import { parseOr, } from "./validation";

/** One usage-class badge: label + whether the class is ungated (not ToS-limited). */
export interface HarnessUsageClassBadge {
  /** The raw class value (`subscription-backed` / `local` / `api`). */
  value: string;
  /** Translated badge label. */
  label: string;
  /** True for `local`/`api` — visibly marked ungated / not ToS-limited. */
  ungated: boolean;
}

/** One row of the configured-profiles table. */
export interface HarnessProfileRow {
  name: string;
  flavor: string;
  /** Badge per usage class, in matrix order. */
  usageBadges: HarnessUsageClassBadge[];
  /** Locale key of the provider ToS note (rendered via `t(noteKey)`). */
  noteKey: string;
  subscriptionBacked: boolean;
  acknowledged: boolean;
}

/** Settings state the tab owns inside `adminHarness`. */
export interface HarnessSettingsState {
  harnessSettingsEnabled: boolean;
  harnessProfileRows: HarnessProfileRow[];
  loadingHarnessSettings: boolean;
  harnessSettingsError: string;
}

/** Empty settings state: nothing loaded, nothing enabled (no silent default-on). */
export function emptyHarnessSettingsState(): HarnessSettingsState {
  return {
    harnessSettingsEnabled: false,
    harnessProfileRows: [],
    loadingHarnessSettings: false,
    harnessSettingsError: "",
  };
}

/**
 * Fetch the settings/profiles view and rebuild the rows model.
 * @param state - Live tab state (mutated in place)
 * @returns {Promise<void>}
 */
export async function loadHarnessSettings(state: HarnessSettingsState,): Promise<void> {
  state.loadingHarnessSettings = true;
  state.harnessSettingsError = "";
  try {
    const res = await apiFetch(SETTINGS_URL, JSON_HEADERS,);
    const failure = await harnessFailure(res, "harness.errorLoadSettings",);
    if (failure !== null) {
      state.harnessProfileRows = [];
      state.harnessSettingsEnabled = false;
      state.harnessSettingsError = failure;
      return;
    }

    const data = parseOr(HarnessSettingsNullable, await res.json(), null, () => {
      showToast("error", t("harness.errorShape",),);
    },);

    if (data === null) {
      state.harnessSettingsError = t("harness.errorShape",);
      return;
    }

    applySettings(state, data,);
  } catch (error) {
    log.warn("Harness settings request failed", { error: String(error,), },);
    state.harnessSettingsError = t("harness.errorNetwork",);
  } finally {
    state.loadingHarnessSettings = false;
  }
}

/**
 * Rebuild the rows model from a decoded settings payload.
 * @param state - Live tab state (mutated in place)
 * @param data - decoded `GET /harness/settings` body
 * @returns {void}
 */
export function applySettings(state: HarnessSettingsState, data: HarnessSettingsResponse,): void {
  state.harnessSettingsEnabled = data.enabled;
  state.harnessProfileRows = buildProfileRows(data.profiles,);
}

/**
 * Shape the wire profiles into table rows: one pre-translated badge per
 * usage class, with `local`/`api` visibly flagged ungated.
 * @param profiles - profiles from the settings response
 * @returns {HarnessProfileRow[]} rows the table renders
 */
export function buildProfileRows(profiles: HarnessSettingsResponse["profiles"],): HarnessProfileRow[] {
  return profiles.map((p,) => ({
    name: p.name,
    flavor: p.flavor,
    usageBadges: p.usageClasses.map((value,) => ({
      value,
      label: t(`harness.usage.${value}`,),
      ungated: value !== "subscription-backed",
    })),
    noteKey: p.noteKey,
    subscriptionBacked: p.subscriptionBacked,
    acknowledged: p.tosGrayzoneAcknowledged,
  }));
}
