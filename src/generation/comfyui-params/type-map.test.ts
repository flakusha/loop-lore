// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Parameter derivation tests: type-mapping boundaries, idempotency, and
 * sidecar unknown-target errors. Synthetic inline graphs only; the
 * fixture round-trip lives in derivation.test.ts.
 */
import { describe, expect, it, } from "bun:test";
import { convertWorkflow, } from "../comfyui-converter/index";
import type { ObjectInfoSnapshot, UiWorkflow, } from "../comfyui-converter/types";
import { buildWorkflowGraph, } from "../workflow-library/row";
import { collectPlaceholders, substituteWorkflow, } from "../workflow-substitutor";

import { deriveParameters, } from "./derive";
import { ParameterDerivationError, } from "./errors";
import { injectPlaceholders, } from "./inject";
import { collectMarked, } from "./marks";
import { applySidecar, } from "./sidecar";
import { mapSpecToParam, } from "./type-map";

const SNAPSHOT: ObjectInfoSnapshot = {
  PromptBox: {
    input: {
      required: {
        text: ["STRING",],
        strength: ["FLOAT", { min: 0, max: 1, step: 0.01, },],
        count: ["INT", { min: 1, max: 64, },],
        flag: ["BOOLEAN",],
        preset: [["fast", "quality",],],
        ckpt: ["COMBO",],
      },
    },
    input_order: { required: ["text", "strength", "count", "flag", "preset", "ckpt",], },
  },
  PhotoLoader: {
    input: { required: { image: ["COMBO",], }, },
    input_order: { required: ["image",], },
  },
};

function boxWorkflow(title: string,): UiWorkflow {
  return {
    nodes: [
      {
        id: "7",
        type: "PromptBox",
        title,
        inputs: [
          { name: "text", type: "STRING", link: null, widget: { name: "text", }, },
          { name: "strength", type: "FLOAT", link: null, widget: { name: "strength", }, },
          { name: "count", type: "INT", link: null, widget: { name: "count", }, },
          { name: "flag", type: "BOOLEAN", link: null, widget: { name: "flag", }, },
          { name: "preset", type: "COMBO", link: null, widget: { name: "preset", }, },
          { name: "ckpt", type: "COMBO", link: null, widget: { name: "ckpt", }, },
        ],
        widgets_values_named: {
          text: "a cat",
          strength: 0.5,
          count: 4,
          flag: true,
          preset: "fast",
          ckpt: "model.safetensors",
        },
      },
    ],
    links: [],
  };
}

describe("type mapping boundaries", () => {
  it("maps INT/FLOAT/BOOLEAN/STRING with bounds and workflow defaults", () => {
    const workflow = boxWorkflow("[p] box",);
    const [mark,] = collectMarked({ workflow, },);
    if (mark === undefined) { throw new Error("expected a mark",); }
    const taken = new Set<string>();
    const strength = mapSpecToParam(
      {
        marked: { ...mark, inputName: "strength", socketType: "FLOAT", defaultValue: 0.5, label: "strength", },
        snapshot: SNAPSHOT,
      },
      taken,
    );

    expect(strength?.parameter.type,).toBe("number",);
    expect(strength?.parameter.min,).toBe(0,);
    expect(strength?.parameter.max,).toBe(1,);
    expect(strength?.parameter.step,).toBe(0.01,);
    expect(strength?.parameter.default,).toBe(0.5,);
  });

  it("maps static COMBO to select and folder-backed COMBO to runtime string", () => {
    const workflow = boxWorkflow("[p] box",);
    const [mark,] = collectMarked({ workflow, },);
    if (mark === undefined) { throw new Error("expected a mark",); }
    const base = { ...mark, defaultValue: "fast", label: "preset", };
    const preset = mapSpecToParam(
      { marked: { ...base, inputName: "preset", socketType: "COMBO", }, snapshot: SNAPSHOT, },
      new Set<string>(),
    );

    expect(preset?.parameter.type,).toBe("select",);
    expect(preset?.optionSource,).toBe("static",);
    const ckpt = mapSpecToParam(
      {
        marked: { ...base, inputName: "ckpt", socketType: "COMBO", defaultValue: "m.safetensors", },
        snapshot: SNAPSHOT,
      },
      new Set<string>(),
    );

    expect(ckpt?.parameter.type,).toBe("string",);
    expect(ckpt?.optionSource,).toBe("runtime",);
  });

  it("maps IMAGE sockets to image params riding the upload path", () => {
    const workflow: UiWorkflow = {
      nodes: [
        {
          id: "3",
          type: "PhotoLoader",
          title: "[p] source",
          inputs: [{ name: "image", type: "IMAGE", link: null, widget: { name: "image", }, },],
          widgets_values_named: {},
        },
      ],
      links: [],
    };

    const [mark,] = collectMarked({ workflow, },);
    if (mark === undefined) { throw new Error("expected a mark",); }
    const socket = { ...mark, inputName: "image", socketType: "IMAGE", defaultValue: undefined, label: "source", };
    const derived = mapSpecToParam({ marked: socket, snapshot: SNAPSHOT, }, new Set<string>(),);
    expect(derived?.parameter.type,).toBe("image",);
    expect(derived?.parameter.default,).toBe("",);
  });

  it("skips linked inputs and non-widget sockets", () => {
    const workflow = boxWorkflow("[p] box",);
    const node = workflow.nodes?.[0];
    if (node === undefined) { throw new Error("expected a node",); }
    const inputs = [...(node.inputs ?? []),];
    const head = inputs[0];
    if (head === undefined) { throw new Error("expected an input",); }
    const relinked: UiWorkflow = {
      ...workflow,
      nodes: [{ ...node, inputs: [{ name: head.name, type: head.type, link: 9, },], },],
    };

    const marks = collectMarked({ workflow: relinked, },);
    expect(marks.some((mark,) => mark.inputName === "text"),).toBe(false,);
  });
});

