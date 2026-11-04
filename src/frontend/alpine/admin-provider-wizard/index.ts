// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "../i18n";
import { fetchSetupChecks, listSetupProviders, putModelRole, rescanProviderSummaries, saveSetupProvider, } from "./api";
import type { ProviderPayload, } from "./api";
import { deriveProviderName, MODEL_ROLES, PROVIDER_PRESETS, } from "./presets";
import type { ProviderDescriptor, } from "./presets";

/** State of the two-screen provider connection wizard. */
export interface ProviderWizardState {
  open: boolean;
  step: 1 | 2;
  preset: string;
  name: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  setDefault: boolean;
  hasStoredKey: boolean;
  saving: boolean;
  error: string;
  savedName: string;
  testing: boolean;
  testStatus: string;
  testError: string;
  role: string;
  roleProvider: string;
  roleModel: string;
  roleSaving: boolean;
  providers: ProviderDescriptor[];
  setupHints: string[];
}

/** Admin page members the wizard borrows from the surrounding scope. */
interface ProviderWizardHost {
  openImportWizard?: () => void;
  showTab?: (tab: string,) => void;
}

/** The slice spread into the admin page state. */
export interface ProviderWizardSlice {
  wizard: ProviderWizardState;
  providerPresets: typeof PROVIDER_PRESETS;
  providerRoles: typeof MODEL_ROLES;
  openProviderWizard(): void;
  closeWizard(): void;
  selectPreset(presetId: string,): void;
  editProvider(name: string,): void;
  saveProvider(): Promise<void>;
  loadProviders(): Promise<void>;
  loadSetupState(): Promise<void>;
  testConnection(): Promise<void>;
  saveRole(): Promise<void>;
  openImportInstead(): void;
}

/**
 * Build the provider connection wizard slice.
 *
 * Screen 1 connects a provider (POST /api/v1/admin/setup/providers), screen 2 tests it
 * through the existing rescan route and assigns a default model role. Every step is
 * skippable; the wizard can be re-entered from the admin page at any time.
 * @returns A fresh slice with its own wizard state.
 */
export function createProviderWizard(): ProviderWizardSlice {
  const state: ProviderWizardState = {
    open: false,
    step: 1,
    preset: "custom",
    name: "",
    label: "",
    baseUrl: "",
    model: "",
    apiKey: "",
    setDefault: false,
    hasStoredKey: false,
    saving: false,
    error: "",
    savedName: "",
    testing: false,
    testStatus: "",
    testError: "",
    role: "main",
    roleProvider: "",
    roleModel: "",
    roleSaving: false,
    providers: [],
    setupHints: [],
  };

  async function loadProviders(): Promise<void> {
    state.providers = await listSetupProviders();
  }

  async function loadSetupState(): Promise<void> {
    const checks = await fetchSetupChecks();
    state.setupHints = (checks ?? []).filter((c,) => !c.ok).map((c,) => c.hint ?? c.id);
  }

  return {
    wizard: state,
    providerPresets: PROVIDER_PRESETS,
    providerRoles: MODEL_ROLES,

    openProviderWizard(): void {
      state.open = true;
      state.step = 1;
      state.preset = "custom";
      state.name = "";
      state.label = "";
      state.baseUrl = "";
      state.model = "";
      state.apiKey = "";
      state.setDefault = false;
      state.hasStoredKey = false;
      state.error = "";
      state.savedName = "";
      state.testStatus = "";
      state.testError = "";
      state.role = "main";
      state.roleProvider = "";
      state.roleModel = "";
      void loadProviders();
      void loadSetupState();
    },

    closeWizard(): void {
      state.open = false;
      state.apiKey = "";
    },

    selectPreset(presetId: string,): void {
      state.preset = presetId;
      if (presetId === "custom") {
        state.name = "";
        state.label = "";
        return;
      }

      const preset = PROVIDER_PRESETS.find((p,) => p.id === presetId);
      if (!preset) { return; }
      state.name = preset.id;
      state.label = preset.label;
      state.baseUrl = preset.baseUrl;
      state.model = preset.model;
    },

    editProvider(name: string,): void {
      const provider = state.providers.find((p,) => p.name === name);
      if (!provider) { return; }
      const preset = PROVIDER_PRESETS.find((p,) => p.baseUrl === provider.baseUrl);
      state.preset = preset?.id ?? "custom";
      state.name = provider.name;
      state.label = provider.label;
      state.baseUrl = provider.baseUrl;
      state.model = provider.model;
      state.apiKey = "";
      state.hasStoredKey = provider.hasApiKey;
      state.setDefault = false;
      state.error = "";
      state.step = 1;
    },

    async saveProvider(): Promise<void> {
      const name = state.name || (state.baseUrl ? deriveProviderName(state.baseUrl,) : "");
      if (!name || !state.baseUrl || !state.model) {
        state.error = t("admin.providerWizard.missingFields",);
        return;
      }

      const payload: ProviderPayload = {
        name,
        label: state.label || name,
        baseUrl: state.baseUrl,
        model: state.model,
        setDefault: state.setDefault,
      };

      if (state.apiKey !== "") { payload.apiKey = state.apiKey; }
      state.saving = true;
      state.error = "";
      try {
        const provider = await saveSetupProvider(payload,);
        state.apiKey = "";
        state.savedName = provider.name;
        state.roleProvider = provider.name;
        state.roleModel = provider.model;
        state.step = 2;
        showToast("success", t("toasts.providerSaved",),);
        await loadProviders();
      } catch (err) {
        const status = (err as { status?: number }).status;
        state.error = (err as Error).message || t("toasts.failed",);
        if (status !== 400) { showToast("error", t("toasts.networkError",),); }
      } finally {
        state.saving = false;
      }
    },

    loadProviders,

    loadSetupState,

    async testConnection(): Promise<void> {
      state.testing = true;
      state.testError = "";
      try {
        const summaries = await rescanProviderSummaries();
        const summary = summaries.find((p,) => p.name === state.savedName);
        if (!summary) {
          state.testStatus = "error";
          state.testError = t("toasts.failedRescanProviders",);
          return;
        }

        state.testStatus = summary.status;
        state.testError = summary.error ?? "";
      } catch {
        state.testStatus = "error";
        state.testError = t("toasts.networkError",);
      } finally {
        state.testing = false;
      }
    },

    async saveRole(): Promise<void> {
      if (!state.roleProvider || !state.roleModel) { return; }
      state.roleSaving = true;
      try {
        await putModelRole(state.role, state.roleProvider, state.roleModel,);
        showToast("success", t("toasts.roleUpdatedFor", { role: state.role, },),);
      } catch {
        showToast("error", t("toasts.networkError",),);
      } finally {
        state.roleSaving = false;
      }
    },

    openImportInstead(): void {
      const host = this as unknown as ProviderWizardHost;
      state.open = false;
      state.apiKey = "";
      host.openImportWizard?.();
      host.showTab?.("system",);
    },
  };
}
