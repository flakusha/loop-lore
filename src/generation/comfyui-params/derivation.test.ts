// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fixture round-trip: v-0010 with a marked Settings instance derives a
 * typed parameter map whose substitution round-trips through
 * `buildWorkflowGraph`.
 *
 * The committed v-0010 fixture carries no `[p]` marks (the convention is
 * new), so the test marks the Settings subgraph instance in memory — the
 * fixture file itself is never written.
 */
import { describe, expect, it, } from "bun:test";
import { readFileSync, } from "node:fs";
import { convertWorkflow, } from "../comfyui-converter/index";
import type { ObjectInfoSnapshot, UiWorkflow, } from "../comfyui-converter/types";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import type { WorkflowPayload, } from "../template-types";
import { buildWorkflowGraph, } from "../workflow-library/row";
import { collectPlaceholders, } from "../workflow-substitutor";
import { deriveParameters, } from "./derive";
import { injectPlaceholders, resolveBindings, } from "./inject";
import { collectMarked, } from "./marks";

const DIR = "src/generation/comfyui-converter/fixtures";

function load(name: string,): unknown {
  return JSON.parse(readFileSync(`${DIR}/${name}`, "utf8",),);
}

describe("v-0010 marked Settings derivation", () => {
  it("derives typed params and round-trips through buildWorkflowGraph", () => {
    const raw = load("v-0010-dasiwa-minimax.json",) as UiWorkflow;
    const workflow: UiWorkflow = {
      ...raw,
      nodes: (raw.nodes ?? []).map((node,) => node.id === 1512 ? { ...node, title: "[p] Settings", } : node),
    };

    const snapshot = load("object-info.json",) as ObjectInfoSnapshot;
    const converted = convertWorkflow(workflow, snapshot,).graph;
    const marked = collectMarked({ workflow, },);
    expect(marked.length,).toBeGreaterThan(0,);
    const derived = deriveParameters({ workflow, converted, workflowId: "v-0010", snapshot, },);
    expect(derived.parameters.length,).toBeGreaterThan(0,);
    const types = new Set(derived.parameters.map((parameter,) => parameter.type),);
    expect(types.has("number",),).toBe(true,);
    expect(types.has("boolean",),).toBe(true,);
    expect(types.has("string",),).toBe(true,);
    const nameOf = (mark: (typeof marked)[number],): string =>
      derived.parameters.find((parameter,) => parameter.label === mark.label)?.name ?? mark.inputName;

    const bindings = resolveBindings({ graph: converted, marked, nameOf, },);
    expect(bindings.length,).toBeGreaterThan(0,);
    const injected = injectPlaceholders({ graph: converted, bindings, },);
    const payload: WorkflowPayload = {
      body: injected as unknown as ComfyUIWorkflow,
      category: "txt2img",
      parameters: derived.parameters,
      requiredNodes: [],
    };

    const params: Record<string, unknown> = {};
    for (const parameter of derived.parameters) {
      params[parameter.name] = parameter.default;
    }

    const built = buildWorkflowGraph(payload, params,);
    expect(collectPlaceholders(built,).size,).toBe(0,);
  });
});