describe("sidecar", () => {
  it("rejects unknown override targets", () => {
    const workflow = boxWorkflow("[p] box",);
    const converted = convertWorkflow(workflow, SNAPSHOT,).graph;
    let failure = "no-throw";
    try {
      deriveParameters({
        workflow,
        converted,
        workflowId: "probe",
        snapshot: SNAPSHOT,
        sidecar: { nope: { label: "x", }, },
      },);
    } catch (error) {
      failure = (error as ParameterDerivationError).failure.kind;
    }

    expect(failure,).toBe("unknown-override-target",);
  });

  it("renames, hides, and overrides bounds", () => {
    const renamed = applySidecar({
      parameters: [
        { name: "steps", type: "number", label: "steps", default: 8, },
        { name: "flag", type: "boolean", label: "flag", default: true, },
      ],
      sidecar: { steps: { rename: "sampling_steps", min: 1, max: 50, }, flag: { hide: true, }, },
    },);

    expect(renamed.map((parameter,) => parameter.name),).toEqual(["sampling_steps",],);
    expect(renamed[0]?.min,).toBe(1,);
  });
});

describe("idempotency", () => {
  it("preserves operator labels on re-derivation unless the sidecar changes", () => {
    const workflow = boxWorkflow("[p] box",);
    const converted = convertWorkflow(workflow, SNAPSHOT,).graph;
    const first = deriveParameters({ workflow, converted, workflowId: "probe", snapshot: SNAPSHOT, },);
    const head = first.parameters[0];
    if (head === undefined) { throw new Error("expected a parameter",); }
    const edited = first.parameters.map((parameter,) =>
      parameter.name === head.name ? { ...parameter, label: "Operator label", } : parameter
    );

    const second = deriveParameters({
      workflow,
      converted,
      workflowId: "probe",
      snapshot: SNAPSHOT,
      existing: edited,
    },);

    expect(second.parameters.find((parameter,) => parameter.name === head.name)?.label,).toBe("Operator label",);
    const third = deriveParameters({
      workflow,
      converted,
      workflowId: "probe",
      snapshot: SNAPSHOT,
      existing: edited,
      sidecar: { [head.name]: { label: "Sidecar label", }, },
    },);

    expect(third.parameters.find((parameter,) => parameter.name === head.name)?.label,).toBe("Sidecar label",);
  });

  it("round-trips placeholders through substitution", () => {
    const workflow = boxWorkflow("[p] box",);
    const converted = convertWorkflow(workflow, SNAPSHOT,).graph;
    const derived = deriveParameters({ workflow, converted, workflowId: "probe", snapshot: SNAPSHOT, },);
    const injected = injectPlaceholders({
      graph: converted,
      bindings: [...derived.overrides.entries(),].flatMap(([nodeId, fields,],) =>
        Object.entries(fields,).map(([inputName, placeholder,],) => ({
          nodeId,
          inputName,
          parameterName: placeholder.slice(2, -2,),
        }))
      ),
    },);

    const placeholders = collectPlaceholders(injected,);
    for (const parameter of derived.parameters) {
      expect(placeholders.has(parameter.name,),).toBe(true,);
    }

    const body = injected as unknown as Parameters<typeof substituteWorkflow>[0];
    const vars: Record<string, string | number | boolean> = {};
    for (const parameter of derived.parameters) {
      const value = parameter.default;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        vars[parameter.name] = value;
      }
    }

    const built = substituteWorkflow(body, vars,);
    expect(collectPlaceholders(built,).size,).toBe(0,);
    void buildWorkflowGraph;
  });
});
