// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * State for the admin ComfyUI workflow library tab.
 *
 * The create/edit form is a textarea over the raw API-format graph plus the
 * library metadata, because that is what the ingest gate reads; the library
 * is edited by people who have a ComfyUI export open in another window.
 */
import type { Static, } from "@sinclair/typebox";
import type { WorkflowDetailResponseSchema, WorkflowSummarySchema, } from "./schema";

/** One library row, as the list endpoint serves it. */
export type WorkflowSummary = Static<typeof WorkflowSummarySchema>;

/** A library row plus the stored payload, as the detail endpoint serves it. */
export type WorkflowDetail = Static<typeof WorkflowDetailResponseSchema>;

/** The `enabled` values the `prompt_templates.enabled` column holds. */
export type WorkflowEnabled = "enabled" | "disabled";

/** The `is_default` values the `prompt_templates.is_default` column holds. */
export type WorkflowDefault = "default" | "not_default";

/**
 * Editor state for one row. `id` is empty while creating; `graph` holds the
 * pasted ComfyUI export and the `*Json` fields are raw JSON the operator
 * types, so a malformed one is reported here rather than silently dropped.
 */
export interface WorkflowForm {
  id: string;
  name: string;
  description: string;
  model_family: string;
  min_vram: string;
  category: string;
  requiredNodes: string;
  graph: string;
  parametersJson: string;
  loraSlotsJson: string;
}

/**
 * A blank editor. `category` defaults the way `buildWorkflowPayload` does.
 * @returns Editor state with every field empty
 */
export function emptyWorkflowForm(): WorkflowForm {
  return {
    id: "",
    name: "",
    description: "",
    model_family: "",
    min_vram: "",
    category: "txt2img",
    requiredNodes: "",
    graph: "",
    parametersJson: "",
    loraSlotsJson: "",
  };
}

/** The whole tab: list state, editor state, and the actions over both. */
export interface AdminWorkflows {
  // ── List state ──────────────────────────────────────
  workflows: WorkflowSummary[];
  workflowTotal: number;
  comfyuiReachable: boolean;
  loadingWorkflows: boolean;
  workflowFilter: "" | WorkflowEnabled;
  confirmDeleteWorkflow: string;

  // ── Editor state ────────────────────────────────────
  showWorkflowForm: boolean;
  workflowForm: WorkflowForm;
  workflowFormErrors: string[];
  savingWorkflow: boolean;

  // ── Actions ─────────────────────────────────────────
  loadWorkflows(): Promise<void>;
  openWorkflowCreate(): void;
  openWorkflowEdit(id: string,): Promise<void>;
  closeWorkflowForm(): void;
  saveWorkflow(): Promise<void>;
  setWorkflowDefault(id: string,): Promise<void>;
  toggleWorkflowEnabled(id: string,): Promise<void>;
  deleteWorkflow(id: string,): Promise<void>;
  formatWorkflowJson(value: unknown,): string;
}
