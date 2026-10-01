// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Editor half of the Builder tab: create/edit a chain from registry
 * templates, order the steps, bind per-stage params, save.
 */
import { jsonBody, } from "../json";
import { BUILDER_PATH, } from "./shared";
import type { ComfyuiBuilder, } from "./types";
import { emptyEditor, } from "./types";

let stepCounter = 0;

/**
 * Unique-within-the-client step id (server only requires per-chain uniqueness).
 * @returns {string} a fresh step id.
 */
function nextStepId(): string {
  stepCounter += 1;
  return `step-${Date.now().toString(36,)}-${stepCounter}`;
}

export const builderFormState: Partial<ComfyuiBuilder> & ThisType<ComfyuiBuilder> = {
  ...emptyEditor(),
  showEditor: false,
  savingChain: false,

  openCreate() {
    Object.assign(this, emptyEditor(),);
    this.savingChain = false;
    this.showEditor = true;
  },

  /** @param {string} id @returns {void} */
  openEdit(id: string,) {
    const chain = this.chains.find((candidate,) => candidate.id === id);
    if (!chain) { return; }
    this.editingId = chain.id;
    this.editName = chain.name;
    this.editDescription = chain.description ?? "";
    this.steps = chain.steps.map((step,) => ({ ...step, params: { ...step.params, }, }));
    this.pickedTemplateId = "";
    this.saveError = "";
    this.showEditor = true;
  },

  closeEditor() {
    this.showEditor = false;
  },

  addStep() {
    const template = this.templates.find((candidate,) => candidate.id === this.pickedTemplateId);
    if (!template) { return; }
    const params: Record<string, string | number | boolean> = {};
    for (const param of template.parameters ?? []) {
      const def = param.default;
      if (typeof def === "string" || typeof def === "number" || typeof def === "boolean") {
        params[param.name] = def;
      } else if (def !== undefined && def !== null) {
        params[param.name] = String(def,);
      } else if (param.type === "boolean") {
        params[param.name] = false;
      } else {
        params[param.name] = "";
      }
    }
    this.steps.push({ id: nextStepId(), templateId: template.id, params, },);
  },

  /** @param {number} index @returns {void} */
  removeStep(index: number,) {
    this.steps.splice(index, 1,);
  },

  /**
   * @param {number} index
   * @param {number} delta
   * @returns {void}
   */
  moveStep(index: number, delta: number,) {
    const target = index + delta;
    if (index < 0 || index >= this.steps.length || target < 0 || target >= this.steps.length) {
      return;
    }
    const [step,] = this.steps.splice(index, 1,);
    if (step) { this.steps.splice(target, 0, step,); }
  },

  /**
   * @param {number} index
   * @param {string} name
   * @param {unknown} value
   * @returns {void}
   */
  setStepParam(index: number, name: string, value: unknown,) {
    const step = this.steps[index];
    if (!step) { return; }
    const template = this.templates.find((candidate,) => candidate.id === step.templateId);
    const def = template?.parameters.find((param,) => param.name === name);
    if (def?.type === "number") {
      const num = Number(value,);
      step.params[name] = Number.isFinite(num,) ? num : 0;
      return;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      step.params[name] = value;
      return;
    }
    step.params[name] = value === undefined || value === null ? "" : String(value,);
  },

  /** @returns {Promise<void>} */
  async saveChain() {
    const name = this.editName.trim();
    if (!name) {
      this.saveError = "Name is required";
      return;
    }
    this.savingChain = true;
    this.saveError = "";
    try {
      const body = {
        name,
        description: this.editDescription.trim() || null,
        steps: this.steps,
      };
      const url = this.editingId
        ? `${BUILDER_PATH}/chains/${this.editingId}`
        : `${BUILDER_PATH}/chains`;
      const res = await apiFetch(url, {
        method: this.editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(body,),
      },);
      if (res.ok) {
        showToast("success", "Chain saved",);
        this.showEditor = false;
        await this.loadChains();
        return;
      }
      const data = await res.json().catch(() => null) as { error?: string; message?: string } | null;
      this.saveError = data?.error ?? data?.message ?? "Failed to save chain";
    } catch {
      this.saveError = "Network error saving chain";
    } finally {
      this.savingChain = false;
    }
  },
};
