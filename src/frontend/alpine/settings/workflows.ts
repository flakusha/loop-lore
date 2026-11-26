// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { log as rootLog, } from "../logger";
import type { SettingsState, WorkflowCatalogEntry, } from "./types";

const log = rootLog.child({ module: "settings-workflows", },);

const USE_CASE_LABELS: Record<string, string> = {
  "image.generate": "Image generation",
  "image.edit": "Image editing",
  "video.generate": "Video generation",
  "audio.generate": "Audio generation",
};

/**
 * Per-use-case workflow picker. The catalog (selected + supported ids) comes
 * from GET /api/v1/workflow-selections; choices are persisted as one
 * `workflowSelections` object in users.settings.
 * @returns {Partial<SettingsState> & ThisType<SettingsState>}
 */
export function workflows(): Partial<SettingsState> & ThisType<SettingsState> {
  return {
    /**
     * Load the catalog and the current per-use-case selections.
     * @returns {Promise<void>}
     */
    async loadWorkflowSelections() {
      try {
        const res = await apiFetch("/api/v1/workflow-selections", { headers: { Accept: "application/json", }, },);
        if (!res.ok) { return; }
        const data = await res.json() as { useCases?: WorkflowCatalogEntry[] };
        this.workflowUseCases = data.useCases ?? [];
        const selections: Record<string, string> = {};
        for (const entry of this.workflowUseCases) {
          if (entry.selected) { selections[entry.useCase] = entry.selected; }
        }

        this.workflowSelections = selections;
      } catch (error) {
        log.warn("loadWorkflowSelections failed", { error: String(error,), },);
      }
    },

    /**
     * Update one use case's choice and persist the whole object. The template
     * fires this without awaiting; persistSettings guards its own errors.
     * @param {string} useCase
     * @param {string} workflowId
     * @returns {Promise<void>}
     */
    async onWorkflowChange(useCase: string, workflowId: string,) {
      this.workflowSelections = { ...this.workflowSelections, [useCase]: workflowId, };
      await this.persistSettings({ workflowSelections: this.workflowSelections, },);
    },

    /**
     * Human-friendly label for a use-case id (no i18n key needed).
     * @param {string} useCase
     * @returns {string}
     */
    workflowUseCaseLabel(useCase: string,) {
      return USE_CASE_LABELS[useCase] ?? useCase;
    },
  };
}
