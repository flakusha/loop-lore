// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Queries and projections for the admin ComfyUI workflow surface.
 *
 * Every query here is scoped to `modality = 'workflow'`, which is what keeps
 * this surface structurally incapable of reading or writing an LLM or image
 * template row: the scope is in the one place every handler builds its query.
 */
import type { Kysely, } from "kysely";
import type { TemplateDetailLevel, } from "../../db/enums-generation";
import type { DB, } from "../../db/schema";
import type { ComfyUINodeInfo, } from "../../generation/providers/comfyui";
import type { WorkflowRow, } from "../../generation/workflow-library";
import { missingRequiredNodes, rowToPayload, } from "../../generation/workflow-library";
import { jsonParseOr, } from "../../utils";

/** One row as the admin list serves it. */
export interface WorkflowSummary {
  id: string;
  name: string;
  description: string | null;
  model_family: string | null;
  is_default: string;
  enabled: string;
  min_vram: number | null;
  lora_slots: unknown;
  node_count: number;
  category: string | null;
  /** Declared requiredNodes the live server lacks; null when it is unreachable. */
  missing_nodes: string[] | null;
  created_at: string;
  updated_at: string;
}

/** A full `prompt_templates` row: the workflow projection plus the columns the
 * admin surface also echoes back (detail level, timestamps). */
export type WorkflowDbRow = WorkflowRow & {
  detail_level: TemplateDetailLevel;
  created_at: string;
  updated_at: string;
};

/**
 * Every workflow row, ordered for display.
 * @param database - Kysely handle
 * @param enabled - Optional `enabled`/`disabled` filter
 */
export async function listWorkflowRows(
  database: Kysely<DB>,
  enabled?: string,
): Promise<WorkflowDbRow[]> {
  let query = database.selectFrom("prompt_templates",).selectAll().where("modality", "=", "workflow",);
  if (enabled === "enabled" || enabled === "disabled") { query = query.where("enabled", "=", enabled,); }
  return await query.orderBy("name", "asc",).execute();
}

/**
 * One workflow row, or null when the id is unknown or another modality's.
 * @param database - Kysely handle
 * @param id - Template id
 */
export async function getWorkflowRow(
  database: Kysely<DB>,
  id: string,
): Promise<WorkflowDbRow | null> {
  const row = await database.selectFrom("prompt_templates",).selectAll()
    .where("id", "=", id,).where("modality", "=", "workflow",).executeTakeFirst();
  return row ?? null;
}

/**
 * Project a row into the list shape, reading the graph for the node count and
 * category and probing the live server for the required nodes it lacks.
 * @param row - Stored workflow row
 * @param installed - Live node info, or null when ComfyUI is unreachable
 */
export function toSummary(row: WorkflowDbRow, installed: ComfyUINodeInfo[] | null,): WorkflowSummary {
  const payload = rowToPayload(row,);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    model_family: row.model_family,
    is_default: row.is_default,
    enabled: row.enabled,
    min_vram: row.min_vram,
    lora_slots: row.lora_slots === null ? null : jsonParseOr<unknown>(row.lora_slots, null,),
    node_count: payload ? Object.keys(payload.body,).length : 0,
    category: payload?.category ?? null,
    missing_nodes: installed === null ? null : missingRequiredNodes(row, installed,),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
