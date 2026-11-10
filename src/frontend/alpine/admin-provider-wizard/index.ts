// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 260

import { showToast, } from "../../ui";
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

/**
 * The scope the slice's methods run against.
 *
 * Alpine evaluates template expressions with `this` bound to the page scope
 * proxy, so the state is read and written through `this` — the host pattern
 * admin-import-wizard.ts and admin-classifier-vocab.ts use. Writing to a
 * closed-over object instead bypasses Alpine's reactive proxy: the value
 * changes but the template never re-renders.
 */
export interface ProviderWizardScope {
  wizard: ProviderWizardState;
  loadProviders(): Promise<void>;
  loadSetupState(): Promise<void>;
  /** Admin page members the wizard borrows from the surrounding scope. */
  openImportWizard?: () => void;
  showTab?: (tab: string,) => void;
}

/** The slice spread into the admin page state. */
export interface ProviderWizardSlice {
  wizard: ProviderWizardState;
  providerPresets: typeof PROVIDER_PRESETS;
  providerRoles: typeof MODEL_ROLES;
  openProviderWizard(this: ProviderWizardScope,): void;
  closeWizard(this: ProviderWizardScope,): void;
  selectPreset(this: ProviderWizardScope, presetId: string,): void;
  editProvider(this: ProviderWizardScope, name: string,): void;
  saveProvider(this: ProviderWizardScope,): Promise<void>;
  loadProviders(this: ProviderWizardScope,): Promise<void>;
  loadSetupState(this: ProviderWizardScope,): Promise<void>;
  testConnection(this: ProviderWizardScope,): Promise<void>;
  saveWizardRole(this: ProviderWizardScope,): Promise<void>;
  openImportInstead(this: ProviderWizardScope,): void;
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

  return {
    wizard: state,
    providerPresets: PROVIDER_PRESETS,
    providerRoles: MODEL_ROLES,

    openProviderWizard(this: ProviderWizardScope,): void {
      this.wizard.open = true;
      this.wizard.step = 1;
      this.wizard.preset = "custom";
      this.wizard.name = "";
      this.wizard.label = "";
      this.wizard.baseUrl = "";
      this.wizard.model = "";
      this.wizard.apiKey = "";
      this.wizard.setDefault = false;
      this.wizard.hasStoredKey = false;
      this.wizard.error = "";
      this.wizard.savedName = "";
      this.wizard.testStatus = "";
      this.wizard.testError = "";
      this.wizard.role = "main";
      this.wizard.roleProvider = "";
      this.wizard.roleModel = "";
      void this.loadProviders();
      void this.loadSetupState();
    },

    closeWizard(this: ProviderWizardScope,): void {
      this.wizard.open = false;
      this.wizard.apiKey = "";
    },

    selectPreset(this: ProviderWizardScope, presetId: string,): void {
      this.wizard.preset = presetId;
      if (presetId === "custom") {
        this.wizard.name = "";
        this.wizard.label = "";
        return;
      }

      const preset = PROVIDER_PRESETS.find((p,) => p.id === presetId);
      if (!preset) { return; }
      this.wizard.name = preset.id;
      this.wizard.label = preset.label;
      this.wizard.baseUrl = preset.baseUrl;
      this.wizard.model = preset.model;
    },

    editProvider(this: ProviderWizardScope, name: string,): void {
      const provider = this.wizard.providers.find((p,) => p.name === name);
      if (!provider) { return; }
      const preset = PROVIDER_PRESETS.find((p,) => p.baseUrl === provider.baseUrl);
      this.wizard.preset = preset?.id ?? "custom";
      this.wizard.name = provider.name;
      this.wizard.label = provider.label;
      this.wizard.baseUrl = provider.baseUrl;
      this.wizard.model = provider.model;
      this.wizard.apiKey = "";
      this.wizard.hasStoredKey = provider.hasApiKey;
      this.wizard.setDefault = false;
      this.wizard.error = "";
      this.wizard.step = 1;
    },

    async saveProvider(this: ProviderWizardScope,): Promise<void> {
      const name = this.wizard.name || (this.wizard.baseUrl ? deriveProviderName(this.wizard.baseUrl,) : "");
      if (!name || !this.wizard.baseUrl || !this.wizard.model) {
        this.wizard.error = t("admin.providerWizard.missingFields",);
        return;
      }

      const payload: ProviderPayload = {
        name,
        label: this.wizard.label || name,
        baseUrl: this.wizard.baseUrl,
        model: this.wizard.model,
        setDefault: this.wizard.setDefault,
      };

      if (this.wizard.apiKey !== "") { payload.apiKey = this.wizard.apiKey; }
      this.wizard.saving = true;
      this.wizard.error = "";
      try {
        const provider = await saveSetupProvider(payload,);
        this.wizard.apiKey = "";
        this.wizard.savedName = provider.name;
        this.wizard.roleProvider = provider.name;
        this.wizard.roleModel = provider.model;
        this.wizard.step = 2;
        showToast("success", t("toasts.providerSaved",),);
        await this.loadProviders();
      } catch (err) {
        const status = (err as { status?: number }).status;
        this.wizard.error = (err as Error).message || t("toasts.failed",);
        if (status !== 400) { showToast("error", t("toasts.networkError",),); }
      } finally {
        this.wizard.saving = false;
      }
    },

    async loadProviders(this: ProviderWizardScope,): Promise<void> {
      this.wizard.providers = await listSetupProviders();
    },

    async loadSetupState(this: ProviderWizardScope,): Promise<void> {
      const checks = await fetchSetupChecks();
      this.wizard.setupHints = (checks ?? []).filter((c,) => !c.ok).map((c,) => c.hint ?? c.id);
    },

    async testConnection(this: ProviderWizardScope,): Promise<void> {
      this.wizard.testing = true;
      this.wizard.testError = "";
      try {
        const summaries = await rescanProviderSummaries();
        const summary = summaries.find((p,) => p.name === this.wizard.savedName);
        if (!summary) {
          this.wizard.testStatus = "error";
          this.wizard.testError = t("toasts.failedRescanProviders",);
          return;
        }

        this.wizard.testStatus = summary.status;
        this.wizard.testError = summary.error ?? "";
        // The rescan refreshed the server's provider health cache, so the
        // setup-state checks answer differently now — re-read them and let
        // the wizard show the transition (the provider hint clears).
        await this.loadSetupState();
      } catch (err) {
        this.wizard.testStatus = "error";
        this.wizard.testError = (err as Error).message || t("toasts.networkError",);
      } finally {
        this.wizard.testing = false;
      }
    },

    async saveWizardRole(this: ProviderWizardScope,): Promise<void> {
      if (!this.wizard.roleProvider || !this.wizard.roleModel) { return; }
      this.wizard.roleSaving = true;
      try {
        await putModelRole(this.wizard.role, this.wizard.roleProvider, this.wizard.roleModel,);
        // The role resolves now — re-read the setup state so the "missing"
        // hints drop the model-role entry.
        await this.loadSetupState();
        showToast("success", t("toasts.roleUpdatedFor", { role: this.wizard.role, },),);
      } catch (err) {
        showToast("error", (err as Error).message || t("toasts.networkError",),);
      } finally {
        this.wizard.roleSaving = false;
      }
    },

    openImportInstead(this: ProviderWizardScope,): void {
      this.wizard.open = false;
      this.wizard.apiKey = "";
      this.openImportWizard?.();
      this.showTab?.("system",);
    },
  };
}
