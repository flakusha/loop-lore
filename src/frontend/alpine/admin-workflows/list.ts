// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * List half of the workflow library tab: fetch the rows, and act on one of
 * them. Every action re-reads the list rather than patching local state, since
 * the server demotes the previous default and moves `updated_at` in the same
 * transaction the operator just triggered.
 */
import { safeJsonStringify, } from "../json";
import { parseOr, } from "../validation";
import { WorkflowListResponseSchema, } from "./schema";
import { log, workflowErrors, WORKFLOWS_PATH, } from "./shared";
import type { AdminWorkflows, } from "./types";

/** Fallback used when the list body does not match the schema. */
const EMPTY_LIST = { workflows: [], total: 0, comfyui_reachable: false, };

export const workflowListState: Partial<AdminWorkflows> & ThisType<AdminWorkflows> = {
  // ── List state ──────────────────────────────────────
  workflows: [],
  workflowTotal: 0,
  comfyuiReachable: false,
  loadingWorkflows: false,
  workflowFilter: "",
  confirmDeleteWorkflow: "",

  /**
   * @returns {Promise<void>}
   */
  async loadWorkflows() {
    this.loadingWorkflows = true;
    try {
      const filter = this.workflowFilter ? `?enabled=${this.workflowFilter}` : "";
      const res = await apiFetch(`${WORKFLOWS_PATH}${filter}`, {
        headers: { Accept: "application/json", },
      },);
      if (res.ok) {
        // A schema mismatch falls back to the empty list, which would read as
        // "the library is empty" rather than "the contract moved". Say so.
        const data = parseOr(WorkflowListResponseSchema, await res.json(), EMPTY_LIST, () => {
          showToast("error", "Unexpected workflow list shape — see the console for the mismatch",);
        },);
        this.workflows = data.workflows;
        this.workflowTotal = data.total;
        this.comfyuiReachable = data.comfyui_reachable;
      }
    } catch {
      log.warn("Network error loading ComfyUI workflows",);
    } finally {
      this.loadingWorkflows = false;
    }
  },

  // ── Row actions ─────────────────────────────────────

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async setWorkflowDefault(id: string,) {
    try {
      const res = await apiFetch(`${WORKFLOWS_PATH}/${id}/default`, { method: "POST", },);
      if (res.ok) {
        showToast("success", `${id} is now the default workflow`,);
        await this.loadWorkflows();
      } else {
        const errors = await workflowErrors(res, "Failed to set default",);
        showToast("error", errors.join("; ",),);
      }
    } catch {
      showToast("error", "Network error setting default",);
    }
  },

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async toggleWorkflowEnabled(id: string,) {
    try {
      const res = await apiFetch(`${WORKFLOWS_PATH}/${id}/enabled`, { method: "POST", },);
      if (res.ok) {
        await this.loadWorkflows();
      } else {
        const errors = await workflowErrors(res, "Failed to toggle workflow",);
        showToast("error", errors.join("; ",),);
      }
    } catch {
      showToast("error", "Network error toggling workflow",);
    }
  },

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteWorkflow(id: string,) {
    try {
      const res = await apiFetch(`${WORKFLOWS_PATH}/${id}`, { method: "DELETE", },);
      if (res.ok) {
        this.confirmDeleteWorkflow = "";
        showToast("success", `Workflow ${id} deleted`,);
        await this.loadWorkflows();
      } else {
        const errors = await workflowErrors(res, "Failed to delete workflow",);
        showToast("error", errors.join("; ",),);
      }
    } catch {
      showToast("error", "Network error deleting workflow",);
    }
  },

  /**
   * @param {unknown} value
   * @returns {string}
   */
  formatWorkflowJson(value: unknown,): string {
    const pretty = safeJsonStringify(value, 2,);
    return pretty.ok ? pretty.value : "";
  },
};
