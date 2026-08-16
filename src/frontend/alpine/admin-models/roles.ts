// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log, } from "./shared";
import type { ModelRolesResponse, ModelsState, } from "./types";

export const roleState: Partial<ModelsState> & ThisType<ModelsState> = {
  modelRoleList: [] as { role: string; provider: string; model: string }[],
  overrides: {} as Record<string, { provider: string; model: string }>,

  async loadModelRoles() {
    try {
      const res = await apiFetch("/api/admin/model-roles", { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const data: ModelRolesResponse = await res.json();
        this.overrides = data.overrides || {};
        // Build a stable, fully-populated list so every role has a
        // reactive target for x-model (avoids selects losing/resetting state).
        // Use the server's authoritative validRoles (no server-dep import needed).
        this.modelRoleList = Array.from(data.validRoles || [], (role,) => {
          const found = (data.roles || []).find((r,) => r.role === role);
          return { role, provider: found?.provider ?? "", model: found?.model ?? "", };
        },);
      }
    } catch {
      log.warn("Failed to load model roles",);
    }
  },
  onRoleProviderChange(role: string,) {
    const entry = this.modelRoleList.find((e,) => e.role === role);
    if (entry) { entry.model = ""; }
  },
  async saveModelRole(role: string,) {
    const entry = this.modelRoleList.find((e,) => e.role === role);
    if (!entry?.provider || !entry.model) { return; }
    const { provider, model, } = entry;
    try {
      const res = await apiFetch(`/api/admin/model-roles/${role}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ provider, model, },),
      },);
      if (res.ok) {
        showToast("success", t("toasts.roleUpdatedFor", { role, },),);
        await this.loadModelRoles();
      } else {
        const err = await res.json();
        showToast("error", err.error || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },
  async clearModelRole(role: string,) {
    try {
      const res = await apiFetch(`/api/admin/model-roles/${role}`, { method: "DELETE", },);
      if (res.ok) {
        showToast("success", t("toasts.roleClearedFor", { role, },),);
        await this.loadModelRoles();
      } else {
        const err = await res.json();
        showToast("error", err.error || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },
};
