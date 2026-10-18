// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN template manager panel (GM surface).
 *
 * Alpine scope factory backing `src/components/chat/vn-templates-panel.html`:
 * lists, saves (create-or-update), exports and deletes the world's custom VN
 * templates through the template-engine localStorage store. Built-in
 * registries are read-only by design and never appear here.
 */
import {
  deleteTemplate,
  exportTemplate,
  getTemplatesForWorld,
  importTemplate,
  saveTemplate,
  type VnTemplate,
} from "../vn/templates/template-engine";

/** State of the VN template manager panel. */
export interface VnTemplateManagerState {
  /** World scope of the store; empty string = no world-bound chat. */
  worldId: string;
  /** Custom templates for the world (built-ins excluded). */
  templates: VnTemplate[];
  /** JSON draft shared by the save and export flows. */
  draftJson: string;
  message: string;
  error: string;
  /** Reload the template list from the store. */
  refresh(): void;
  /** Validate the draft JSON and create-or-update it in the store. */
  saveDraft(): void;
  /** Copy a stored template's JSON into the draft textarea. */
  exportTpl(templateId: string,): void;
  /** Delete a stored template. */
  remove(templateId: string,): void;
}

/**
 * Build the Alpine scope for the VN template manager panel.
 * @param worldId World whose custom-template store the panel manages.
 * @returns Panel state with the template list preloaded.
 */
export function vnTemplateManagerFactory(worldId: string,): VnTemplateManagerState {
  return {
    worldId,
    templates: worldId ? getTemplatesForWorld(worldId,) : [],
    draftJson: "",
    message: "",
    error: "",

    refresh() {
      this.templates = this.worldId ? getTemplatesForWorld(this.worldId,) : [];
    },

    saveDraft() {
      this.message = "";

      if (!this.worldId) {
        this.error = "This chat has no world — custom VN templates are world-scoped.";
        return;
      }

      const template = importTemplate(this.draftJson,);
      if (!template) {
        this.error = "Invalid template JSON — id, name and worldId are required.";
        return;
      }

      if (template.worldId !== this.worldId) {
        this.error = `Template worldId "${template.worldId}" does not match this chat's world.`;
        return;
      }

      saveTemplate(template,);
      this.error = "";
      this.message = `Saved "${template.name}" (v${template.version + 1}).`;
      this.refresh();
    },

    exportTpl(templateId: string,) {
      const template = this.templates.find((candidate,) => candidate.id === templateId);
      if (!template) {
        this.message = "";
        this.error = `Template "${templateId}" not found.`;
        return;
      }

      this.draftJson = exportTemplate(template,);
      this.error = "";
      this.message = `Exported "${template.name}" to the JSON box.`;
    },

    remove(templateId: string,) {
      if (!this.worldId) { return; }

      deleteTemplate(this.worldId, templateId,);
      this.error = "";
      this.message = `Deleted "${templateId}".`;
      this.refresh();
    },
  };
}

(globalThis as Record<string, unknown>).vnTemplateManagerFactory = vnTemplateManagerFactory;
