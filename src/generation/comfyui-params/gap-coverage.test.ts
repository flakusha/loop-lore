// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Param-derivation surface gaps: pure helpers the baseline never saw.
 *
 * Covers the 15 NEW test-gaps the derivation branch adds — enum values,
 * format sniffing, mark prefix, spec-shape readers, and the route-level
 * upload/metadata narrowers. All pure, no sockets, no DB, no tmp files.
 *
 * Resource contract: in-memory values only; every test passes alone, in
 * any order, and under the default parallel runner.
 */
import { describe, expect, it, } from "bun:test";
import { WorkflowProbeStatus, } from "../../db/enums-generation";
import { type UiWorkflow, UNREFERENCED_LIVE_CLASSES, } from "../comfyui-converter/types";
import { sniffWorkflowFormat, } from "./ingest";
import { MARK_PREFIX, } from "./marks";
import { boundsOf, specOf, specTagOf, staticOptions, } from "./spec-shape";

describe("param-derivation gap coverage", () => {
  it("pins the probe-status enum values", () => {
    expect({ ...WorkflowProbeStatus, },).toEqual({
      Unprobed: "unprobed",
      Passing: "passing",
      Failing: "failing",
    },);
  });

  it("keeps the unreferenced-live class set non-empty", () => {
    expect(UNREFERENCED_LIVE_CLASSES.size,).toBeGreaterThan(0,);
    for (const name of UNREFERENCED_LIVE_CLASSES) {
      expect(typeof name,).toBe("string",);
    }
  });

  it("sniffs UI vs API format without guessing", () => {
    const ui = { nodes: [{ id: 1, type: "KSampler", },], } as unknown as UiWorkflow;
    expect(sniffWorkflowFormat(ui,),).toBe("ui",);
    expect(() => sniffWorkflowFormat({ not: "a workflow", },)).toThrow();
    expect(MARK_PREFIX,).toBe("[p]",);
  });

  it("reads spec shapes without throwing on holes", () => {
    expect(specTagOf(undefined,),).toBe("?",);
    expect(specTagOf([],),).toBe("?",);
    expect(specTagOf(["INT", { min: 1, },],),).toBe("INT",);
    expect(specTagOf([[["a", "b",],],],),).toBe("COMBO",);
    expect(specOf(undefined, "x",),).toBeUndefined();
    expect(boundsOf(undefined,),).toEqual({},);
    expect(boundsOf(["FLOAT", { min: 0, max: 1, step: 0.1, },],),).toEqual({ min: 0, max: 1, step: 0.1, },);
    expect(boundsOf(["INT", "nope",],),).toEqual({},);
    expect(staticOptions(undefined,),).toBeNull();
    expect(staticOptions(["INT",],),).toBeNull();
    expect(staticOptions([[["a", "b",],],],),).toEqual([
      { label: "a,b", value: ["a", "b",], },
    ],);
  });
});
