// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Editor half of the workflow library tab: open a blank or existing row, and
 * save it back.
 *
 * The request body puts the graph under `body`, which the route's
 * `uploadedGraph` reads as a wrapper key, and omits the JSON fields the
 * operator left blank so an edit that never touched them keeps what is stored
 * rather than clearing it.
 */
import { jsonBody, safeJsonStringify, } from "../json";
import { parseOr, } from "../validation";
import { WorkflowDetailResponseSchema, } from "./schema";
import { readJsonField, workflowErrors, WORKFLOWS_PATH, } from "./shared";
import { emptyWorkflowForm, } from "./types";
import type { AdminWorkflows, WorkflowDetail, WorkflowForm, } from "./types";

/**
 * Pretty-print a JSON field for the editor; unprintable values stay empty.
 * @param value - Parsed JSON value
 * @returns Indented JSON, or an empty string when the value cannot be printed
 */
function pretty(value: unknown,): string {
  const result = safeJsonStringify(value, 2,);
  return result.ok ? result.value : "";
}

/**
 * A stored row projected onto the editor fields.
 * @param row - Detail-endpoint row
 * @returns Editor state prefilled from the stored payload
 */
function formFromRow(row: NonNullable<WorkflowDetail>,): WorkflowForm {
  const payload = row.payload;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    model_family: row.model_family ?? "",
    min_vram: row.min_vram === null ? "" : String(row.min_vram,),
    category: payload?.category ?? "txt2img",
    requiredNodes: (payload?.requiredNodes ?? []).join(", ",),
    graph: payload ? pretty(payload.body,) : "",
    parametersJson: payload?.parameters?.length ? pretty(payload.parameters,) : "",
    loraSlotsJson: payload?.loraSlots?.length ? pretty(payload.loraSlots,) : "",
  };
}

/**
 * The create/update request body for the editor state.
 *
 * Blank optional fields are left out entirely: the update path reads a missing
 * key as "keep what is stored", so editing a row's name never clears its
 * declared parameters.
 * @param form - Editor state
 * @param parsed - Already-parsed graph and optional JSON fields
 * @param parsed.graph - The API-format graph, sent under the `body` wrapper key
 * @param parsed.parameters - Declared parameters, omitted when unset
 * @param parsed.loraSlots - Declared LoRA slots, omitted when unset
 * @returns The create/update request body
 */
function requestBody(
  form: WorkflowForm,
  parsed: { graph: object; parameters: unknown; loraSlots: unknown },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: form.name.trim(),
    description: form.description.trim(),
    model_family: form.model_family.trim(),
    category: form.category,
    requiredNodes: form.requiredNodes.split(",",).map((node,) => node.trim()).filter((node,) => node.length > 0),
    body: parsed.graph,
  };

  const minVram = Number(form.min_vram.trim(),);
  if (form.min_vram.trim() !== "" && Number.isFinite(minVram,)) { body.min_vram = minVram; }
  if (parsed.parameters !== undefined) { body.parameters = parsed.parameters; }
  if (parsed.loraSlots !== undefined) { body.loraSlots = parsed.loraSlots; }
  return body;
}

/**
 * The pasted ComfyUI graph, or null after recording why it was rejected.
 * @param text - Raw textarea contents
 * @param errors - Collected client-side errors
 * @returns The parsed graph, or null after pushing the reason onto `errors`
 */
function parseGraphField(text: string, errors: string[],): object | null {
  if (!text.trim()) {
    errors.push("Graph is required",);
    return null;
  }

  const reported = errors.length;
  const value = readJsonField(text, "Graph", errors,);
  if (errors.length > reported) { return null; }
  if (typeof value !== "object" || value === null || Array.isArray(value,)) {
    errors.push("Graph must be a JSON object of node id to node",);
    return null;
  }

  return value;
}

/**
 * One operator-typed JSON array field, or undefined for blank/unparseable.
 *
 * `buildWorkflowPayload` coerces a non-array to `[]` and drops a non-array
 * `loraSlots` outright, so a mistyped `{...}` would save as "declared nothing"
 * with no complaint from anyone. Reject it here instead.
 * @param text - Raw textarea contents
 * @param label - Field name used in the error message
 * @param errors - Collected client-side errors
 * @returns The parsed array, or undefined after pushing the reason
 */
function readJsonArrayField(text: string, label: string, errors: string[],): unknown[] | undefined {
  const value = readJsonField(text, label, errors,);
  if (value === undefined) { return undefined; }
  if (!Array.isArray(value,)) {
    errors.push(`${label} must be a JSON array`,);
    return undefined;
  }

  return value;
}

export const workflowFormState: Partial<AdminWorkflows> & ThisType<AdminWorkflows> = {
  // ── Editor state ────────────────────────────────────
  showWorkflowForm: false,
  workflowForm: emptyWorkflowForm(),
  workflowFormErrors: [],
  savingWorkflow: false,

  /**
   * @returns {void}
   */
  openWorkflowCreate() {
    this.workflowForm = emptyWorkflowForm();
    this.workflowFormErrors = [];
    this.showWorkflowForm = true;
  },

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async openWorkflowEdit(id: string,) {
    this.workflowFormErrors = [];
    this.showWorkflowForm = true;
    try {
      const res = await apiFetch(`${WORKFLOWS_PATH}/${id}`, {
        headers: { Accept: "application/json", },
      },);

      if (!res.ok) {
        this.workflowFormErrors = await workflowErrors(res, `Workflow ${id} not found`,);
        return;
      }

      const row = parseOr(WorkflowDetailResponseSchema, await res.json(), null,);
      this.workflowForm = row ? formFromRow(row,) : emptyWorkflowForm();
      if (!row) { this.workflowFormErrors = ["Unreadable workflow response",]; }
    } catch {
      this.workflowFormErrors = ["Network error loading workflow",];
    }
  },

  /**
   * @returns {void}
   */
  closeWorkflowForm() {
    this.showWorkflowForm = false;
    this.workflowFormErrors = [];
  },

  /**
   * @returns {Promise<void>}
   */
  async saveWorkflow() {
    const form = this.workflowForm;
    const errors: string[] = [];
    if (!form.name.trim()) { errors.push("Name is required",); }
    const graph = parseGraphField(form.graph, errors,);
    const parameters = readJsonArrayField(form.parametersJson, "Parameters", errors,);
    const loraSlots = readJsonArrayField(form.loraSlotsJson, "LoRA slots", errors,);
    if (errors.length > 0 || graph === null) {
      this.workflowFormErrors = errors;
      return;
    }

    const editing = form.id !== "";
    this.savingWorkflow = true;
    this.workflowFormErrors = [];
    try {
      const res = await apiFetch(editing ? `${WORKFLOWS_PATH}/${form.id}` : WORKFLOWS_PATH, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(requestBody(form, { graph, parameters, loraSlots, },),),
      },);

      if (!res.ok) {
        this.workflowFormErrors = await workflowErrors(res, "Workflow rejected",);
        return;
      }

      this.closeWorkflowForm();
      showToast("success", editing ? "Workflow updated" : "Workflow created",);
      await this.loadWorkflows();
    } catch {
      this.workflowFormErrors = ["Network error saving workflow",];
    } finally {
      this.savingWorkflow = false;
    }
  },
};
