// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stubbed acceptance probe: v-0010 fixture round-trip plus uncertain edges.
 *
 * The fixture carries no `[p]` marks, so the test marks the Settings
 * subgraph instance in memory — the fixture file is never written. The
 * v-0010 family emits video through DaSiWa publish/combine nodes.
 */
import { describe, expect, it, } from "bun:test";
import { readFileSync, } from "node:fs";
import type { TemplateParameter, } from "../../image-edit/types";
import { convertWorkflow, } from "../comfyui-converter/index";
import type { ApiGraph, ObjectInfoSnapshot, UiWorkflow, } from "../comfyui-converter/types";
import { deriveParameters, } from "./derive";
import { ParameterDerivationError, } from "./errors";
import { type ProbeOptions, runAcceptanceProbe, } from "./probe";
import type { DeriveResult, } from "./types";

const DIR = "src/generation/comfyui-converter/fixtures";

function load(name: string,): unknown {
  return JSON.parse(readFileSync(`${DIR}/${name}`, "utf8",),);
}

function derivedFixture(): { graph: ApiGraph; derived: DeriveResult; snapshot: ObjectInfoSnapshot } {
  const raw = load("v-0010-dasiwa-minimax.json",) as UiWorkflow;
  const workflow: UiWorkflow = {
    ...raw,
    nodes: (raw.nodes ?? []).map((node,) => node.id === 1512 ? { ...node, title: "[p] Settings", } : node),
  };

  const snapshot = load("object-info.json",) as ObjectInfoSnapshot;
  const graph = convertWorkflow(workflow, snapshot,).graph;
  const derived = deriveParameters({ workflow, converted: graph, workflowId: "v-0010", snapshot, },);
  return { graph, derived, snapshot, };
}

function optionsOf(
  partial: Partial<ProbeOptions> & Pick<ProbeOptions, "graph" | "derived" | "snapshot">,
): ProbeOptions {
  return { workflowId: "v-0010", expectedOutputKind: "video", ...partial, };
}

describe("runAcceptanceProbe", () => {
  it("passes the v-0010 derived row end-to-end", () => {
    const { graph, derived, snapshot, } = derivedFixture();
    expect(derived.parameters.length,).toBeGreaterThan(0,);
    const result = runAcceptanceProbe(optionsOf({ graph, derived, snapshot, },),);
    expect(result.errors,).toEqual([],);
    expect(result.ok,).toBe(true,);
    expect(result.bindings,).toBeGreaterThanOrEqual(result.parameters,);
  });

  it("throws on a derived parameter with no binding", () => {
    const { graph, derived, snapshot, } = derivedFixture();
    const extra: TemplateParameter = { name: "ghost", type: "string", label: "Ghost", default: "", };
    const result = { parameters: [...derived.parameters, extra,], overrides: derived.overrides, };
    expect(() => runAcceptanceProbe(optionsOf({ graph, derived: result, snapshot, },),))
      .toThrow(ParameterDerivationError,);
  });

  it("fails on a missing node class", () => {
    const { graph, derived, snapshot, } = derivedFixture();
    const [id, node,] = Object.entries(graph,)[0]!;
    const tampered = { ...graph, [id]: { ...node, class_type: "NoSuchNode", }, };
    const result = runAcceptanceProbe(optionsOf({ graph: tampered, derived, snapshot, },),);
    expect(result.ok,).toBe(false,);
    expect(result.errors.some((error,) => error.includes("missing node classes",)),).toBe(true,);
  });

  it("fails on a dangling link", () => {
    const { graph, derived, snapshot, } = derivedFixture();
    const [id, node,] = Object.entries(graph,).find(([, candidate,],) =>
      Object.values(candidate.inputs,).some((value,) => Array.isArray(value,))
    )!;

    const [input, value,] = Object.entries(node.inputs,).find(([, candidate,],) => Array.isArray(candidate,))!;
    const tampered = {
      ...graph,
      [id]: { ...node, inputs: { ...node.inputs, [input]: ["gone", (value as unknown[])[1],], }, },
    };

    const result = runAcceptanceProbe(optionsOf({ graph: tampered, derived, snapshot, },),);
    expect(result.ok,).toBe(false,);
    expect(result.errors.some((error,) => error.includes("dangling links",)),).toBe(true,);
  });

  it("fails on the wrong output kind", () => {
    const { graph, derived, snapshot, } = derivedFixture();
    const result = runAcceptanceProbe(optionsOf({ graph, derived, snapshot, expectedOutputKind: "audio", },),);
    expect(result.ok,).toBe(false,);
    expect(result.errors.some((error,) => error.includes("wrong output kind",)),).toBe(true,);
  });

  it("fails on a placeholder no parameter resolves", () => {
    const { graph, derived, snapshot, } = derivedFixture();
    const [id, node,] = Object.entries(graph,)[0]!;
    const [input, value,] = Object.entries(node.inputs,).find(([, candidate,],) => typeof candidate === "string") ??
      ["probe_note", "plain",];

    const tampered = {
      ...graph,
      [id]: { ...node, inputs: { ...node.inputs, [input]: `${String(value,)} {{ghost}}`, }, },
    };

    const result = runAcceptanceProbe(optionsOf({ graph: tampered, derived, snapshot, },),);
    expect(result.ok,).toBe(false,);
    expect(result.errors.some((error,) => error.includes("unresolved placeholders",) && error.includes("ghost",)),)
      .toBe(true,);
  });
});
