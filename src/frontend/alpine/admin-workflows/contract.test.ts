// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pins the frontend response schemas to what the route module actually emits.
 *
 * A hand-written fixture in the other admin tests can only prove the UI works
 * against the shape it was written against; it cannot catch the route changing
 * a field. This runs the real `toSummary` projection, so renaming, adding, or
 * dropping a column fails here instead of silently rendering an empty library
 * (`parseOr` falls back to an empty list on a mismatch).
 */
import { describe, expect, test, } from "bun:test";
import { toSummary, type WorkflowDbRow, } from "../../../routes/admin-comfyui-workflows/rows";
import { getChecker, } from "../validation";
import { WorkflowDetailResponseSchema, WorkflowListResponseSchema, } from "./schema";

const payload = {
  body: { "3": { class_type: "KSampler", inputs: {}, }, },
  category: "txt2img",
  parameters: [],
  requiredNodes: ["KSampler",],
};

const row: WorkflowDbRow = {
  id: "wf1",
  name: "SDXL portrait",
  description: null,
  model_family: "sdxl",
  payload: JSON.stringify(payload,),
  is_default: "not_default",
  enabled: "enabled",
  lora_slots: null,
  min_vram: 12,
  created_at: "2026-09-27T00:00:00.000Z",
  updated_at: "2026-09-27T00:00:00.000Z",
  detail_level: "balanced",
};

describe("workflow wire schemas vs the route projection", () => {
  test("accepts the list body toSummary produces, ComfyUI offline", () => {
    const summary = toSummary(row, null,);
    expect(
      getChecker(WorkflowListResponseSchema,).Check({
        workflows: [summary,],
        total: 1,
        comfyui_reachable: false,
      },),
    ).toBe(true,);
  });

  test("reports declared nodes as missing when the live server has none", () => {
    const summary = toSummary(row, [],);
    // Reachable-but-empty is the "every declared node is absent" case; the
    // unreachable case is null, which the list renders differently.
    expect(summary.missing_nodes,).toEqual(["KSampler",],);
    expect(
      getChecker(WorkflowListResponseSchema,).Check({
        workflows: [summary,],
        total: 1,
        comfyui_reachable: true,
      },),
    ).toBe(true,);
  });

  test("accepts the detail body with a stored payload", () => {
    const summary = toSummary(row, null,);
    expect(getChecker(WorkflowDetailResponseSchema,).Check({ ...summary, payload, },),).toBe(true,);
  });

  test("accepts the detail body when the stored payload is unreadable", () => {
    const summary = toSummary(row, null,);
    expect(getChecker(WorkflowDetailResponseSchema,).Check({ ...summary, payload: null, },),).toBe(true,);
  });
});
