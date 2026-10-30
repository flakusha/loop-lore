// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The parameters a seeded workflow library row declares.
 *
 * A row that declares no parameters can never be built: `buildWorkflowGraph`
 * rejects a graph whose `{{placeholders}}` all go unresolved, and the seeded
 * rows used to be written with an empty parameter list. The parameters are
 * therefore derived from the graph's own placeholders, and the metadata comes
 * from the builtin template with the same id so the two cannot drift apart.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { builtinTemplates, } from "../../image-edit/templates/builtin";
import type { TemplateParameter, } from "../../image-edit/types";
import { jsonParseOr, jsonStringifyOr, } from "../../utils";
import { toDate, } from "../../utils/date";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import type { WorkflowPayload, } from "../template-types";
import { collectPlaceholders, } from "../workflow-substitutor";
import type { ValidateWorkflowOptions, } from "./validate";
import { validateWorkflowPayload, } from "./validate";

/**
 * The parameters a seeded graph needs: one per `{{placeholder}}` in its body.
 *
 * The metadata comes from the builtin template with the same id, so the
 * seeded row and the builtin declare the same parameter (same type, label,
 * default and bounds). A placeholder the builtin does not declare gets a
 * plain string parameter.
 * @param id - Workflow id (the file's basename)
 * @param body - The workflow graph
 * @returns {TemplateParameter[]}
 */
export function deriveParameters(id: string, body: ComfyUIWorkflow,): TemplateParameter[] {
  const placeholders = collectPlaceholders(body,);
  const builtin = builtinTemplates.find((template,) => template.id === id);
  const parameters: TemplateParameter[] = [];
  const declared = new Set<string>();

  for (const parameter of builtin?.parameters ?? []) {
    if (!placeholders.has(parameter.name,)) { continue; }
    parameters.push(parameter,);
    declared.add(parameter.name,);
  }

  for (const name of [...placeholders,].toSorted()) {
    if (declared.has(name,)) { continue; }
    parameters.push({ name, type: "string", label: name, default: "", },);
  }

  return parameters;
}

/**
 * Derive the parameters a stored row is missing and write them back.
 *
 * Only the broken shape is repaired: no declared parameters while the body
 * still carries `{{placeholders}}`. Such a row can never be built, so the
 * parameters are derived from the row's OWN body — an operator's edit to the
 * body is kept. A row that already declares parameters is left alone.
 * @param database - Kysely handle
 * @param row - The stored row's payload
 * @param id - Workflow id
 * @param options - Converted-mode exemption ids for probe-ingested rows
 * @returns {Promise<boolean>} True when the row was repaired
 */
export async function repairParameters(
  database: Kysely<DB>,
  row: { payload: string },
  id: string,
  options: ValidateWorkflowOptions = {},
): Promise<boolean> {
  const parsed = jsonParseOr<unknown>(row.payload, null,);
  if (!parsed || typeof parsed !== "object") { return false; }

  const payload = parsed as WorkflowPayload;
  if (!payload.body || !Array.isArray(payload.parameters,)) { return false; }
  if (payload.parameters.length > 0) { return false; }

  const placeholders = collectPlaceholders(payload.body,);
  if (placeholders.size === 0) { return false; }

  const parameters = deriveParameters(id, payload.body,);
  if (parameters.length === 0) { return false; }

  const validated = validateWorkflowPayload({ ...payload, parameters, }, options,);
  if (!validated.ok) { return false; }

  await database
    .updateTable("prompt_templates",)
    .set({ payload: jsonStringifyOr(validated.payload,), updated_at: toDate().toISOString(), },)
    .where("id", "=", id,)
    .execute();

  return true;
}
