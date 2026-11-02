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
  type HarnessSettingsView,
} from "./admin-harness-schema";
import { t, } from "./i18n";
import { safeJsonStringify, } from "./json";
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
  /** Toggle position while the confirmation modal is open (never silently applied). */
  harnessToggleIntent: boolean;
  /** Whether the ToS confirmation modal is visible. */
  harnessAckModalOpen: boolean;
  /** True while a settings save is in flight (confirm button disabled). */
  savingHarnessSettings: boolean;
}

/** Empty settings state: nothing loaded, nothing enabled (no silent default-on). */
export function emptyHarnessSettingsState(): HarnessSettingsState {
  return {
    harnessSettingsEnabled: false,
    harnessProfileRows: [],
    loadingHarnessSettings: false,
    harnessSettingsError: "",
    harnessToggleIntent: false,
    harnessAckModalOpen: false,
    savingHarnessSettings: false,
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
export function applySettings(state: HarnessSettingsState, data: HarnessSettingsView,): void {
  state.harnessSettingsEnabled = data.enabled;
  state.harnessProfileRows = buildProfileRows(data.profiles,);
}

/**
 * Shape the wire profiles into table rows: one pre-translated badge per
 * usage class, with `local`/`api` visibly flagged ungated.
 * @param profiles - profiles from the settings response
 * @returns {HarnessProfileRow[]} rows the table renders
 */
export function buildProfileRows(profiles: HarnessSettingsView["profiles"],): HarnessProfileRow[] {
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

/**
 * Any subscription-backed profile in the current rows? The enable toggle is
 * gated by the ToS confirmation modal exactly when the answer is yes —
 * local/API-only setups enable without a modal (they are not ToS-limited).
 * @param state - Live tab state
 * @returns {boolean} true when at least one profile is subscription-backed.
 */
export function hasSubscriptionBacked(state: HarnessSettingsState,): boolean {
  return state.harnessProfileRows.some((row,) => row.subscriptionBacked);
}

/**
 * Toggle handler: an enable intent on a subscription-backed setup opens the
 * confirmation modal instead of applying (no silent default-on); everything
 * else applies immediately. A disable never needs a modal.
 * @param state - Live tab state (mutated in place)
 * @returns {Promise<void>} resolves after a direct apply (modal path resolves immediately).
 */
export async function onHarnessToggle(state: HarnessSettingsState,): Promise<void> {
  const turningOn = !state.harnessSettingsEnabled;
  if (turningOn && hasSubscriptionBacked(state,)) {
    state.harnessToggleIntent = true;
    state.harnessAckModalOpen = true;
    return;
  }

  await applyHarnessSettings(state, { enabled: turningOn, },);
}

/**
 * Modal confirm: deliberately acknowledge and enable. Sends the requested
 * enable flag plus `true` for every subscription-backed profile — the
 * server replaces the stored ack map, so this is idempotent.
 * @param state - Live tab state (mutated in place)
 * @returns {Promise<void>}
 */
export async function confirmHarnessAck(state: HarnessSettingsState,): Promise<void> {
  const acks: Record<string, boolean> = {};
  for (const row of state.harnessProfileRows) {
    if (row.subscriptionBacked) { acks[row.name] = true; }
  }

  await applyHarnessSettings(state, { enabled: state.harnessToggleIntent, acknowledgements: acks, },);
  state.harnessAckModalOpen = false;
}

/**
 * Modal decline: close the modal and send NOTHING — the acknowledgement
 * flag stays unset and the toggle stays off (re-checked on the next
 * `loadHarness` read, which is the source of truth).
 * @param state - Live tab state (mutated in place)
 * @returns {void}
 */
export function declineHarnessAck(state: HarnessSettingsState,): void {
  state.harnessAckModalOpen = false;
  state.harnessToggleIntent = false;
  state.harnessSettingsEnabled = false;
}

/**
 * PUT the settings patch and re-apply the returned view. A failure surfaces
 * inline via `harnessSettingsError` without closing the modal.
 * @param state - Live tab state (mutated in place)
 * @param patch - enabled flag and/or replacement acknowledgement map
 * @returns {Promise<void>}
 */
export async function applyHarnessSettings(
  state: HarnessSettingsState,
  patch: { enabled?: boolean; acknowledgements?: Record<string, boolean> },
): Promise<void> {
  state.savingHarnessSettings = true;
  state.harnessSettingsError = "";
  try {
    const payload = safeJsonStringify(patch,);
    if (!payload.ok) { throw payload.error; }
    const res = await apiFetch(SETTINGS_URL, { ...JSON_HEADERS, method: "PUT", body: payload.value, },);
    const failure = await harnessFailure(res, "harness.errorSaveSettings",);
    if (failure !== null) {
      state.harnessSettingsError = failure;
      state.harnessSettingsEnabled = false;
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
    log.warn("Harness settings save failed", { error: String(error,), },);
    state.harnessSettingsError = t("harness.errorNetwork",);
  } finally {
    state.savingHarnessSettings = false;
  }
}
