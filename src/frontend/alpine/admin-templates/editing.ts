// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "../i18n";
import { jsonBody, } from "../json";
import type { AdminTemplates, EditingTemplate, } from "./types";

export const editing = {
  // ── Inline edit state ───────────────────────────────
  editingTemplate: null as EditingTemplate | null,
  savingTemplate: false,

  // ── Inline template editing ─────────────────────────

  startEditTemplate(detail: string, mode: string, value: string,) {
    this.editingTemplate = { detail, mode, value, };
  },

  cancelEditTemplate() {
    this.editingTemplate = null;
  },

  async saveTemplate(this: AdminTemplates,) {
    if (!this.editingTemplate || !this.selectedProfile) { return; }
    this.savingTemplate = true;
    try {
      const { detail, mode, value, } = this.editingTemplate;
      const res = await (globalThis as any).apiFetch(
        `/api/admin/templates/${this.selectedProfile.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ detail, mode, template: value, },),
        },
      );
      if (res.ok) {
        (globalThis as any).showToast("success", t("toasts.templateSaved",),);
        // Update local state
        if (this.selectedProfile.templates) {
          if (!this.selectedProfile.templates[detail]) {
            this.selectedProfile.templates[detail] = {};
          }
          this.selectedProfile.templates[detail][mode] = value;
        }
        this.editingTemplate = null;
        // Refresh list counts
        await this.loadTemplates();
      } else {
        const err = await res.json();
        (globalThis as any).showToast("error", err.error || t("toasts.failedSave",),);
      }
    } catch {
      (globalThis as any).showToast("error", t("toasts.networkError",),);
    } finally {
      this.savingTemplate = false;
    }
  },

  // ── Save model defaults ─────────────────────────────

  async saveDefaults(this: AdminTemplates,) {
    if (!this.selectedProfile) { return; }
    try {
      const d = this.selectedProfile.defaults;
      const res = await (globalThis as any).apiFetch(
        `/api/admin/templates/${this.selectedProfile.id}/defaults`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            cfgScale: d.cfgScale,
            steps: d.steps,
            sampler: d.sampler,
            scheduler: d.scheduler,
            maxTokenHint: this.selectedProfile.maxTokenHint,
          },),
        },
      );
      if (res.ok) {
        (globalThis as any).showToast("success", t("toasts.defaultsSaved",),);
        await this.loadTemplates();
      } else {
        const err = await res.json();
        (globalThis as any).showToast("error", err.error || t("toasts.failedSave",),);
      }
    } catch {
      (globalThis as any).showToast("error", t("toasts.networkError",),);
    }
  },
};
