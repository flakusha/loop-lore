// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Real-workflow coverage: the v-0010 Director graph and the i-0037
 * round-trip control, converted offline against the pinned fixture.
 *
 * Parallel-safety contract: every `it` owns its conversion. The converter
 * is a pure function over parsed JSON, so each test re-parses its fixture
 * files and converts locally — no shared `graph`/`report` across tests,
 * no shared mutable state, no tmp resources, no ordering dependence. File
 * reads are read-only (fixtures are never written); JSON.parse per test
 * keeps the parsed inputs unshared too.
 */
import { describe, expect, it, } from "bun:test";
import { readFileSync, } from "node:fs";
import { validateWorkflowPayload, } from "../workflow-library/validate";
import { findDeadNodes, } from "../workflow-loader/workflow-validation";
import { convertWorkflow, } from "./index";
import type { ApiGraph, ConversionResult, ObjectInfoSnapshot, UiWorkflow, } from "./types";

const DIR = "src/generation/comfyui-converter/fixtures";

function load(name: string,): unknown {
  return JSON.parse(readFileSync(`${DIR}/${name}`, "utf8",),);
}

function snapshot(): ObjectInfoSnapshot {
  return load("object-info.json",) as ObjectInfoSnapshot;
}

/** Fresh per-test conversion of the v-0010 Director fixture. */
function convertDirector(): ConversionResult {
  const workflow = load("v-0010-dasiwa-minimax.json",) as UiWorkflow;
  return convertWorkflow(workflow, snapshot(),);
}

/** Fresh per-test conversion of the i-0037 round-trip control. */
function convertControl(): ConversionResult {
  const workflow = load("i-0037-moss-edit-s.json",) as UiWorkflow;
  return convertWorkflow(workflow, snapshot(),);
}

describe("v-0010 Director workflow", () => {
  it("flattens to a submittable graph with colon-path ids", () => {
    const { graph, report, } = convertDirector();
    expect(report.nodeCount,).toBe(42,);
    expect(report.bypassedDropped,).toEqual([],);
    expect(report.unresolvedInputs,).toEqual([],);
    for (const id of Object.keys(graph,)) {
      expect(id,).not.toContain("undefined",);
    }

    expect(graph["1512:2598"],).toBeDefined();
    expect(graph["1512:2701"],).toBeDefined();
    expect(graph["1512:2738"],).toBeDefined();
  });

  it("excludes muted nodes and prunes their consumers", () => {
    const { graph, report, } = convertDirector();
    expect(report.mutedDropped,).toEqual([
      "2760",
      "2753",
      "1512:2079",
      "1512:2537",
      "1512:2714",
      "1512:2715",
      "1512:2546",
      "1512:2717",
      "1512:2532",
      "1512:2740",
      "1512:2741",
      "1512:2528",
      "1512:2810",
      "1512:2814",
      "1512:2816",
    ],);

    expect(graph["2760"],).toBeUndefined();
    expect(graph["1512:2079"],).toBeUndefined();
    expect(report.prunedDangling,).toContainEqual({ node: "2766", input: "target_01", from: "2760", },);
  });

  it("routes boundary links and promoted overrides", () => {
    const { graph, } = convertDirector();
    expect(graph["1512:2598"]?.inputs["sampler_name"],).toBe("euler_ancestral",);
    expect(graph["1512:2701"]?.inputs["guide"],).toEqual(["2730", 0,],);
    expect(graph["1512:2738"]?.inputs[""],).toEqual(["2739", 1,],);
    expect(graph["2678"]?.inputs["model"],).toEqual(["2730", 5,],);
  });

  it("preserves hidden JSON widgets and drops frontend-only state", () => {
    const { graph, } = convertDirector();
    const director = graph["2730"]?.inputs ?? {};
    expect(typeof director["timeline_data"],).toBe("string",);
    expect(typeof director["builder_state"],).toBe("string",);
    expect("minimax_h3_director_ui" in director,).toBe(false,);
    const seeds = graph["2739"]?.inputs ?? {};
    expect("dasiwa_seed_control_ui" in seeds,).toBe(false,);
    expect(typeof seeds["seed_value"],).toBe("number",);
  });

  it("emits pack identity for downstream presence checks", () => {
    const { report, } = convertDirector();
    expect(report.packIdentity,).toHaveLength(26,);
    expect(report.notesSkipped,).toHaveLength(11,);
  });

  it("exposes the converted dead set for the validator's converted mode", () => {
    const { graph, report, } = convertDirector();
    expect([...report.unreferencedLive,].toSorted(),).toEqual(findDeadNodes(graph,).toSorted(),);
    const payload = {
      body: graph,
      category: "txt2img",
      parameters: [],
      requiredNodes: [],
    };

    expect(validateWorkflowPayload(payload,).ok,).toBe(false,);
    expect(
      validateWorkflowPayload(payload, { unreferencedLive: report.unreferencedLive, },).ok,
    ).toBe(true,);
  });
});

describe("i-0037 round-trip control", () => {
  it("converts identically to the hand-derived API form", () => {
    const { graph, } = convertControl();
    const expected = load("i-0037-moss-edit-s.expected.json",) as ApiGraph;
    expect(graph,).toEqual(expected,);
  });

  it("reports the single unattested widget, nothing else", () => {
    const { report, } = convertControl();
    expect(report.nodeCount,).toBe(15,);
    expect(report.mutedDropped,).toEqual([],);
    expect(report.bypassedDropped,).toEqual([],);
    expect(report.notesSkipped,).toHaveLength(3,);
    expect(report.unresolvedInputs,).toEqual([{ node: "5", input: "widgets[1]", },],);
    expect(report.prunedDangling,).toEqual([],);
  });
});
